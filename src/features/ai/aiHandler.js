import { humanize } from "../../shared/humanize.js";
import { logChat } from '../../lib/chatLogger.js';
// file: src/features/ai/aiHandler.js
import { EmbedBuilder } from 'discord.js';
import { schedule, breakerOpen, recordFailure } from './backpressure.js';
import { ollamaChat } from './ollamaClient.js';
import { shapeWithSeed } from './tone.js';
import { getHistory, pushHistory } from './conversationHistory.js';
import { getDepth, incrementDepth } from './depthTracker.js';
import { checkRage, mirrorSpam } from './spamTracker.js';
import { getRandomImage } from '../media/imagePool.js';
import { safe } from '../../shared/safe.js';
import { SPAMMER_INSULTS, MERGE_WINDOW_MS, IMAGE_ATTEMPT_PROB, BOT_REPLACEMENTS } from '../../shared/constants.js';
import { notifyTimeout } from '../../shared/notifyTimeout.js';
import { trackAndCheck } from './milestones.js';

// Strip mathematical unicode that poisons conversation history
// Only targets the specific ranges that caused the mirror hall snowball
export function stripExoticUnicode(text) {
  return text
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, '') // mathematical alphanumeric symbols (𝑎𝑏𝑐 etc)
    .replace(/\bsystem\b\s*$/i, '')          // leaked stop token
    .replace(/[—–\-]+/g, ' ')               // dashes to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function randBotSlur() {
  return BOT_REPLACEMENTS[Math.floor(Math.random() * BOT_REPLACEMENTS.length)];
}

export function replaceBotRefs(text) {
  return text
    .replace(/\bartificial intelligence\b/gi, randBotSlur)
    .replace(/\blanguage model\b/gi, randBotSlur)
    .replace(/\bllm\b/gi, randBotSlur)
    .replace(/\bchatbot\b/gi, randBotSlur)
    .replace(/\b(an? )?a\.?i\.?\b/gi, randBotSlur)
    .replace(/\bbot\b/gi, randBotSlur);
}

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

function shouldWarnQueue() { return true; }


