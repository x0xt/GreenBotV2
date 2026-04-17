import { SlashCommandBuilder } from 'discord.js';
import { getStats } from '../shared/stats.js';
import { isAdmin } from '../shared/constants.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Usage stats since last restart. Admin only.');

export async function execute(interaction) {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({ content: 'no.', ephemeral: true });
  }

  const { totalResponses, breakerTrips, perUser } = getStats();

  const topUsers = [...perUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count], i) => `${i + 1}. <@${id}> ${count}`)
    .join('\n') || 'none yet';

  const lines = [
    `**total responses** ${totalResponses}`,
    `**breaker trips** ${breakerTrips}`,
    `**top chatters**\n${topUsers}`,
  ];

  await interaction.reply({ content: lines.join('\n'), ephemeral: true });
}
