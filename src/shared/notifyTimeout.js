import { sendGif } from './sendGif.js';
import { TIMEOUT_ERROR_GIF, TIMEOUT_ERROR_GIF_NAME } from './constants.js';

/**
 * Send the lobotomy GIF on timeout/breaker conditions.
 * Accepts either a channel (TextBasedChannel) or an interaction (slash).
 */
export async function notifyTimeout(target, extraMsg = null) {
  const description = extraMsg ?? '⏳ timed out — initiating emergency lobotomy...';
  try {
    // If it's an Interaction (isRepliable), reply/followUp with files+embed
    if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
      const payload = {
        embeds: [{
          image: { url: `attachment://${TIMEOUT_ERROR_GIF_NAME}` },
          description,
        }],
        files: [{ attachment: TIMEOUT_ERROR_GIF, name: TIMEOUT_ERROR_GIF_NAME }],
        ephemeral: false,
      };
      if (target.deferred || target.replied) return target.followUp(payload);
      return target.reply(payload);
    }
    // Otherwise assume a channel
    return sendGif(target, TIMEOUT_ERROR_GIF, {
      filename: TIMEOUT_ERROR_GIF_NAME,
      description,
    });
  } catch (e) {
    console.error('notifyTimeout failed', e);
  }
}
