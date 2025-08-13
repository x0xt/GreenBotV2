import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';

// -------------------- env --------------------
const {
  DISCORD_TOKEN,
  OLLAMA_HOST = 'http://127.0.0.1:11434',
  MODEL = 'greenbot',
  OWNER_ID,
} = process.env;

if (!DISCORD_TOKEN) {
  console.error('FATAL: DISCORD_TOKEN missing in env');
  process.exit(1);
}

// -------------------- global safety nets & shutdown --------------------
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

const shutdown = (sig) => () => {
  console.log(`\n${sig} received, shutting down…`);
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

// -------------------- network utilities --------------------
// Node 18+ has global fetch; this helper adds a timeout to it.
function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal })
    .finally(() => clearTimeout(t));
}

// -------------------- image system settings --------------------
const IMAGE_POOL_ROOT = path.resolve('./medias/pool');
const IMAGE_POOL_MAX_FILES = 100;            // keep ~100 most recent
const IMAGE_INTERJECT_PROB = 0.05;           // 1 in 20 replies attach a random saved media
const IMAGE_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const IMAGE_ALLOW_IN_SFW = false;            // only attach in NSFW channels unless you flip this
const IMAGE_ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'
];

// -------------------- anti-spam / backpressure knobs --------------------
const PER_USER_MAX_INFLIGHT = 1;
const PER_USER_MAX_QUEUE = 10;
const GLOBAL_MAX_INFLIGHT = 1;
const GLOBAL_MAX_QUEUE = 64;
const REQ_TIMEOUT_MS = 180_000;
const BREAKER_WINDOW_MS = 30_000;
const BREAKER_FAILS = 3;
const BREAKER_COOLDOWN_MS = 15_000;
const MERGE_WINDOW_MS = 250;

// -------------------- interject settings --------------------
const INTERJECT_ENABLED = true;
const INTERJECT_PROB = 0.05;
const INTERJECT_COOLDOWN_MS = 120_000;
const lastInterjectAt = new Map();
const canInterject = (ch) => (Date.now() - (lastInterjectAt.get(ch) ?? 0)) >= INTERJECT_COOLDOWN_MS;
const markInterject = (ch) => lastInterjectAt.set(ch, Date.now());

// -------------------- reply shaping (with deterministic tone) --------------------
function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd01(seed) {
  let x = seed || 123456789;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}

function spongeCaseSeeded(text, seed) {
  let x = hash32(seed);
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += next() < 0.5 ? text[i].toUpperCase() : text[i].toLowerCase();
  }
  return out;
}

function shapeWithSeed(text, max = 240, seedStr) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const r = rnd01(hash32(seedStr));

  if (r < 0.2) { t = t.toUpperCase(); } 
  else if (r < 0.4) { t = spongeCaseSeeded(t, seedStr); }
  else { t = t.toLowerCase(); }

  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return (end > 40 ? cut.slice(0, end + 1) : cut).trim();
}

// -------------------- memory --------------------
const MEMORY_ROOT = path.resolve('./memory');
const MAX_LINES = 300;
const SNIPPET_LINES = 40;

async function ensureDir(dir) { try { await fs.mkdir(dir, { recursive: true }); } catch {} }
function guildDir(guildId) { return path.join(MEMORY_ROOT, guildId ?? 'dm'); }
function userFilePath(guildId, userId) { return path.join(guildDir(guildId), `${userId}.txt`); }

async function touchUserMemory(guildId, userId, username) {
  const gdir = guildDir(guildId);
  const file = userFilePath(guildId, userId);
  try {
    await fs.mkdir(gdir, { recursive: true });
    try { await fs.access(file); }
    catch {
      const fh = await fs.open(file, 'a'); await fh.close();
      const header = `# User Notes for ${username} (${userId})\n---\n`;
      await fs.appendFile(file, header, 'utf8');
      console.log(`MEMTOUCH ${file}`);
    }
  } catch (e) { console.error(`MEMTOUCH ERR ${file}:`, e); }
}

async function readUserMemory(guildId, userId) {
  const file = userFilePath(guildId, userId);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.access(file); } catch { return ''; }
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-SNIPPET_LINES).join('\n');
  } catch (e) { console.error(`MEMREAD ERR ${file}:`, e); return ''; }
}

