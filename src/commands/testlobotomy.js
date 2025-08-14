// src/commands/testlobotomy.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { notifyTimeout } from '../shared/notifyTimeout.js';
import { OWNER_ID } from '../shared/constants.js';

// Hide from DMs and disable by default for everyone (we gate by OWNER_ID anyway)
export const data = new SlashCommandBuilder()
  .setName('testlobotomy')
  .setDescription('Send the lobotomy.gif to verify it animates (dev/test)')
  .setDMPermission(false)
  // Setting to 0 disables it by default for everyone in guild menus
  .setDefaultMemberPermissions(0n);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: "🚫 You are not my owner fuck face. go back tO blowing your brother",
      ephemeral: true,
    });
  }
  await notifyTimeout(interaction, '🪓 test fire — this should animate.');
}
