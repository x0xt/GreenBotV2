import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir, readUserMemory, userFilePath } from '../features/user/userMemory.js';

export const data = {
  name: 'mem',
  description: 'Manages user memory.',
};

export async function execute(msg, args) {
  const subCommand = args[0]?.toLowerCase();
  const file = userFilePath(msg.guild?.id, msg.author.id);

  if (subCommand === 'show') {
    try {
      await ensureDir(path.dirname(file));
      const memoryContent = await readUserMemory(msg.guild?.id, msg.author.id);
      const content = memoryContent ? `\`\`\`\n${memoryContent}\n\`\`\`` : 'no notes.';
      return msg.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    } catch {
      return msg.reply({ content: 'no notes.', allowedMentions: { parse: [], repliedUser: false } });
    }
  }

  if (subCommand === 'clear') {
    try {
      await fs.unlink(file);
    } catch (e) {
      // Ignore error if file doesn't exist
    }
    return msg.reply({ content: 'notes wiped.', allowedMentions: { parse: [], repliedUser: false } });
  }

  return msg.reply({ content: 'invalid subcommand. use `show` or `clear`.', allowedMentions: { parse: [], repliedUser: false } });
}