async function appendUserMemory(guildId, userId, userMsg) {
  const file = userFilePath(guildId, userId);
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const entry = `${String(userMsg).replace(/\s+/g, ' ').slice(0, 400)}\n`;
    let existing = '';
    try { existing = await fs.readFile(file, 'utf8'); } catch {}
    const lines = (existing + entry).split('\n').filter(Boolean);
    const trimmed = lines.slice(-MAX_LINES).join('\n') + '\n';
    await fs.writeFile(file, trimmed, 'utf8');
    console.log(`MEMWRITE ${file} (now ~${lines.length} lines)`);
  } catch (e) { console.error(`MEM APPEND ERR ${file}:`, e); }
}

// -------------------- image pool utilities --------------------
async function getPoolFiles() {
  try {
    await ensureDir(IMAGE_POOL_ROOT);
    return await fs.readdir(IMAGE_POOL_ROOT);
  } catch {
    return [];
  }
}

async function getRandomImage() {
  const files = await getPoolFiles();
  if (files.length === 0) return null;
  const randomFile = files[Math.floor(Math.random() * files.length)];
  return path.join(IMAGE_POOL_ROOT, randomFile);
}

async function prunePool() {
  const files = await getPoolFiles();
  if (files.length > IMAGE_POOL_MAX_FILES) {
    console.log(`Pruning image pool (size ${files.length} > max ${IMAGE_POOL_MAX_FILES})...`);
    const filesWithStats = await Promise.all(
      files.map(async (file) => ({
        name: file,
        path: path.join(IMAGE_POOL_ROOT, file),
        stats: await fs.stat(path.join(IMAGE_POOL_ROOT, file)),
      }))
    );
    // delete the oldest first
    filesWithStats.sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs);
    const toDelete = filesWithStats.slice(0, files.length - IMAGE_POOL_MAX_FILES);
    for (const file of toDelete) {
      try { await fs.unlink(file.path); console.log(`Pruned: ${file.name}`); }
      catch (e) { console.error(`Failed to prune ${file.name}:`, e); }
    }
  }
}

// map content-type to a sane extension
function contentTypeToExt(ct) {
  if (!ct) return null;
  ct = ct.split(';')[0].trim().toLowerCase();
  switch (ct) {
    case 'image/jpeg': return '.jpg';
    case 'image/png':  return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif':  return '.gif';
    case 'video/mp4':  return '.mp4';
    case 'video/webm': return '.webm';
    case 'video/quicktime': return '.mov';
    default: return null;
  }
}

// Try to turn “page” links into direct media:
//  - Tenor “view” pages -> scrape og:video/og:image
async function resolveMediaLandingPage(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();

    // Only handle Tenor HTML pages here
    if (hostname.endsWith('tenor.com')) {
      // If it's already media.tenor.com/c.tenor.com, don't treat as landing page
      if (hostname.startsWith('media.') || hostname.startsWith('c.')) return url;

      const resp = await fetchWithTimeout(url, {}, 8000);
      if (!resp.ok) return null;
      const html = await resp.text();

      // Try og:video first (usually mp4), then og:image (gif)
      const ogVideo = html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogVideo) return ogVideo;

      const ogImage = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogImage) return ogImage;

      // Fallback: look for "contentUrl"
      const contentUrl = html.match(/"contentUrl"\s*:\s*"([^"]+)"/i)?.[1];
      if (contentUrl) return contentUrl;

      return null;
    }

    return url; // not a known landing page
  } catch {
    return null;
  }
}

// Normalize URL and decide if it’s likely media
// - allow Discord CDN even if no extension (we'll sniff headers)
// - allow Tenor media hosts (media.tenor.com, c.tenor.com)
// - otherwise require a known extension (querystring ignored)
function isLikelyMediaUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    const ext = path.extname(pathname.split('?')[0].split('#')[0]);

    if (host.endsWith('discordapp.com') || host.endsWith('discord.com')) {
      // discord attachments often have ?params; accept and sniff content-type later
      return true;
    }
    if (host.endsWith('media.tenor.com') || host.startsWith('c.tenor.com')) {
      return true;
    }
    // otherwise require a whitelisted extension
    return IMAGE_ALLOWED_EXTENSIONS.includes(ext);
  } catch {
    return false;
  }
}

