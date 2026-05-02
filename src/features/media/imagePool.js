import { promises as fs } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { IMAGE_POOL_ROOT, IMAGE_POOL_MAX_FILES, FILTER_HASH_RETRY_MAX } from '../../shared/constants.js';
import { ensureDir } from '../user/userMemory.js'; // We can reuse this helper
import { isHashBlocked, logFilterDecision } from '../../../filter/filterDb.js';

export async function getPoolFiles() {
  try {
    await ensureDir(IMAGE_POOL_ROOT);
    return await fs.readdir(IMAGE_POOL_ROOT);
  } catch {
    return [];
  }
}

export async function getRandomImage() {
  const files = await getPoolFiles();
  if (files.length === 0) return null;

  // Shuffle once, walk linearly — avoids re-picking the same blocked file
  const shuffled = [...files].sort(() => Math.random() - 0.5);
  const limit    = Math.min(shuffled.length, FILTER_HASH_RETRY_MAX);

  for (let i = 0; i < limit; i++) {
    const filepath = path.join(IMAGE_POOL_ROOT, shuffled[i]);
    try {
      const buf    = await readFile(filepath);
      const md5    = createHash('md5').update(buf).digest('hex');
      if (isHashBlocked(md5)) {
        await unlink(filepath).catch(() => {});
        logFilterDecision({ filepath, hashMd5: md5, decision: 'blocked_post', reason: 'hash_blocklist' });
        console.log(`[filter] post-time hash block: deleted ${shuffled[i]}`);
        continue;
      }
      return filepath;
    } catch {
      continue; // file disappeared (race with prunePool) — try next
    }
  }

  return null; // all candidates were blocked or unreadable
}

export async function prunePool() {
  const files = await getPoolFiles();
  if (files.length > IMAGE_POOL_MAX_FILES) {
    console.log(`Pruning image pool (size ${files.length} > max ${IMAGE_POOL_MAX_FILES})...`);
    const filesWithStats = await Promise.all(
      files.map(async (file) => ({
        name: file,
        path: path.join(IMAGE_POOL_ROOT, file),
        stats: await fs.stat(path.join(IMAGE_POOL_ROOT, file)),
      }))
    );
    // delete the oldest first
    filesWithStats.sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs);
    const toDelete = filesWithStats.slice(0, files.length - IMAGE_POOL_MAX_FILES);
    for (const file of toDelete) {
      try {
        await fs.unlink(file.path);
        console.log(`Pruned: ${file.name}`);
      } catch (e) {
        console.error(`Failed to prune ${file.name}:`, e);
      }
    }
  }
}
