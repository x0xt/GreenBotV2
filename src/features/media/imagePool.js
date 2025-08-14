import { promises as fs } from 'fs';
import path from 'path';
import { IMAGE_POOL_ROOT, IMAGE_POOL_MAX_FILES } from '../../shared/constants.js';
import { ensureDir } from '../user/userMemory.js'; // We can reuse this helper

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
  const randomFile = files[Math.floor(Math.random() * files.length)];
  return path.join(IMAGE_POOL_ROOT, randomFile);
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