// Save after resolving landing pages and sniffing Content-Type for extension
async function saveImageFromUrl(url) {
  try {
    // Resolve tenor view pages to direct media first
    const resolved = await resolveMediaLandingPage(url) || url;

    // First try a HEAD to get type & size without downloading
    let head;
    try {
      head = await fetchWithTimeout(resolved, { method: 'HEAD' }, 8000);
    } catch { /* some hosts block HEAD; we’ll try GET */ }

    let contentLength = head?.ok ? Number(head.headers.get('content-length')) : NaN;
    let contentType   = head?.ok ? head.headers.get('content-type') : null;

    if (!Number.isFinite(contentLength) || !contentType) {
      // fallback to GET but don’t stream to disk yet; we’ll stream directly if okay
      const probe = await fetchWithTimeout(resolved, {}, 12000);
      if (!probe.ok) return false;

      contentType = contentType || probe.headers.get('content-type') || '';
      contentLength = Number.isFinite(contentLength)
        ? contentLength
        : Number(probe.headers.get('content-length'));

      if (Number.isFinite(contentLength) && contentLength > IMAGE_MAX_SIZE_BYTES) {
        console.log(`Skipping large media (${(contentLength / 1024 / 1024).toFixed(2)} MB): ${resolved}`);
        probe.body?.cancel?.();
        return false;
      }

      const extFromCT = contentTypeToExt(contentType) ||
        path.extname(new URL(resolved).pathname.split('?')[0].split('#')[0]).toLowerCase() ||
        '.bin';

      await ensureDir(IMAGE_POOL_ROOT);
      const filename = `${crypto.randomBytes(16).toString('hex')}${extFromCT}`;
      const filepath = path.join(IMAGE_POOL_ROOT, filename);

      await pipeline(probe.body, createWriteStream(filepath));
      console.log(`IMAGE GRAB: Saved ${resolved} to ${filename}`);
      await prunePool();
      return true;
    }

    // We have HEAD info; enforce size limit before downloading
    if (Number.isFinite(contentLength) && contentLength > IMAGE_MAX_SIZE_BYTES) {
      console.log(`Skipping large media (${(contentLength / 1024 / 1024).toFixed(2)} MB): ${resolved}`);
      return false;
    }

    const extFromCT = contentTypeToExt(contentType) ||
      path.extname(new URL(resolved).pathname.split('?')[0].split('#')[0]).toLowerCase() ||
      '.bin';

    const getResp = await fetchWithTimeout(resolved, {}, 15000);
    if (!getResp.ok) return false;

    await ensureDir(IMAGE_POOL_ROOT);
    const filename = `${crypto.randomBytes(16).toString('hex')}${extFromCT}`;
    const filepath = path.join(IMAGE_POOL_ROOT, filename);

    await pipeline(getResp.body, createWriteStream(filepath));
    console.log(`IMAGE GRAB: Saved ${resolved} to ${filename}`);
    await prunePool();
    return true;
  } catch (e) {
    console.error(`IMAGE GRAB ERR: Failed to download ${url}:`, e?.message || e);
    return false;
  }
}


// -------------------- discord client --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});
client.on('error', (e) => console.error('discord client error:', e));

