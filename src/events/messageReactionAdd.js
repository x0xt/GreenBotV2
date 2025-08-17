// src/events/messageReactionAdd.js
import { Events } from 'discord.js';
import { getByMessageId } from '../features/suggestions/registry.js';
import { SUGGEST_CHANNEL_ID, isOwner } from '../shared/constants.js';

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
  try {
    if (user?.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch (e) {
        console.error('[suggestReact] reaction.fetch failed:', e);
        return;
      }
    }
    const message = reaction.message?.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!message) return;

    const emoji = reaction.emoji?.name || '';
    if (emoji !== '✅') return;

    const parentChannelId = message.channel?.isThread() ? message.channel.parentId : message.channelId;
    if (SUGGEST_CHANNEL_ID && parentChannelId !== SUGGEST_CHANNEL_ID) return;

    if (typeof isOwner === 'function' && !isOwner(user.id)) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    const rec = await getByMessageId(message.id).catch(() => null);
    if (!rec?.userId) {
      console.warn('[suggestReact] no suggestion record for message:', message.id);
      return;
    }

    const client = reaction.client ?? message.client;
    const targetUser = await client.users.fetch(rec.userId).catch(() => null);
    if (targetUser) {
      const title = message.embeds?.[0]?.title || 'your suggestion';
      const snippet = message.embeds?.[0]?.description?.slice(0, 140)
        || rec.text?.slice?.(0, 140)
        || '';
      const link = rec.link || message.url;

      await targetUser.send({
        content:
          `✅ Your suggestion has been marked **completed**!\n` +
          `> ${title}\n` +
          (snippet ? `> ${snippet}\n` : '') +
          (link ? `\n${link}` : ''),
      }).catch(err => {
        if (!String(err?.message).includes('Cannot send messages to this user')) {
          console.error('[suggestReact] DM send failed:', err);
        }
      });
    }

    if (process.env.SUGGEST_PUBLIC_ACK === '1') {
      await message.reply({
        allowedMentions: { repliedUser: false },
        content: `DM sent to <@${rec.userId}> ✅`,
      }).catch(() => {});
    }

    // Remove the approver's reaction
    await reaction.users.remove(user.id).catch(() => {});

    // 🔥 Delete the suggestion message itself
    await message.delete().catch(err => {
      console.error('[suggestReact] failed to delete message:', err);
    });

  } catch (err) {
    console.error('[Suggestion Reaction Error]', err);
  }
}
