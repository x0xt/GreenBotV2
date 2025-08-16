// src/commands/research.js
import { SlashCommandBuilder } from 'discord.js';
import { runAssistant } from '../features/ai/runner/runAssistant.js';
import {
  startJob,
  clearJob,
  getJob,
  hasJob,
  secondsSince,
  cancelJob,
} from '../features/ai/runner/jobManager.js';

const HARD_TIMEOUT_MS = 120_000; // 2 minutes
const KEEPALIVE = '20m';
const ALLOWED_GUILD_ID = process.env.DISCORD_GUILD_ID; // e.g. 842995720251506688

export const data = new SlashCommandBuilder()
  .setName('research')
  .setDescription('Run the research pipeline and return a concise answer')
  .addStringOption(o =>
    o.setName('query')
      .setDescription('What should I research?')
      .setRequired(true)
  );

export async function execute(interaction) {
  // --- Guild gate (block in DMs and other guilds) ---
  if (!interaction.guildId) {
    return interaction.reply({
      ephemeral: true,
      content: '❌ This command isn’t available in DMs.',
    });
  }
  if (ALLOWED_GUILD_ID && interaction.guildId !== ALLOWED_GUILD_ID) {
    return interaction.reply({
      ephemeral: true,
      content: '❌ This command is only available in the main server.',
    });
  }

  const query = interaction.options.getString('query');
  const userId = interaction.user.id;

  // One active job per user
  if (hasJob(userId)) {
    const secs = secondsSince(userId);
    return interaction.reply({
      ephemeral: true,
      content: `⚠️ You already have a research job running (${secs}s). Use **/cancelresearch** to stop it.`,
    });
  }

  await interaction.deferReply({ ephemeral: false });

  // Hard timeout for the entire operation
  const timeout = setTimeout(() => {
    if (hasJob(userId)) {
      try { cancelJob(userId); } catch {}
      interaction.editReply('⚠️ Research timed out after 2 minutes and has been canceled.');
    }
  }, HARD_TIMEOUT_MS);

  try {
    const child = runAssistant({ query, keepalive: KEEPALIVE });

    // Store the child process immediately
    startJob(userId, child, query);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('error', (error) => {
      console.error(`Child process error for user ${userId}:`, error);
      clearTimeout(timeout);
      clearJob(userId);
      interaction.editReply('⚠️ A critical error occurred while trying to start the research process.');
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      // If canceled, job was already cleared and we shouldn’t post anything
      if (!hasJob(userId)) {
        console.log(`Job for user ${userId} was canceled or already handled. Ignoring 'close' event.`);
        return;
      }

      const clip = (s) => (s ? String(s).slice(0, 1900).trim() : '');

      if (code === 0 && stdout) {
        interaction.editReply(clip(stdout));
      } else {
        const parts = ['⚠️ Research failed.', `Exit code: ${code ?? 'n/a'}`];
        if (stderr) parts.push('```' + clip(stderr) + '```');
        else if (stdout) parts.push('```' + clip(stdout) + '```');
        interaction.editReply(parts.join('\n'));
      }

      // Final cleanup
      clearJob(userId);
    });

  } catch (error) {
    console.error('Error in research command execute block:', error);
    clearTimeout(timeout);
    clearJob(userId);
    if (!interaction.replied) {
      interaction.editReply('⚠️ An unexpected error occurred.');
    }
  }
}
