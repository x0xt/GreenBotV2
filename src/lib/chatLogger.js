import { promises as fs } from 'fs';
import path from 'path';

const LOG_ROOT = path.resolve('./logs');

function getLogPath(guildId, userId) {
  if (guildId) return path.join(LOG_ROOT, 'guilds', `${guildId}.log`);
  return path.join(LOG_ROOT, 'dm', `${userId}.log`);
}

export async function logChat(guildId, userId, username, userMessage, botReply) {
  try {
    const logPath = getLogPath(guildId, userId);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const ts = new Date().toISOString();
    const entry = `[${ts}] ${username}: ${userMessage}\n[${ts}] greenbot: ${botReply}\n\n`;
    await fs.appendFile(logPath, entry, 'utf8');
  } catch (e) {
    console.error('chatLogger err:', e?.message || e);
  }
}
