// file: src/loaders/eventLoader.js
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads all event handlers from src/events.
 * Each module should export { name, once?, execute }.
 * Returns the count of loaded events.
 */
export async function loadEvents(client, __dirname) {
  const eventsDir = path.join(__dirname, 'events');

  if (!existsSync(eventsDir)) {
    console.warn(`[events] directory missing: ${eventsDir}`);
    return 0;
  }

  const files = readdirSync(eventsDir).filter(f => f.endsWith('.js'));
  let count = 0;

  for (const file of files) {
    const fileURL = `file://${path.join(eventsDir, file)}`;
    try {
      const mod = await import(fileURL);
      if (typeof mod?.execute !== 'function' || !mod?.name) {
        console.warn(`[events] skipped ${file}: missing name/execute`);
        continue;
      }
      if (mod.once) client.once(mod.name, (...args) => mod.execute(...args));
      else client.on(mod.name, (...args) => mod.execute(...args));
      count++;
    } catch (e) {
      console.error(`[events] failed to import ${file}:`, e?.message || e);
    }
  }

  return count;
}
