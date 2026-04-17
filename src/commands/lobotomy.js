import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isAdmin, TIMEOUT_ERROR_GIF } from '../shared/constants.js';

export const data = new SlashCommandBuilder()
  .setName('lobotomy')
  .setDescription('Restarts the bot. Only usable by the bot owner and admins.');

export async function execute(interaction) {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({ content: 'You lack the authority to perform this lobotomy.', flags: 64 });
  }

  // GIF is required — if it's missing, warn loudly but still restart
  const gifPath = path.resolve(TIMEOUT_ERROR_GIF);
  const gifExists = fs.existsSync(gifPath);
  if (!gifExists) console.error(`[lobotomy] GIF not found at ${gifPath} — restarting anyway`);

  const replyOptions = { content: 'Lobotomizing...' };
  if (gifExists) replyOptions.files = [new AttachmentBuilder(gifPath)];

  try {
    await interaction.reply(replyOptions);
  } catch (e) {
    console.error('[lobotomy] failed to send reply:', e?.message || e);
  }

  exec('sudo /bin/systemctl restart greenbot.service', (error) => {
    if (error) console.error('[lobotomy] restart failed:', error.message);
  });
}
