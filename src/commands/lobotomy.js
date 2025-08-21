import { SlashCommandBuilder, AttachmentBuilder } from 'discord.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { OWNER_ID, ADMIN_IDS, TIMEOUT_ERROR_GIF } from '../shared/constants.js';

export const data = new SlashCommandBuilder()
  .setName('lobotomy')
  .setDescription('Restarts the bot. Only usable by the bot owner and admins.');

export async function execute(interaction) {
  console.log(`[Lobotomy] Command received from ${interaction.user.tag} (${interaction.user.id})`);

  const userId = interaction.user.id;
  const admins = ADMIN_IDS || [];

  // 1. Permission Check
  if (userId !== OWNER_ID && !admins.includes(userId)) {
    console.log(`[Lobotomy] PERMISSION DENIED for ${interaction.user.tag}.`);
    return interaction.reply({
      content: 'You lack the authority to perform this lobotomy.',
      flags: 64,
    });
  }
  console.log(`[Lobotomy] Permission GRANTED for ${interaction.user.tag}.`);

  // 2. GIF Check
  const gifPath = path.resolve(TIMEOUT_ERROR_GIF);
  if (!fs.existsSync(gifPath)) {
    console.error(`[Lobotomy] GIF not found at path: ${gifPath}`);
    return interaction.reply({ content: `❌ GIF not found, cannot perform lobotomy.`, flags: 64, });
  }
  console.log(`[Lobotomy] GIF found at: ${gifPath}`);
  const attachment = new AttachmentBuilder(gifPath);

  // 3. Initial Reply
  try {
    await interaction.reply({ content: 'Lobotomizing...', files: [attachment] });
    console.log(`[Lobotomy] Initial reply sent successfully.`);
  } catch (replyError) {
    console.error('[Lobotomy] FAILED to send initial reply:', replyError);
    return;
  }

  // 4. Execute Restart Command using SUDO
  const command = 'sudo /bin/systemctl restart greenbot.service';
  console.log(`[Lobotomy] Executing command: "${command}"`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Lobotomy] EXECUTION FAILED: ${error.message}`);
      interaction.followUp({ content: `Lobotomy failed at the system level. **Error:** \`\`\`${error.message}\`\`\``, flags: 64 });
      return;
    }
    if (stderr) { console.error(`[Lobotomy] STDERR: ${stderr}`); }
    if (stdout) { console.log(`[Lobotomy] STDOUT: ${stdout}`); }
    console.log(`[Lobotomy] Restart command for ${interaction.user.tag} completed.`);
  });
}
