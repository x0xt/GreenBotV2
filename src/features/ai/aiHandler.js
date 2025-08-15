// file: src/features/ai/aiHandler.js
import { EmbedBuilder } from 'discord.js';
import { schedule, breakerOpen, recordFailure } from './backpressure.js';
import { ollamaChat } from './ollamaClient.js';
import { shapeWithSeed } from './tone.js';
import { appendUserMemory } from '../user/userMemory.js';
import { getRandomImage } from '../media/imagePool.js';
import { generateImage } from './imageGenerator.js';
import { safe } from '../../shared/safe.js';
import { IMAGE_GEN_PHRASES, SPAMMER_INSULTS, MERGE_WINDOW_MS } from '../../shared/constants.js';
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

// keep behavior: warn-queue hook (noop by default)
function shouldWarnQueue() { return true; }

export async function handleAiChat(msg, interjecting) {
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
  const userMessage = base || '(The user sent an empty or nonsensical message. Mock them for it.)';

  const prompt = interjecting
    ? `[You are GreenBot. Interrupt the chat with a hostile, cynical one-liner about this topic:]\n"${userMessage}"`
    : `User's new message: "${userMessage}"`;

  if (!breakerOpen() && shouldWarnQueue(msg.author.id)) {
    // typing indicator (best-effort)
    msg.channel.sendTyping().catch(() => {});
  }

  // Run through scheduler/backpressure and call the model
  const reply = await schedule(msg.author.id, async () => {
    try {
      const raw = await ollamaChat(prompt);
      return shapeWithSeed(raw, 240, `${msg.id}:${msg.author.id}`);
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

  // Persist memory (non-blocking)
  if (msg.guild) {
    appendUserMemory(msg.guild.id, msg.author.id, base || mergedContent).catch(() => {});
  }

  // Assemble final reply message; include occasional images during interjections
  const options = {
    content: safe(reply || '...'),
    allowedMentions: { parse: [], repliedUser: false },
    embeds: [],
  };

  let imageUrls = null;

  if (interjecting) {
    // 15% chance to attempt an image
    if (Math.random() < 0.15) {
      // 80% local pool, 20% OpenAI
      if (Math.random() < 0.80) {
        const img = await getRandomImage().catch(() => null);
        if (img) imageUrls = [img];
      } else {
        const chosenPhrase = IMAGE_GEN_PHRASES[Math.floor(Math.random() * IMAGE_GEN_PHRASES.length)];
        options.content = `${chosenPhrase}\n\n${safe(options.content)}`;
        const generated = await generateImage(userMessage).catch(() => null);
        if (generated?.length) imageUrls = generated;
      }
    }
  }

  if (imageUrls?.length) {
    for (const imageUrl of imageUrls.slice(0, 10)) {
      if (imageUrl) {
        options.embeds.push(new EmbedBuilder().setImage(imageUrl).setURL(imageUrl));
      }
    }
  }

  // ALWAYS reply something (even if model timed out)
  await msg.reply(options).catch((e) => console.error('reply err:', e?.message || e));
}
