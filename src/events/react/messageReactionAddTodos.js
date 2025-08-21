import { TODO_CHANNEL_ID, TODO_COMPLETED_CHANNEL_ID, isOwner } from '../../shared/constants.js';
import { getByMessageId, toggleByMessageId, deleteByMessageId } from '../../features/todo/dao.js';
import { renderTodoEmbed } from '../../features/todo/renderer.js';

export async function handleTodoReaction(reaction, user) {
  const message = reaction.message;
  if (String(message.channelId) !== String(TODO_CHANNEL_ID)) return false;

  const emoji = reaction.emoji?.name;
  if (emoji !== '✅' && emoji !== '🗑️') return false;

  try {
    const row = getByMessageId(message.id);
    if (!row) return false;

    const isOriginalAuthor = String(user.id) === String(row.author_id);
    const isBotOwner = isOwner(user.id);
    const canToggle = isBotOwner || isOriginalAuthor;
    const canDelete = isBotOwner;

    if (emoji === '✅' && canToggle) {
      const newDone = toggleByMessageId(message.id);
      if (newDone) { // Only post completion message when it's marked as done
        const completionChannel = await message.client.channels.fetch(TODO_COMPLETED_CHANNEL_ID).catch(() => null);
        if (completionChannel) {
          const originalAuthor = await message.client.users.fetch(row.author_id).catch(() => null);
          const authorName = originalAuthor ? originalAuthor.tag : 'An unknown user';
          completionChannel.send(`✅ To-do completed by **${user.tag}** (originally created by **${authorName}**):\n> ${row.text}`);
        }
      }
      await message.delete(); // Delete the original to-do message
    } else if (emoji === '🗑️' && canDelete) {
      await deleteByMessageId(message.id);
      await message.delete();
    } else {
      await reaction.users.remove(user.id);
    }
  } catch (err) {
    console.error('[todo reaction error]', err);
  }

  return true;
}
