// src/commands/testlobotomy.js
import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import { OWNER_ID, TIMEOUT_ERROR_GIF } from '../shared/constants.js';

export const data = new SlashCommandBuilder()
  .setName('testlobotomy')
  .setDescription('Send lobotomy.gif to verify it animates (owner only)')
  .setDMPermission(false)
  .setDefaultMemberPermissions(0n); // hidden/disabled by default in menus

export async function execute(interaction) {
  // owner gate
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: "🚫 You don't have permission you fucking idiot. Blame Doc.", flags: 64 }); // ephemeral
  }

  // channel permission check (AttachFiles is required)
  if (interaction.appPermissions && !interaction.appPermissions.has(PermissionFlagsBits.AttachFiles)) {
    return interaction.reply({ content: "❌ I lack **Attach Files** permission in this channel.", flags: 64 });
  }

  const abs = path.resolve(TIMEOUT_ERROR_GIF);
  if (!fs.existsSync(abs)) {
    return interaction.reply({ content: `❌ GIF not found: \`${abs}\``, flags: 64 });
  }

  const name = path.basename(abs) || 'lobotomy.gif';
  const file = new AttachmentBuilder(abs, { name });

  // simplest, most reliable: send the file only — Discord will animate it inline
  return interaction.reply({ files: [file] });
}