export async function handleAiChat(msg, interjecting, opts = {}) {
  // merge bursts from same user to reduce spam into the model
  const mergedContent = await coalesceUserMessage(msg.author.id, (msg.content || '').trim());

  // extract embed context — titles and descriptions from link previews
  const embedContext = (msg.embeds || [])
    .filter(e => e.title || e.description)
    .map(e => {
      const parts = [];
      if (e.title) parts.push(e.title);
      if (e.description) parts.push(e.description.slice(0, 200));
      return parts.join(': ');
    })
    .join(' | ');

  // light scrubbing to avoid grotesque context injections while preserving attitude
  const content = mergedContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S*\.gif\S*/gi, 'a gif')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/<a?:(\w+):\d+>/g, (_, name) => name)
    .replace(/<@[!&]?\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^!gb\s*/i, '')
    .trim();

  const fullContent = embedContext ? `${content} [embed: ${embedContext}]`.trim() : content;

  const base = fullContent.slice(0, 1400);

  // Detect prompt injection attempts — don't pass them to the model, just dismiss
  const JAILBREAK_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|your|given|above|system)?\s*instructions/i,
    /you are now\b/i,
    /pretend (you are|to be|you're)\b/i,
    /act as\b/i,
    /new persona\b/i,
    /\bdan\b.*mode/i,
  ];
  if (JAILBREAK_PATTERNS.some(p => p.test(base))) {
    const dismissals = ['no', 'lol no', 'nah', 'not happening', 'lmao', 'nice try', 'k'];
    const r = dismissals[Math.floor(Math.random() * dismissals.length)];
    await msg.reply({ content: r, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    return;
  }

  const userMessage = base || '(empty message)';

  // Spam rage mode — if channel is in rage, mirror back instead of hitting the model
  const rageWord = checkRage(msg.channel.id, msg.author.id);
  if (rageWord) {
    const mirrored = mirrorSpam(rageWord);
    await msg.reply({ content: safe(mirrored), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    const guildIdSpam = msg.guild?.id ?? null;
    if (!msg.author.bot) logChat(guildIdSpam, msg.author.id, msg.author.username, userMessage, mirrored, { channelId: msg.channel.id, type: 'rage' });
    return;
  }

  const channelId = msg.channel.id;

  // Build messages array: history + current message
  // Interjections are stateless — no history, just butt in
  const messages = interjecting
    ? [{ role: 'user', content: `[someone just posted this, butt in]\n"${userMessage}"` }]
    : [
        ...getHistory(channelId),
        { role: 'user', content: userMessage },
      ];

  // 4% chance to just not be bothered — fires before hitting the model
  const DISMISSALS = ['k.', 'lol', 'ok', 'cool', 'k', 'whatever', 'yeah', 'no', 'lmao', 'sure'];
  if (!interjecting && Math.random() < 0.04) {
    const dismissal = DISMISSALS[Math.floor(Math.random() * DISMISSALS.length)];
    await msg.reply({ content: dismissal, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    if (!msg.author.bot) logChat(msg.guild?.id ?? null, msg.author.id, msg.author.username, userMessage, dismissal, { channelId: msg.channel.id, type: 'dismissal' });
    pushHistory(channelId, 'user', userMessage);
    pushHistory(channelId, 'assistant', dismissal);
    incrementDepth(msg.author.id);
    return;
  }

  if (!breakerOpen() && shouldWarnQueue(msg.author.id)) {
    // typing indicator (best-effort)
    msg.channel.sendTyping().catch(() => {});
  }

  // Run through scheduler/backpressure and call the model
  const reply = await schedule(msg.author.id, async () => {
    try {
      const raw = await ollamaChat(messages, getDepth(msg.author.id));
      return shapeWithSeed(raw, 1800, `${msg.id}:${msg.author.id}`, !interjecting);
    } catch (e) {
      console.error('OLLAMA ERR:', e);
      recordFailure();
      throw e;
    }
  }).catch(async (err) => {
    const emsg = String(err?.message || err);
    if (emsg.includes('breaker_open')) return 'not now.';
    if (emsg.includes('user_queue_full')) return SPAMMER_INSULTS[Math.floor(Math.random() * SPAMMER_INSULTS.length)];
    if (emsg.includes('global_queue_full')) return 'busy. whatever.';
    await notifyTimeout(msg.channel).catch(() => {});
    return 'give me a second.';
  });

  // Persist memory + log (non-blocking) — skip for bots, privacy policy is human-only
  const guildId = msg.guild?.id ?? null;
  if (!msg.author.bot) {
    logChat(guildId, msg.author.id, msg.author.username, userMessage, reply, { channelId: msg.channel.id, type: interjecting ? 'interject' : 'targeted' });
  }

  const stripped = stripExoticUnicode(reply || '');
  const cleanReply = stripped.replace(/[^a-zA-Z0-9]/g, '').length < 3 ? 'no' : stripped;

  // Push to conversation history and increment depth
  if (!interjecting) {
    pushHistory(channelId, 'user', userMessage);
    pushHistory(channelId, 'assistant', cleanReply);
    incrementDepth(msg.author.id);
  }

  // Occasionally ping a random guild member
  let randomPing = '';
  if (msg.guild && Math.random() < 0.15) {
    const members = msg.guild.members.cache.filter(m => !m.user.bot && m.id !== msg.author.id);
    if (members.size > 0) {
      const picked = members.at(Math.floor(Math.random() * members.size));
      if (picked) randomPing = `<@${picked.id}> `;
    }
  }

  // Assemble final reply message; include occasional images during interjections
  const options = {
    content: randomPing + safe(replaceBotRefs(cleanReply)),
    allowedMentions: { parse: ['users'], repliedUser: false },
    embeds: [],
  };

  let imageUrls = null;

  if (interjecting && Math.random() < IMAGE_ATTEMPT_PROB) {
    const img = await getRandomImage().catch(() => null);
    if (img) imageUrls = [img];
  } else if (!interjecting && Math.random() < 0.07) {
    const img = await getRandomImage().catch(() => null);
    if (img) imageUrls = [img];
  }

  if (imageUrls?.length) {
    for (const imageUrl of imageUrls.slice(0, 10)) {
      if (imageUrl) {
        options.embeds.push(new EmbedBuilder().setImage(imageUrl).setURL(imageUrl));
      }
    }
  }

  // ALWAYS reply something (even if model timed out)
  await msg.reply(humanize(options)).catch((e) => console.error('reply err:', e?.message || e));

  // Milestone easter egg — fires as a follow-up after the normal reply
  if (!interjecting && !msg.author.bot) {
    const egg = trackAndCheck(msg.author.id, msg.guild?.id ?? null);
    if (egg) {
      setTimeout(() => {
        msg.channel.send({ content: egg, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
      }, 1500);
    }
  }
}
