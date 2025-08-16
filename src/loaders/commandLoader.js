// file: src/loaders/commandLoader.js
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads command modules from src/commands only (symlinks / thin wrappers OK).
 * A valid command must export { data, execute }.
 * Returns a list of loaded command names.
 */
export async function loadCommands(client, __dirname) {
  const commandsDir = path.join(__dirname, 'commands');

  if (!existsSync(commandsDir)) {
    console.warn(`[commands] directory missing: ${commandsDir}`);
    return [];
  }

  const files = readdirSync(commandsDir).filter(f => f.endsWith('.js'));
  if (files.length === 0) {
    console.warn(`[commands] no .js files found in ${commandsDir}`);
    return [];
  }

  const loaded = [];
  for (const file of files) {
    const fileURL = `file://${path.join(commandsDir, file)}`;
    try {
      const mod = await import(fileURL);
      if (mod?.data?.name && typeof mod.execute === 'function') {
        client.commands.set(mod.data.name, mod);
        loaded.push(mod.data.name);
      } else {
        console.warn(`[commands] skipped ${file}: missing data/execute`);
      }
    } catch (e) {
      console.error(`[commands] failed to import ${file}:`, e?.message || e);
    }
  }
  return loaded;
}

/**
 * Utility for deploy-commands.js: produce an array of command JSON bodies.
 */
export async function loadCommandJSON(__dirname) {
  const commandsDir = path.join(__dirname, 'commands');

  if (!existsSync(commandsDir)) return [];

  const files = readdirSync(commandsDir).filter(f => f.endsWith('.js'));
  const out = [];
  for (const file of files) {
    const fileURL = `file://${path.join(commandsDir, file)}`;
    try {
      const mod = await import(fileURL);
      if (mod?.data?.toJSON) out.push(mod.data.toJSON());
    } catch (e) {
      console.error(`[commands] JSON load failed for ${file}:`, e?.message || e);
    }
  }
  return out;
}
