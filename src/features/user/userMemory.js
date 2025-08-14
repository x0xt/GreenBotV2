import { promises as fs } from 'fs';
import path from 'path';
import { MEMORY_ROOT, SNIPPET_LINES, MAX_LINES } from '../../shared/constants.js';

export async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // Ignore errors, such as if the directory already exists
  }
}

function guildDir(guildId) {
  return path.join(MEMORY_ROOT, guildId ?? 'dm');
}

export function userFilePath(guildId, userId) {
  return path.join(guildDir(guildId), `${userId}.txt`);
}

export async function touchUserMemory(guildId, userId, username) {
  const gdir = guildDir(guildId);
  const file = userFilePath(guildId, userId);
  try {
    await ensureDir(gdir);
    try {
      await fs.access(file);
    } catch {
      const fh = await fs.open(file, 'a');
      await fh.close();
      const header = `# User Notes for ${username} (${userId})\n---\n`;
      await fs.appendFile(file, header, 'utf8');
      console.log(`MEMTOUCH ${file}`);
    }
  } catch (e) {
    console.error(`MEMTOUCH ERR ${file}:`, e);
  }
}

export async function readUserMemory(guildId, userId) {
  const file = userFilePath(guildId, userId);
  try {
    await ensureDir(path.dirname(file));
    try {
      await fs.access(file);
    } catch {
      return '';
    }
    const raw = await fs.readFile(file, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.slice(-SNIPPET_LINES).join('\n');
  } catch (e) {
    console.error(`MEMREAD ERR ${file}:`, e);
    return '';
  }
}

export async function appendUserMemory(guildId, userId, userMsg) {
  const file = userFilePath(guildId, userId);
  try {
    await ensureDir(path.dirname(file));
    const entry = `${String(userMsg).replace(/\s+/g, ' ').slice(0, 400)}\n`;
    let existing = '';
    try {
      existing = await fs.readFile(file, 'utf8');
    } catch {}
    const lines = (existing + entry).split('\n').filter(Boolean);
    const trimmed = lines.slice(-MAX_LINES).join('\n') + '\n';
    await fs.writeFile(file, trimmed, 'utf8');
    console.log(`MEMWRITE ${file} (now ~${lines.length} lines)`);
  } catch (e) {
    console.error(`MEM APPEND ERR ${file}:`, e);
  }
}
