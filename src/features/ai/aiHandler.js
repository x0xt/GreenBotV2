import { humanize } from "../../shared/humanize.js";
import { logChat } from '../../lib/chatLogger.js';
// file: src/features/ai/aiHandler.js
import { EmbedBuilder } from 'discord.js';
import { schedule, breakerOpen, recordFailure } from './backpressure.js';
import { ollamaChat } from './ollamaClient.js';
import { shapeWithSeed } from './tone.js';
import { appendUserMemory, readUserMemory } from '../user/userMemory.js';
import { getHistory, pushHistory } from './conversationHistory.js';
import { getDepth, incrementDepth } from './depthTracker.js';
import { checkRage, mirrorSpam } from './spamTracker.js';
import { getRandomImage } from '../media/imagePool.js';
import { safe } from '../../shared/safe.js';
import { SPAMMER_INSULTS, MERGE_WINDOW_MS, IMAGE_ATTEMPT_PROB } from '../../shared/constants.js';
import { notifyTimeout } from '../../shared/notifyTimeout.js';

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

  // light scrubbing to avoid grotesque context injections while preserving attitude
  const content = mergedContent
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/<a?:\w+:\d+>/g, '[emoji]')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<@!?\d+>/g, '')
    .replace(/^!gb\s*/i, '')
    .trim();

  const base = content.slice(0, 1400);
  const userMessage = base || '(empty message)';

  // Spam rage mode — if channel is in rage, mirror back instead of hitting the model
  const rageWord = checkRage(msg.channel.id, msg.author.id);
  if (rageWord) {
    const mirrored = mirrorSpam(rageWord);
    await msg.reply({ content: safe(mirrored), allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    const guildIdSpam = msg.guild?.id ?? null;
    if (!msg.author.bot) logChat(guildIdSpam, msg.author.id, msg.author.username, userMessage, mirrored);
    return;
  }

  const pastSnippet = await readUserMemory(msg.guild?.id ?? null, msg.author.id).catch(() => '');
  const memBlock = pastSnippet
    ? `[things this person has said before — use it against them if you feel like it]\n${pastSnippet}\n\n`
    : '';

  const channelId = msg.channel.id;

  // Build messages array: history + current message
  // Interjections are stateless — no history, just butt in
  const messages = interjecting
    ? [{ role: 'user', content: `${memBlock}[someone just posted this, butt in]\n"${userMessage}"` }]
    : [
        ...getHistory(channelId),
        { role: 'user', content: `${memBlock}${userMessage}` },
      ];

  // 4% chance to just not be bothered — fires before hitting the model
  const DISMISSALS = ['k.', 'lol', 'ok', 'cool', 'k', 'whatever', 'yeah', 'no', 'lmao', 'sure'];
  if (!interjecting && Math.random() < 0.04) {
    const dismissal = DISMISSALS[Math.floor(Math.random() * DISMISSALS.length)];
    await msg.reply({ content: dismissal, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    if (!msg.author.bot) logChat(msg.guild?.id ?? null, msg.author.id, msg.author.username, userMessage, dismissal);
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
      return shapeWithSeed(raw, 1800, `${msg.id}:${msg.author.id}`);
    } catch (e) {
      console.error('OLLAMA ERR:', e);
      recordFailure();
      throw e;
    }
  }).catch(async (err) => {
    const emsg = String(err?.message || err);
    if (emsg.includes('breaker_open')) return 'model is cooling down — try again in a moment.';
    if (emsg.includes('user_queue_full')) return SPAMMER_INSULTS[Math.floor(Math.random() * SPAMMER_INSULTS.length)];
    if (emsg.includes('global_queue_full')) return 'too many requests right now — try again shortly.';
    // timeout / unknown error path: show gif and provide a short fallback
    await notifyTimeout(msg.channel).catch(() => {});
    return 'brain lag — try again in a sec.';
  });

  // Persist memory + log (non-blocking) — skip for bots, privacy policy is human-only
  const guildId = msg.guild?.id ?? null;
  if (!msg.author.bot) {
    appendUserMemory(guildId, msg.author.id, base || mergedContent).catch(() => {});
    logChat(guildId, msg.author.id, msg.author.username, userMessage, reply);
  }

  // Push to conversation history and increment depth
  if (!interjecting) {
    pushHistory(channelId, 'user', userMessage);
    pushHistory(channelId, 'assistant', reply);
    incrementDepth(msg.author.id);
  }

  // Assemble final reply message; include occasional images during interjections
  const options = {
    content: safe(reply || '...'),
    allowedMentions: { parse: [], repliedUser: false },
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
}
