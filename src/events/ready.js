import { Events } from 'discord.js';
import { ensureDir } from '../features/user/userMemory.js';
import { MEMORY_ROOT, IMAGE_POOL_ROOT, OLLAMA_HOST, MODEL } from '../shared/constants.js';
import { fetchWithTimeout } from '../shared/network.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  await ensureDir(MEMORY_ROOT);
  await ensureDir(IMAGE_POOL_ROOT);

  try {
    const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/tags`, {}, 5000);
    console.log(`Ollama health: ${r.ok ? 'OK' : `FAIL (${r.status})`}`);
  } catch (e) {
    console.warn('Ollama not reachable at startup:', e?.message || e);
  }

  console.log(`Logged in as ${client.user.tag} (MODEL=${MODEL}, HOST=${OLLAMA_HOST})`);
}
