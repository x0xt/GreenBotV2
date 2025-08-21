import { Events } from 'discord.js';
import { handleTodoReaction } from './react/messageReactionAddTodos.js';
import { handleSuggestionReaction } from './react/messageReactionAddSuggestions.js';

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
  try {
    if (user?.bot) return;

    // Fetch partials if necessary to get complete data
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    // --- REACTION ROUTER ---
    // Try to handle as a to-do reaction first. If it returns true, we're done.
    if (await handleTodoReaction(reaction, user)) return;

    // If it wasn't a to-do, try to handle it as a suggestion reaction.
    if (await handleSuggestionReaction(reaction, user)) return;

  } catch (err) {
    console.error('[Main Reaction Handler Error]', err);
  }
}
