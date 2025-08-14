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

    // Run side-effects (non-command): image collection + light user memory touch
    await Promise.all([
      collectImage(msg),
      touchUserMemory(msg.guild?.id, msg.author.id, msg.author.username),
    ]);

    const raw = (msg.content ?? '').trim();
    const inDM = msg.channel?.type === ChannelType.DM;
    const mentioned = Boolean(msg.mentions?.users?.has?.(msg.client?.user?.id) ? msg.mentions.users.has(msg.client.user.id) : false);

    // ---- PURE SLASH MODE ----
    // If users try old prefix commands, gently point them to slash and bail.
    // Match "!gb ..." specifically AND any other "!"-prefix attempts.
    if (raw.startsWith('!gb') || /^!\w+/.test(raw)) {
      await msg.reply({
        content: 'I’m slash-only now you fucktard. Try **`/health`**, **`/suggest`**, etc.',
        allowedMentions: { parse: [], repliedUser: false },
      });
      return; // do not dispatch any message-based command
    }

    // --- AI chat (targeted or probabilistic interjection) ---
    const targeted = inDM || mentioned;
    let interjecting = false;

    if (!targeted && INTERJECT_ENABLED && msg.guild && canInterject(msg.channel.id) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channel.id);
    }

    if (targeted || interjecting) {
      await handleAiChat(msg, interjecting);
    }
  } catch (outer) {
    console.error('HANDLER ERR:', outer);
  }
}
