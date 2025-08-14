import { SlashCommandBuilder } from 'discord.js';
import { buckets, globalInFlight, globalQueue, breakerOpen, breakerTrippedUntil } from '../features/ai/backpressure.js';

export const data = new SlashCommandBuilder()
	.setName('health')
	.setDescription('Displays the current health and queue status of the bot.');

export async function execute(interaction) {
  const authorId = interaction.user.id;

  const healthData = {
    globalInFlight,
    globalQueue: globalQueue.length,
    breakerOpen: breakerOpen(),
    breakerTrippedUntil: breakerTrippedUntil > 0 ? new Date(breakerTrippedUntil).toISOString() : 'N/A',
    perUserInFlight: (buckets.get(authorId)?.inFlight ?? 0),
    perUserQueue: (buckets.get(authorId)?.queue.length ?? 0)
  };

  await interaction.reply({
    content: "```json\n" + JSON.stringify(healthData, null, 2) + "\n```",
    ephemeral: true // Ephemeral means only you can see this reply
  });
}
