// src/events/messageReactionAdd.js

// FIXED: The path is now ../features, not ../../features
import { getByMessageId } from '../features/suggestions/registry.js';
import { isOwner } from '../shared/constants.js';

export const name = 'messageReactionAdd';
export const once = false;

/**
 * Handles reactions to suggestions.
 */
export async function execute(reaction, user) {
  try {
    // Ignore reactions from the bot itself
    if (user.bot) return;

    // Fetch the full message/reaction if it's a partial
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Something went wrong when fetching the reaction:', error);
        return;
      }
    }

    // Check if the message this reaction is on is a tracked suggestion
    const suggestion = await getByMessageId(reaction.message.id);
    if (!suggestion) {
      // Not a suggestion we're tracking, so we do nothing.
      return;
    }

    // --- YOUR LOGIC GOES HERE ---
    // Now you can act based on the emoji and user permissions.
    // For example, check for an approve/deny emoji.
    const emoji = reaction.emoji?.name;
    
    if (emoji === '👍' && isOwner(user.id)) {
        console.log(`Owner approved suggestion from message ${reaction.message.id}`);
        // Add your approval logic here
    }

    if (emoji === '👎' && isOwner(user.id)) {
        console.log(`Owner denied suggestion from message ${reaction.message.id}`);
        // Add your denial logic here
    }

  } catch (err) {
    console.error('[Suggestion Reaction Error]', err);
  }
}
