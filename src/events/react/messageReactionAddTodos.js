// src/events/react/messageReactionAddTodos.js
import {
  TODO_CHANNEL_ID,
  isOwner,
} from '../../shared/constants.js';
import {
  getByMessageId,
  toggleByMessageId,
  deleteByMessageId,
} from '../../features/todo/dao.js';
import { renderTodoEmbed } from '../../features/todo/renderer.js';

export const name = 'messageReactionAdd';
export const once = false;

/**
 * Rules:
 * - Only handle reactions in TODO_CHANNEL_ID
 * - ✅ toggle done (allowed for owner OR original author)
 * - 🗑️ delete (owner only)
 */
export async function execute(reaction, user) {
  try {
    // ignore bot reactions
    if (user.bot) return;

    // ensure full objects for partials
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    const message = reaction.message;
    if (!message || !message.channel) return;

    // only our TODO channel
    if (String(message.channelId) !== String(TODO_CHANNEL_ID)) return;

    const emoji = reaction.emoji?.name;
    if (emoji !== '✅' && emoji !== '🗑️') return;

    // DB row
    const row = getByMessageId(message.id);
    if (!row) return; // not one of our tracked todos

    // perms
    const isAuthor = String(user.id) === String(row.author_id);
    const canToggle = isOwner(user.id) || isAuthor;
    const canDelete = isOwner(user.id);

    if (emoji === '✅') {
      if (!canToggle) return;
      const newDone = toggleByMessageId(message.id);
      if (newDone === null) return;

      // re-render message embed
      const embed = renderTodoEmbed({
        text: row.text,
        done: !!newDone,
        authorName: message.author?.username || 'unknown',
        authorIcon: message.author?.displayAvatarURL?.() || undefined,
      });
      await message.edit({ embeds: [embed] }).catch(() => {});
      // remove user’s reaction to keep things tidy
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }

    if (emoji === '🗑️') {
      if (!canDelete) return;
      const ok = deleteByMessageId(message.id);
      if (ok) {
        await message.delete().catch(() => {});
      }
      return;
    }
  } catch (err) {
    // keep it quiet in prod, you can log if you want:
    // console.error('[todo reaction error]', err);
  }
}
