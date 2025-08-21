// file: src/events/messageCreate.js
import { Events, ChannelType, EmbedBuilder } from 'discord.js';
import { touchUserMemory } from '../features/user/userMemory.js';
import { handleAiChat } from '../features/ai/aiHandler.js';
import { collectImage } from '../features/media/imageCollector.js';
import { INTERJECT_ENABLED, INTERJECT_PROB, INTERJECT_COOLDOWN_MS, IMAGE_GEN_PHRASES } from '../shared/constants.js';

import { isNonTextPayload } from '../shared/isNonTextPayload.js';
import { isReplyToBot } from '../shared/isReplyToBot.js';
import { cooldownOk, roll } from '../shared/probability.js';
import { getRandomImage } from '../features/media/imagePool.js';
import { generateImage } from '../features/ai/imageGenerator.js';

import { MYSTIQUE_STRICT, MYSTIQUE_EVASIVE_LINES } from "../shared/constants.js";

// NEW: server-about FAQ hook
import { maybeAnswerServerAbout } from '../features/faq/serverAbout.js';

const lastInterjectAt = new Map();
const canInterject = (ch) => (Date.now() - (lastInterjectAt.get(ch) ?? 0)) >= INTERJECT_COOLDOWN_MS;
const markInterject = (ch) => lastInterjectAt.set(ch, Date.now());

const MEDIA_REPLY_PROB = Number(process.env.REPLY_TO_MEDIA_PROB ?? 0.4);
const MEDIA_REPLY_COOLDOWN_MS = Number(process.env.REPLY_TO_MEDIA_COOLDOWN_MS ?? 8000);
const MEDIA_COOLDOWN_BUCKET = 'media-reply';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(msg) {
  try {
    if (msg.author?.bot) return;
  // direct Q: dodge instead of admitting/denying (mystique-evasive)
  try {
    const txt = String(msg.content || "");
    if (MYSTIQUE_STRICT && /(\bare you (a )?bot\b|\bare you human\b)/i.test(txt)) {
      const lines = Array.isArray(MYSTIQUE_EVASIVE_LINES) && MYSTIQUE_EVASIVE_LINES.length ? MYSTIQUE_EVASIVE_LINES : ["who’s asking?"];
      const pick = lines[Math.floor(Math.random() * lines.length)];
      void msg.reply(pick);
      return;
    }
  } catch {}
  // direct Q: are you a bot?
  try {
    const txt = String(msg.content || "");
    if (/(?:\bare you (a )?bot\b|\bare you human\b)/i.test(txt)) {
      void msg.reply("BOT? LOL. no. If i was a bOt explain how i sneed your momlol loo ol");
      return;
    }
  } catch {}

    // Non-blocking side effects
    Promise.allSettled([
      collectImage(msg),
      touchUserMemory(msg.guild?.id, msg.author.id, msg.author.username),
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

    // 🔎 EARLY: FAQ catcher for “what is this server about?”
    if (await maybeAnswerServerAbout(msg)) return;

    // Tone ON only when targeted
    const targeted = inDM || mentioned || repliedTo;

    // Ambient interjects only on media (never plain text)
    let interjecting = false;
    if (!targeted && INTERJECT_ENABLED && isNonTextPayload(msg) && msg.guild && canInterject(msg.channel.id) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channel.id);
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

        if (Math.random() < 0.2) {
          const imgPath = await getRandomImage().catch(() => null);
          if (imgPath) imageUrls = [imgPath];
        } else {
          if (Array.isArray(IMAGE_GEN_PHRASES) && IMAGE_GEN_PHRASES.length) {
            const phrase = IMAGE_GEN_PHRASES[Math.floor(Math.random() * IMAGE_GEN_PHRASES.length)];
            await msg.channel.send(phrase).catch(() => {});
          }
          const generated = await generateImage('random chaos').catch(() => null);
          if (generated?.length) imageUrls = generated;
        }

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
