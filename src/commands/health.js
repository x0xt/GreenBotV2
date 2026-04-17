import { SlashCommandBuilder } from 'discord.js';
import { buckets, globalInFlight, globalQueue, breakerOpen, breakerTrippedUntil } from '../features/ai/backpressure.js';
import { OLLAMA_HOST } from '../shared/constants.js';
import { fetchWithTimeout } from '../shared/network.js';

export const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription('Displays the current health and queue status of the bot.');

export async function execute(interaction) {
  const authorId = interaction.user.id;

  // check ollama
  let ollamaStatus = 'ok';
  let modelLoaded = false;
  try {
    const r = await fetchWithTimeout(`${OLLAMA_HOST}/api/ps`, {}, 3000);
    const data = await r.json();
    modelLoaded = (data?.models?.length ?? 0) > 0;
    if (!r.ok) ollamaStatus = `error (${r.status})`;
  } catch {
    ollamaStatus = 'unreachable';
  }

  const open = breakerOpen();
  const tripUntil = breakerTrippedUntil > 0 ? new Date(breakerTrippedUntil) : null;
  const cooldownSecs = tripUntil ? Math.max(0, Math.ceil((tripUntil - Date.now()) / 1000)) : 0;

  const userInFlight = buckets.get(authorId)?.inFlight ?? 0;
  const userQueue = buckets.get(authorId)?.queue.length ?? 0;

  const lines = [
    `**ollama** ${ollamaStatus === 'ok' ? '🟢' : '🔴'} ${ollamaStatus} — model ${modelLoaded ? 'loaded' : 'unloaded'}`,
    `**circuit breaker** ${open ? `🔴 open (resets in ${cooldownSecs}s)` : '🟢 closed'}`,
    `**global** ${globalInFlight} in-flight / ${globalQueue.length} queued`,
    `**your queue** ${userInFlight} in-flight / ${userQueue} queued`,
  ];

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}
