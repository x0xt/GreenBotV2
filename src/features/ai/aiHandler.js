import { schedule, breakerOpen } from './backpressure.js';
import { ollamaChat } from './ollamaClient.js';
import { shapeWithSeed } from './tone.js';
import { appendUserMemory } from '../user/userMemory.js';
import { getRandomImage } from '../media/imagePool.js';
import { safe } from '../../shared/safe.js';
import { IMAGE_ALLOW_IN_SFW, IMAGE_INTERJECT_PROB, TIMEOUT_INSULTS, SPAMMER_INSULTS, TIMEOUT_ERROR_GIF, MERGE_WINDOW_MS } from '../../shared/constants.js';

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

export async function handleAiChat(msg, interjecting) {
  const mergedContent = await coalesceUserMessage(msg.author.id, (msg.content || '').trim());
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

  if (!breakerOpen()) {
    await msg.channel.sendTyping();
  }

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
          return SPAMMER_INSULTS[Math.floor(Math.random() * SPAMMER_INSULTS.length)];
        return null;
      }
      if (String(err.message).includes('global_queue_full'))
        return 'too many requests right now — try again shortly.';
      return {
        content: TIMEOUT_INSULTS[Math.floor(Math.random() * TIMEOUT_INSULTS.length)],
        file: TIMEOUT_ERROR_GIF
      };
    });
  } catch (e) {
    console.error('SCHEDULE/GEN ERR:', e);
  }

  if (msg.guild) {
    await appendUserMemory(msg.guild.id, msg.author.id, base || mergedContent);
  }

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
}
