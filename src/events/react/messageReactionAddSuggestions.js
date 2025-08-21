import { getByMessageId } from '../../features/suggestions/registry.js';
import { SUGGEST_CHANNEL_ID, SUGGEST_COMPLETED_CHANNEL_ID, isOwner } from '../../shared/constants.js';

export async function handleSuggestionReaction(reaction, user) {
  const message = reaction.message;
  const parentChannelId = message.channel?.isThread() ? message.channel.parentId : message.channelId;
  if (!SUGGEST_CHANNEL_ID || parentChannelId !== SUGGEST_CHANNEL_ID) return false;

  const emoji = reaction.emoji?.name || '';
  if (emoji !== '✅') return false;

  try {
    if (typeof isOwner === 'function' && !isOwner(user.id)) {
      await reaction.users.remove(user.id);
      return true;
    }

    const rec = await getByMessageId(message.id);
    const authorId = rec?.author_id || rec?.userId;
    if (!authorId) {
      console.warn(`[suggestReact] No author_id for suggestion message: ${message.id}`);
      await message.delete().catch(() => {});
      return true;
    }

    // --- CORRECTED TITLE LOGIC ---
    // Prioritize the embed's description, then the database text, then a default.
    const title = message.embeds?.[0]?.description || rec.text || 'An unknown suggestion';

    // Post the completion message before sending the DM
    const completionChannel = await message.client.channels.fetch(SUGGEST_COMPLETED_CHANNEL_ID).catch(() => null);
    if (completionChannel) {
      console.log(`[suggestReact] Posting completion for suggestion: "${title}"`);
      completionChannel.send(`✅ Suggestion completed by **${user.tag}**:\n> ${title}`);
    }

    const client = reaction.client ?? message.client;
    const targetUser = await client.users.fetch(authorId).catch(() => null);
    if (targetUser) {
      const link = rec.link || message.url;
      await targetUser.send({
        content: `✅ Your suggestion has been marked **completed**!\n> ${title}\n${link ? `\n${link}` : ''}`,
      }).catch(() => {});
    }
    
    await message.delete();
  } catch (err) {
    console.error('[Suggestion Reaction Error]', err);
  }
  
  return true;
}
