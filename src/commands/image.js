import { promises as fs } from 'fs';
import path from 'path';
import { OWNER_ID, IMAGE_POOL_ROOT } from '../shared/constants.js';
import { getPoolFiles } from '../features/media/imagePool.js';
import { collectImage } from '../features/media/imageCollector.js';

export const data = {
  name: 'img',
  description: 'Manages the image pool (owner only).',
};

export async function execute(msg, args) {
  if (msg.author.id !== OWNER_ID) {
    return msg.reply({ content: 'only my master can use these commands.', allowedMentions: { parse: [], repliedUser: false } });
  }

  const subCommand = args[0]?.toLowerCase();

  if (subCommand === 'add') {
    const url = args[1];
    if (!url) return msg.reply({ content: 'you forgot the url, idiot.', allowedMentions: { parse: [], repliedUser: false } });
    
    // We can reuse the collector logic to save the image
    const success = await collectImage({ content: url, attachments: new Map() });
    
    return msg.reply({ content: success ? 'image added.' : 'failed to add image. is it a valid link?', allowedMentions: { parse: [], repliedUser: false } });
  }

  if (subCommand === 'count') {
    const files = await getPoolFiles();
    return msg.reply({ content: `image pool contains ${files.length} files.`, allowedMentions: { parse: [], repliedUser: false } });
  }

  if (subCommand === 'purge') {
    const files = await getPoolFiles();
    let deletedCount = 0;
    for (const file of files) {
      try {
        await fs.unlink(path.join(IMAGE_POOL_ROOT, file));
        deletedCount++;
      } catch {}
    }
    return msg.reply({ content: `purged ${deletedCount} images from the pool.`, allowedMentions: { parse: [], repliedUser: false } });
  }
  
  return msg.reply({ content: 'invalid subcommand. use `add`, `count`, or `purge`.', allowedMentions: { parse: [], repliedUser: false } });
}
