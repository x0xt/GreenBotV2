// src/shared/notifyTimeout.js
import { AttachmentBuilder } from 'discord.js';
import path from 'path';
import { TIMEOUT_ERROR_GIF } from './constants.js';
import { sendGif } from './sendGif.js';

// derive a sane filename even if not exported explicitly
const DEFAULT_NAME = path.basename(TIMEOUT_ERROR_GIF || 'lobotomy.gif');

/**
 * Send the lobotomy GIF on timeout/breaker/test events.
 * Works with either a TextBasedChannel or a Repliable interaction.
 * @param {import('discord.js').TextBasedChannel|import('discord.js').RepliableInteraction} target
 * @param {string|null} message Optional description text
 */
export async function notifyTimeout(target, message = null) {
  const description = message ?? '⏳ timed out — initiating emergency lobotomy...';

  // Slash command / interaction path — files must be attached in same payload
  if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
    const file = new AttachmentBuilder(TIMEOUT_ERROR_GIF, { name: DEFAULT_NAME });
    const payload = {
      embeds: [{ image: { url: `attachment://${DEFAULT_NAME}` }, description }],
      files: [file],
      ephemeral: false,
    };
    if (target.deferred || target.replied) return target.followUp(payload);
    return target.reply(payload);
  }

  // Channel path
  return sendGif(target, TIMEOUT_ERROR_GIF, {
    filename: DEFAULT_NAME,
    description,
  });
}
