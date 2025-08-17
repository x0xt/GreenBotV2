// src/events/react/messageReactionAddSuggestions.js
import { SUGGEST_CHANNEL_ID, isOwner } from '../../shared/constants.js';
import { fetchSuggestionByMessageId, markSuggestionApproved } from '../../features/suggestions/registry.js';

export async function handleSuggestionReaction(reaction, user) {
  try {
    if (user?.bot) return;

    // Ensure full objects for partials
    if (reaction.partial) { try { await reaction.fetch(); } catch (e) { console.warn('[suggestReact] reaction.fetch failed:', e); return; } }
    const message = reaction.message?.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!message) return;

    // Accept reactions on the suggestions channel OR its threads
    const parentChannelId = message.channel?.isThread() ? message.channel.parentId : message.channelId;
    if (SUGGEST_CHANNEL_ID && parentChannelId !== SUGGEST_CHANNEL_ID) return;

    const emoji = reaction.emoji?.name || '';
    // Only handle ✅ (or a custom one if you add id check)
    if (emoji !== '✅') return;

    // Optional: only the owner can approve
    if (typeof isOwner === 'function' && !isOwner(user.id)) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    // Lookup the suggestion author by message id
    const rec = await fetchSuggestionByMessageId(message.id).catch(() => null);
    if (!rec?.userId) {
      console.warn('[suggestReact] no suggestion record for message:', message.id);
      return;
    }

    // DM the suggester
    const client = reaction.client ?? message.client;
    const targetUser = await client.users.fetch(rec.userId).catch(() => null);
    if (targetUser) {
      const title = message.embeds?.[0]?.title || 'your suggestion';
      const snippet = message.embeds?.[0]?.description?.slice(0, 140) || rec.text?.slice?.(0, 140) || '';
      const link = rec.link || message.url;

      await targetUser.send({
        content: `✅ Your suggestion has been marked **completed**!\n> ${title}\n${snippet ? `> ${snippet}\n` : ''}${link ? `\n${link}` : ''}`,
      }).catch(err => {
        if (!String(err?.message).includes('Cannot send messages to this user')) {
          console.error('[suggestReact] DM send failed:', err);
        }
      });
    }

    // Mark approved in DB (if you track state)
    await markSuggestionApproved(rec.messageId).catch(() => {});

    // Optional: public ack (set SUGGEST_PUBLIC_ACK=1)
    if (process.env.SUGGEST_PUBLIC_ACK === '1') {
      await message.reply({ allowedMentions: { repliedUser: false }, content: `DM sent to <@${rec.userId}> ✅` }).catch(() => {});
    }

    // Clean up the owner’s reaction to keep it tidy
    await reaction.users.remove(user.id).catch(() => {});
  } catch (err) {
    console.error('[suggestReact] error:', err);
  }
}