client.once('ready', async () => {
  await ensureDir(MEMORY_ROOT);
  await ensureDir(IMAGE_POOL_ROOT);
  try {
    const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`, {}, 5000);
    console.log(`Ollama health: ${r.ok ? 'OK' : `FAIL (${r.status})`}`);
  } catch (e) {
    console.warn('Ollama not reachable at startup:', e?.message || e);
  }
  console.log(`Logged in as ${client.user.tag} (MODEL=${MODEL}, HOST=${OLLAMA_HOST})`);
});

// -------------------- circuit breaker + metrics --------------------
let globalInFlight = 0;
let breakerTrippedUntil = 0;
const recentFailures = [];

function recordFailure() {
  const now = Date.now();
  recentFailures.push(now);
  while (recentFailures.length && (now - recentFailures[0]) > BREAKER_WINDOW_MS) recentFailures.shift();
  if (recentFailures.length >= BREAKER_FAILS) {
    const jitter = Math.floor(Math.random() * 4000);
    breakerTrippedUntil = now + BREAKER_COOLDOWN_MS + jitter;
    console.warn(`CIRCUIT BREAKER TRIPPED for ${breakerTrippedUntil - now}ms`);
  }
}
function breakerOpen() { return Date.now() < breakerTrippedUntil; }

// -------------------- per-user buckets + global queue --------------------
const buckets = new Map();
const globalQueue = [];

function schedule(userId, taskFn) {
  return new Promise((resolve, reject) => {
    if (breakerOpen()) {
      console.warn('breaker_open: rejecting request (cooling down)');
      return reject(new Error('breaker_open'));
    }
    const b = buckets.get(userId) ?? { inFlight: 0, queue: [] };
    buckets.set(userId, b);
    if (b.inFlight >= PER_USER_MAX_INFLIGHT) {
      if (b.queue.length >= PER_USER_MAX_QUEUE) return reject(new Error('user_queue_full'));
      b.queue.push(() => runUserTask(userId, b, taskFn).then(resolve, reject));
      return;
    }
    runUserTask(userId, b, taskFn).then(resolve, reject);
  });
}

function runUserTask(userId, b, taskFn) {
  return new Promise((resolve, reject) => {
    if (globalInFlight >= GLOBAL_MAX_INFLIGHT) {
      if (globalQueue.length >= GLOBAL_MAX_QUEUE) return reject(new Error('global_queue_full'));
      globalQueue.push({ run: () => runUserTask(userId, b, taskFn).then(resolve, reject), reject });
      return;
    }
    globalInFlight++;
    b.inFlight++;
    taskFn().then(resolve, reject).finally(() => {
      b.inFlight--;
      globalInFlight--;
      const nextUser = b.queue.shift();
      if (nextUser) {
        if (globalInFlight >= GLOBAL_MAX_INFLIGHT) {
          if (globalQueue.length < GLOBAL_MAX_QUEUE) globalQueue.push({ run: nextUser, reject: () => {} });
        } else {
          nextUser();
        }
      } else {
        const g = globalQueue.shift();
        if (g) g.run();
      }
    });
  });
}

// -------------------- ollama --------------------
async function ollamaChat(text) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: text }],
        stream: false,
        keep_alive: '30m',
        options: { num_predict: 192 }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ollama ${res.status} ${res.statusText} :: ${body}`);
    }
    const data = await res.json().catch(e => { throw new Error(`ollama JSON parse error :: ${e?.message || e}`); });
    const out = data?.message?.content ?? '';
    return (out || '…').slice(0, 1900).trim();
  } finally {
    clearTimeout(t);
  }
}

// -------------------- micro coalescer per user --------------------
const lastMsgBuffer = new Map();
function coalesceUserMessage(userId, newContent) {
  const prev = lastMsgBuffer.get(userId);
  if (prev) {
    prev.content += '\n' + newContent;
    clearTimeout(prev.timer);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const entry = lastMsgBuffer.get(userId);
      lastMsgBuffer.delete(userId);
      resolve(entry?.content ?? newContent);
    }, MERGE_WINDOW_MS);
    lastMsgBuffer.set(userId, { content: (prev?.content ?? newContent), timer });
  });
}

// -------------------- message handler --------------------
const lastQueueWarnAt = new Map();
function shouldWarnQueue(userId, ms = 3000) {
  const now = Date.now();
  const last = lastQueueWarnAt.get(userId) || 0;
  if (now - last >= ms) {
    lastQueueWarnAt.set(userId, now);
    return true;
  }
  return false;
}

const safe = (s) => String(s || '')
  .replace(/@everyone/g, '@\u200beveryone')
  .replace(/@here/g, '@\u200bhere');

