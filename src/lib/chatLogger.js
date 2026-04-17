import { promises as fs } from 'fs';
import path from 'path';
import { recordResponse } from '../shared/stats.js';

const LOG_ROOT = path.resolve('./logs');

function getLogPath(guildId, userId) {
  if (guildId) return path.join(LOG_ROOT, 'guilds', `${guildId}.log`);
  return path.join(LOG_ROOT, 'dm', `${userId}.log`);
}

export async function logChat(guildId, userId, username, userMessage, botReply, { channelId = null, type = 'targeted' } = {}) {
  try {
    const logPath = getLogPath(guildId, userId);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const ts = new Date().toISOString();
    const ch = channelId ? ` #${channelId}` : '';
    const entry = `[${ts}][${type}${ch}] ${username}: ${userMessage}\n[${ts}][${type}${ch}] greenbot: ${botReply}\n\n`;
    await fs.appendFile(logPath, entry, 'utf8');
    recordResponse(userId);
  } catch (e) {
    console.error('chatLogger err:', e?.message || e);
  }
}
