// file: src/events/messageCreate.js
import { Events, ChannelType, EmbedBuilder } from 'discord.js';
import { handleAiChat } from '../features/ai/aiHandler.js';
import { collectImage } from '../features/media/imageCollector.js';
import { INTERJECT_ENABLED, INTERJECT_PROB, INTERJECT_COOLDOWN_MS, BEEPY_ID } from '../shared/constants.js';
import { recordMessage, mirrorSpam } from '../features/ai/spamTracker.js';
import { safe } from '../shared/safe.js';
import { logChat } from '../lib/chatLogger.js';

import { isNonTextPayload } from '../shared/isNonTextPayload.js';
import { isReplyToBot } from '../shared/isReplyToBot.js';
import { cooldownOk, roll } from '../shared/probability.js';
import { getRandomImage } from '../features/media/imagePool.js';

import { MYSTIQUE_EVASIVE_LINES } from '../shared/constants.js';



const lastInterjectAt = new Map();
const canInterject = (ch) => (Date.now() - (lastInterjectAt.get(ch) ?? 0)) >= INTERJECT_COOLDOWN_MS;
const markInterject = (ch) => lastInterjectAt.set(ch, Date.now());

const MEDIA_REPLY_PROB = Number(process.env.REPLY_TO_MEDIA_PROB ?? 0.2);
const MEDIA_REPLY_COOLDOWN_MS = Number(process.env.REPLY_TO_MEDIA_COOLDOWN_MS ?? 8000);
const MEDIA_COOLDOWN_BUCKET = 'media-reply';
const MAIN_CHANNEL_ID = process.env.MAIN_CHANNEL_ID ?? null;

export const name = Events.MessageCreate;
export const once = false;

export async function execute(msg) {
  try {
    if (msg.author?.id === msg.client.user?.id) return; // never reply to itself
    const isBot = msg.author?.bot ?? false;

    // Track spam buildup for every non-bot message
    if (!isBot && msg.guild) {
      const { shouldMirrorUnprompted, word } = recordMessage(msg.channel.id, msg.author.id, msg.content ?? '');
      if (shouldMirrorUnprompted && word) {
        const mirrored = mirrorSpam(word);
        await msg.channel.send(safe(mirrored)).catch(() => {});
        logChat(msg.guild?.id ?? null, msg.author.id, msg.author.username, msg.content ?? '', mirrored, { channelId: msg.channel.id, type: 'spam-mirror' }).catch(() => {});
        return;
      }
    }

    // Non-blocking side effects
    Promise.allSettled([
      collectImage(msg),
    ]);

    const raw = (msg.content ?? '').trim();
    const inDM = msg.channel?.type === ChannelType.DM;
    const mentioned = msg.mentions?.has?.(msg.client.user) ?? false;
    const repliedTo = await isReplyToBot(msg);

    // Legacy prefix nudge
    if (raw.startsWith('!gb') || /^!\w+/.test(raw)) {
      void msg.reply({
        content: 'Use slash commands now → try **`/health`**, **`/suggest`**.',
        allowedMentions: { parse: [], repliedUser: false },
      });
      return;
    }

    // Tone ON only when targeted
    const targeted = inDM || mentioned || repliedTo;

    // direct reply but not a mention/DM — 10% chance to just ghost them
    if (repliedTo && !mentioned && !inDM && Math.random() < 0.10) return;

    // "are you a bot" dodge — only fires when the message is directed at greenbot
    if (targeted) {
      const txt = String(msg.content || '');
      if (/\bare you (a )?bot\b|\bare you (a )?human\b/i.test(txt)) {
        const lines = Array.isArray(MYSTIQUE_EVASIVE_LINES) && MYSTIQUE_EVASIVE_LINES.length ? MYSTIQUE_EVASIVE_LINES : ["who's asking?"];
        const evasion = lines[Math.floor(Math.random() * lines.length)];
        void msg.reply(evasion);
        logChat(msg.guild?.id ?? null, msg.author.id, msg.author.username, txt, evasion, { channelId: msg.channel.id, type: 'bot-dodge' }).catch(() => {});
        return;
      }
    }

    // Beepy gets picked on randomly — 10% chance greenbot fires back unprompted
    if (isBot && msg.author.id === BEEPY_ID && !targeted && Math.random() < 0.10) {
      await handleAiChat(msg, false, { useTone: true });
      return;
    }

    // Ambient interjects only on media, never on other bots (loop prevention)
    let interjecting = false;
    if (!targeted && !isBot && INTERJECT_ENABLED && isNonTextPayload(msg) && msg.guild && (!MAIN_CHANNEL_ID || msg.channel.id === MAIN_CHANNEL_ID) && canInterject(msg.channel.id) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channel.id);
    }

    // Unprompted summon — tiny chance to butt into any text message
    if (!targeted && !interjecting && !isBot && msg.guild && raw.length > 0 && (!MAIN_CHANNEL_ID || msg.channel.id === MAIN_CHANNEL_ID) && Math.random() < 0.004) {
      interjecting = true;
    }

    if (targeted || interjecting) {
      await handleAiChat(msg, interjecting, { useTone: targeted });
      return;
    }

    // ===== media reaction logic (40%) — unchanged =====
    if (isNonTextPayload(msg)) {
      const cooled = cooldownOk(msg.channelId, MEDIA_REPLY_COOLDOWN_MS, MEDIA_COOLDOWN_BUCKET);
      const lucky = roll(MEDIA_REPLY_PROB);

      if (cooled && lucky) {
        let imageUrls = null;
        const imgPath = await getRandomImage().catch(() => null);
        if (imgPath) imageUrls = [imgPath];

        if (imageUrls?.length) {
          for (const u of imageUrls.slice(0, 3)) {
            try {
              if (typeof u === 'string' && u.startsWith('http')) {
                await msg.channel.send({ embeds: [new EmbedBuilder().setImage(u).setURL(u)] });
              } else {
                await msg.channel.send({ files: [u] });
              }
            } catch {/* ignore */}
          }
        }
      }
    }
  } catch (outer) {
    console.error('HANDLER ERR:', outer);
  }
}
