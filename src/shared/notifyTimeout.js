// src/shared/notifyTimeout.js
import fs from 'fs';
import path from 'path';
import { AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { TIMEOUT_ERROR_GIF } from './constants.js';

/**
 * Send the lobotomy GIF as a raw attachment (reliable animation) to either:
 * - a RepliableInteraction (slash), or
 * - a TextBasedChannel
 * Falls back to text if file missing or AttachFiles is denied.
 */
export async function notifyTimeout(target, fallbackText = '⏳ Timeout / error — initiating lobotomy…') {
  try {
    const abs = path.resolve(TIMEOUT_ERROR_GIF);
    if (!fs.existsSync(abs)) {
      console.error(`[notifyTimeout] GIF missing at ${abs}`);
      // best-effort fallback
      if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
        return target.reply({ content: fallbackText });
      }
      return target.send?.(fallbackText);
    }

    const name = path.basename(abs) || 'lobotomy.gif';
    const file = new AttachmentBuilder(abs, { name });

    // Slash interaction path (attach in same payload)
    if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
      if (target.appPermissions && !target.appPermissions.has(PermissionFlagsBits.AttachFiles)) {
        return target.reply({ content: '❌ I lack **Attach Files** permission in this channel.', flags: 64 });
      }
      return target.reply({ files: [file] });
    }

    // Channel path (raw attachment)
    return target.send?.({ files: [file] });
  } catch (err) {
    console.error('[notifyTimeout] failed:', err);
    // final fallback
    if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
      return target.reply?.({ content: fallbackText });
    }
    return target.send?.(fallbackText);
  }
}
