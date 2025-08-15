// file: src/events/messageCreate.js
import { Events, ChannelType } from 'discord.js';
import { touchUserMemory } from '../features/user/userMemory.js';
import { handleAiChat } from '../features/ai/aiHandler.js';
import { collectImage } from '../features/media/imageCollector.js';
import { INTERJECT_ENABLED, INTERJECT_PROB, INTERJECT_COOLDOWN_MS } from '../shared/constants.js';

const lastInterjectAt = new Map();
const canInterject = (ch) => (Date.now() - (lastInterjectAt.get(ch) ?? 0)) >= INTERJECT_COOLDOWN_MS;
const markInterject = (ch) => lastInterjectAt.set(ch, Date.now());

export const name = Events.MessageCreate;
export const once = false;

export async function execute(msg) {
  try {
    if (msg.author?.bot) return;

    // --- non-blocking side-effects (do not stall chat if these hang/fail) ---
    Promise.allSettled([
      collectImage(msg),
      touchUserMemory(msg.guild?.id, msg.author.id, msg.author.username),
    ]);

    const raw = (msg.content ?? '').trim();
    const inDM = msg.channel?.type === ChannelType.DM;
    const mentioned = msg.mentions?.has?.(msg.client.user) ?? false;

    // Legacy prefix nudge
    if (raw.startsWith('!gb') || /^!\w+/.test(raw)) {
      await msg.reply({
        content: 'Use slash commands now → try **`/health`**, **`/suggest`**, etc.',
        allowedMentions: { parse: [], repliedUser: false },
      });
      return;
    }

    // Primary chat triggers: DM or mention
    const targeted = inDM || mentioned;

    // Optional ambient interjection
    let interjecting = false;
    if (!targeted && INTERJECT_ENABLED && msg.guild && canInterject(msg.channel.id) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channel.id);
    }

    if (targeted || interjecting) {
      // handleAiChat already does scheduling, timeouts, and final reply assembly
      await handleAiChat(msg, interjecting);
    }
  } catch (outer) {
    console.error('HANDLER ERR:', outer);
  }
}
