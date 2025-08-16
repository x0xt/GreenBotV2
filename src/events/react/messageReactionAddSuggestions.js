// src/events/react/messageReactionAddSuggestions.js
import { SUGGEST_CHANNEL_ID, isOwner } from '../../shared/constants.js';
import { fetchSuggestionByMessageId, markSuggestionApproved } from '../../features/suggestions/registry.js';

export async function handleSuggestionReaction(reaction, user) {
  try {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch (e) {
        console.warn('[suggestReact] failed to fetch reaction partial:', e);
        return;
      }
    }
    const { message } = reaction;
    if (message.partial) {
      try { await message.fetch(); } catch (e) {
        console.warn('[suggestReact] failed to fetch message partial:', e);
        return;
      }
    }

    if (!SUGGEST_CHANNEL_ID || message.channelId !== SUGGEST_CHANNEL_ID) return;

    const emoji = reaction.emoji?.name || '';
    console.log(`[suggestReact] got emoji "${emoji}" on ${message.id} by ${user.id}`);

    // Example: only owner approves suggestions with ✅
    if (emoji === '✅') {
      if (!isOwner(user.id)) {
        await reaction.users.remove(user.id).catch(() => {});
        return;
      }
      const rec = await fetchSuggestionByMessageId(message.id).catch(() => null);
      if (!rec) return;
      await markSuggestionApproved(rec.messageId).catch(() => {});
      // you can DM the submitter here, or add a ✅ to the embed, etc.
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    // Add other emoji actions if you want
  } catch (err) {
    console.error('[suggestReact] error:', err);
  }
}
