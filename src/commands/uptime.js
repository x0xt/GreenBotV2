import { SlashCommandBuilder } from 'discord.js';
import { getBotStartTime } from '../events/ready.js';

export const data = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('How long the bot has been running since last restart.');

export async function execute(interaction) {
  const ms = Date.now() - getBotStartTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h % 24 > 0) parts.push(`${h % 24}h`);
  if (m % 60 > 0) parts.push(`${m % 60}m`);
  parts.push(`${s % 60}s`);

  await interaction.reply({ content: `up for **${parts.join(' ')}**`, ephemeral: true });
}
