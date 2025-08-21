// file: src/features/media/imageCollector.js
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';

import {
  IMAGE_ALLOWED_EXTENSIONS,
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_POOL_ROOT,
} from '../../shared/constants.js';

import { fetchWithTimeout } from '../../shared/network.js';
import { ensureDir } from '../user/userMemory.js';
import { prunePool } from './imagePool.js';

// ---------- helpers ----------

function contentTypeToExt(ct) {
  if (!ct) return null;
  const base = ct.split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'video/mp4': return '.mp4';
    case 'video/webm': return '.webm';
    case 'video/quicktime': return '.mov';
    default: return null;
  }
}

// strip common trailing punctuation/brackets that cling to pasted URLs
function tidyUrl(u) {
  if (!u) return null;
  // trim whitespace and zero-width junk
  let s = String(u).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');

  // if it's wrapped in <...> from Discord formatting, drop the wrappers
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1);

  // strip trailing paren/brackets/braces/arrows/punct
  s = s.replace(/[)>}\],.!?]+$/, '');

  // extremely common case: a closing bracket stuck on the end
  s = s.replace(/[)>}\]]+$/, '');

  // quick sanity
  try {
    const parsed = new URL(s);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// some services (e.g., Tenor) need a landing-page hop → direct media
async function resolveMediaLandingPage(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // Tenor: prefer direct "media.tenor.com" or "c.tenor.com"
    if (host.endsWith('tenor.com')) {
      if (host.startsWith('media.') || host.startsWith('c.')) return url;

      // fetch HTML and mine OG tags / JSON contentUrl
      const resp = await fetchWithTimeout(url, {}, 8000);
      if (!resp.ok) return null;
      const html = await resp.text();

      // og:video
      const ogVideo = html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogVideo) return ogVideo;

      // og:image
      const ogImage = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogImage) return ogImage;

      // schema.org contentUrl
      const contentUrl = html.match(/"contentUrl"\s*:\s*"([^"]+)"/i)?.[1];
      if (contentUrl) return contentUrl;

      return null;
    }

    // Expandable: handle more hosts if/when you care.
    return url;
  } catch {
    return null;
  }
}

// Try HEAD first to avoid downloading huge files. Fallback to GET if blocked.
async function probe(url) {
  // Some CDNs refuse HEAD; we try it but don’t rely on it.
  try {
    const head = await fetchWithTimeout(url, { method: 'HEAD' }, 7000);
    if (head.ok) {
      const ct = head.headers.get('content-type') || '';
      const len = Number(head.headers.get('content-length'));
      return { ok: true, contentType: ct, contentLength: Number.isFinite(len) ? len : undefined };
    }
  } catch {/* ignore and fall back */}
  return { ok: false };
}

async function saveImageFromUrl(inputUrl) {
  try {
    const cleaned = tidyUrl(inputUrl);
    if (!cleaned) return false;

    const resolved = (await resolveMediaLandingPage(cleaned)) || cleaned;

    // quick preflight
    const head = await probe(resolved);
    if (head.ok) {
      if (head.contentLength !== undefined && head.contentLength > IMAGE_MAX_SIZE_BYTES) {
        console.log(`Skipping large media (HEAD ${(head.contentLength / 1048576).toFixed(2)} MB): ${resolved}`);
        return false;
      }
      const extFromCT = contentTypeToExt(head.contentType);
      if (extFromCT && !IMAGE_ALLOWED_EXTENSIONS.includes(extFromCT)) {
        console.log(`Skipping disallowed content-type ${head.contentType}: ${resolved}`);
        return false;
      }
    }

    // fetch body
    const response = await fetchWithTimeout(resolved, {}, 12000);
    if (!response.ok || !response.body) return false;

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length'));

    if (Number.isFinite(contentLength) && contentLength > IMAGE_MAX_SIZE_BYTES) {
      console.log(`Skipping large media (${(contentLength / 1048576).toFixed(2)} MB): ${resolved}`);
      response.body?.destroy();
      return false;
    }

    // choose extension
    let ext = contentTypeToExt(contentType);
    if (!ext) {
      // derive from URL path if CT didn’t help
      const pathname = new URL(resolved).pathname.split('?')[0].split('#')[0];
      const guessed = path.extname(pathname).toLowerCase();
      if (guessed) ext = guessed;
    }

    if (!ext || !IMAGE_ALLOWED_EXTENSIONS.includes(ext)) {
      response.body?.destroy();
      return false;
    }

    await ensureDir(IMAGE_POOL_ROOT);

    const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    const filepath = path.join(IMAGE_POOL_ROOT, filename);

    await pipeline(response.body, createWriteStream(filepath));
    console.log(`IMAGE: saved ${resolved} → ${filename}`);
    await prunePool();
    return true;
  } catch (e) {
    console.error(`IMAGE ERR: ${inputUrl}`, e?.message || e);
    return false;
  }
}

// ---------- main entry ----------

export async function collectImage(msg) {
  try {
    const urls = new Set();

    // 1) attachments
    
for (const att of [...(msg.attachments?.values?.() ?? [])]) {
      if (att?.url) {
        const u = tidyUrl(att.url);
        if (u) urls.add(u);
      }
    }

    // 2) embeds (images/videos/thumbnails)
    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    for (const emb of embeds) {
      const maybe = emb?.image?.url || emb?.thumbnail?.url || emb?.video?.url;
      const u = tidyUrl(maybe);
      if (u) urls.add(u);
    }

    // 3) plain text URLs
    if (typeof msg.content === 'string' && msg.content) {
      for (const match of msg.content.match(/https?:\/\/\S+/gi) ?? []) {
        const u = tidyUrl(match);
        if (u) urls.add(u);
      }
    }

    if (urls.size === 0) return;

    // try each unique URL until one sticks
    for (const u of urls) {
      if (await saveImageFromUrl(u)) break;
    }
  } catch (err) {
    console.error('collectImage() failed:', err?.message || err);
  }
}