client.on('messageCreate', async (msg) => {
  try {
    // ------- Auto-grab images from chat -------
    if (!msg.author.bot) {
      const imageUrls = [];

      // 1) Attachments (Discord CDN)
      for (const att of msg.attachments.values()) {
        if (att?.url) imageUrls.push(att.url);
      }

      // 2) Any http(s) URL in the message (filter/resolve later)
      const rawUrls = (msg.content.match(/https?:\/\/\S+/gi) || [])
        .map(s => s.replace(/[)>}\]]+$/, '')); // strip trailing punctuation

      const isLikelyMediaUrl = (u) => {
        try {
          const { hostname, pathname } = new URL(u);
          const ext = pathname.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/);
          if (ext) return true;
          // discord cdn & gif cdns often lack clean ext in query; allow
          if (hostname.includes('discordapp.com') || hostname.includes('discord.com')) return true;
          if (hostname.includes('tenor.co') || hostname.includes('tenor.com')) return true;
          return false;
        } catch { return false; }
      };

      for (const u of rawUrls) {
        if (u.includes('tenor.com/')) {
          imageUrls.push(u);
        } else if (isLikelyMediaUrl(u)) {
          imageUrls.push(u);
        }
      }

      // Try to save at least one
      for (const url of imageUrls) {
        if (await saveImageFromUrl(url)) break;
      }
    }

    const timeoutInsults = [
      "my brain is melting from your stupid request. try again later, moron.",
      "the gears are grinding. either that was a dumb question or the server is on fire. probably both.",
      "processing that garbage literally broke me. good job, genius.",
      "i'm too busy for this nonsense. ask me again when you have something interesting to say.",
      "error: user is too boring. system shutting down."
    ];
    const spammerInsults = [
      "whoa, slow down there, fuckwad. you ain't that important.",
      "spamming isn't a personality trait, it's a cry for help. get one.",
      "are you trying to DDoS my brain with your bullshit? knock it off.",
      "you're sending messages faster than your last two brain cells can fire. chill out."
    ];

    if (msg.author.bot) return;
    await touchUserMemory(msg.guild?.id, msg.author.id, msg.author.username);

    const rawContent = (msg.content || '').trim();
    const inDM = msg.channel?.type === ChannelType.DM;
    const targeted =
      inDM ||
      msg.mentions.users?.has?.(client.user.id) ||
      rawContent.toLowerCase().startsWith('!gb ');

    let interjecting = false;
    if (!targeted && INTERJECT_ENABLED && msg.guild && canInterject(msg.channelId) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channelId);
    }
    if (!targeted && !interjecting) return;

    // ---- admin image commands ----
    if (rawContent.toLowerCase().startsWith('!gb img')) {
      if (msg.author.id !== OWNER_ID)
        return msg.reply({ content: 'only my master can use these commands.', allowedMentions: { parse: [], repliedUser: false } });

      const sub = rawContent.split(/\s+/)[2]?.toLowerCase();
      if (sub === 'add') {
        const url = rawContent.split(/\s+/)[3];
        if (!url) return msg.reply({ content: 'you forgot the url, idiot.', allowedMentions: { parse: [], repliedUser: false } });
        const success = await saveImageFromUrl(url);
        return msg.reply({ content: success ? 'image added.' : 'failed to add image. is it a valid link?', allowedMentions: { parse: [], repliedUser: false } });
      }
      if (sub === 'count') {
        const files = await getPoolFiles();
        return msg.reply({ content: `image pool contains ${files.length} files.`, allowedMentions: { parse: [], repliedUser: false } });
      }
      if (sub === 'purge') {
        const files = await getPoolFiles();
        let deletedCount = 0;
        for (const file of files) {
          try { await fs.unlink(path.join(IMAGE_POOL_ROOT, file)); deletedCount++; } catch {}
        }
        return msg.reply({ content: `purged ${deletedCount} images from the pool.`, allowedMentions: { parse: [], repliedUser: false } });
      }
    }

    // ---- health/mem commands ----
    if (rawContent.toLowerCase().startsWith('!gb health')) {
      return msg.reply({
        content: "```json\n" + JSON.stringify({
          globalInFlight,
          globalQueue: globalQueue.length,
          breakerOpen: breakerOpen(),
          breakerTrippedUntil: breakerTrippedUntil > 0 ? new Date(breakerTrippedUntil).toISOString() : 'N/A',
          perUserInFlight: (buckets.get(msg.author.id)?.inFlight ?? 0),
          perUserQueue: (buckets.get(msg.author.id)?.queue.length ?? 0)
        }, null, 2) + "\n```",
        allowedMentions: { parse: [], repliedUser: false }
      });
    }

    if (rawContent.toLowerCase().startsWith('!gb mem')) {
      const sub = rawContent.split(/\s+/)[2]?.toLowerCase();
      const file = userFilePath(msg.guild?.id, msg.author.id);
      if (sub === 'show') {
        try {
          await ensureDir(path.dirname(file));
          try { await fs.access(file); } catch { return msg.reply({ content: 'no notes.', allowedMentions: { parse: [], repliedUser: false } }); }
          const raw = await fs.readFile(file, 'utf8');
          const tail = raw.split('\n').slice(-SNIPPET_LINES).join('\n').trim();
          const content = tail ? `\`\`\`\n${tail}\n\`\`\`` : 'no notes.';
          return msg.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
        } catch {
          return msg.reply({ content: 'no notes.', allowedMentions: { parse: [], repliedUser: false } });
        }
      }
      if (sub === 'clear') {
        try { await fs.unlink(file); } catch {}
        return msg.reply({ content: 'notes wiped.', allowedMentions: { parse: [], repliedUser: false } });
      }
    }

    // ---- build prompt ----
    const mergedContent = await coalesceUserMessage(msg.author.id, rawContent);
    const content = (mergedContent || '')
      .replace(/```[\s\S]*?```/g, '[code]')
      .replace(/https?:\/\/\S+/g, '[link]')
      .replace(/<a?:\w+:\d+>/g, '[emoji]')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/<@!?\d+>/g, '')
      .replace(/^!gb\s*/i, '')
      .trim();
    const base = content.slice(0, 1400);

    const userMessage = base || '(The user sent an empty or nonsensical message. Mock them for it.)';
    const prompt = interjecting
      ? `[You are GreenBot. Interrupt the chat with a hostile, cynical one-liner about this topic:]\n"${userMessage}"`
      : `User's new message: "${userMessage}"`;

    if (!breakerOpen()) await msg.channel.sendTyping();

    // ---- generate reply (queued) ----
    let reply;
    try {
      reply = await schedule(msg.author.id, async () => {
        try {
          const raw = await ollamaChat(prompt);
          return shapeWithSeed(raw, 240, `${msg.id}:${msg.author.id}`);
        } catch (e) {
          const s = String(e?.message || e).toLowerCase();
          if (s.includes('abort') || s.includes('timeout') || s.includes('etimedout') || s.includes('econnrefused') || s.includes('econnreset')) {
            recordFailure();
          }
          console.error('OLLAMA ERR:', e);
          throw e;
        }
      }).catch((err) => {
        if (String(err.message).includes('breaker_open'))
          return 'model is cooling down — try again in a moment.';
        if (String(err.message).includes('user_queue_full')) {
          if (shouldWarnQueue(msg.author.id))
            return spammerInsults[Math.floor(Math.random() * spammerInsults.length)];
          return null;
        }
        if (String(err.message).includes('global_queue_full'))
          return 'too many requests right now — try again shortly.';
        return {
          content: timeoutInsults[Math.floor(Math.random() * timeoutInsults.length)],
          file: './medias/lobotomy.gif'
        };
      });
    } catch (e) {
      console.error('SCHEDULE/GEN ERR:', e);
    }

    // ---- persist memory + send ----
    try {
      if (msg.guild) await appendUserMemory(msg.guild.id, msg.author.id, base || rawContent);

      if (!reply) return;

      if (typeof reply === 'string') {
        const options = { content: safe(reply), allowedMentions: { parse: [], repliedUser: false } };
        const isNsfwChannel = msg.channel.nsfw;
        if ((IMAGE_ALLOW_IN_SFW || isNsfwChannel) && Math.random() < IMAGE_INTERJECT_PROB) {
          const img = await getRandomImage();
          if (img) options.files = [img];
        }
        await msg.reply(options);
      } else if (reply && reply.content) {
        await msg.reply({ content: safe(reply.content), files: [reply.file], allowedMentions: { parse: [], repliedUser: false } });
      }
    } catch (err) {
      console.error('Error in messageCreate handler:', err);
    }
  } catch (outer) {
    console.error('HANDLER ERR:', outer);
  }
}); // <-- single, final close of the event handler


// -------------------- main execution --------------------
async function main() {
  try {
    console.log('Logging in...');
    await client.login(DISCORD_TOKEN);
  } catch (error) {
    console.error('FATAL: Failed to log in. Is your DISCORD_TOKEN correct?', error);
    process.exit(1);
  }
}
main();
setInterval(() => {}, 1 << 30); // Keep the process alive
