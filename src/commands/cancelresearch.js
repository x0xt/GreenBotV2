import { SlashCommandBuilder } from 'discord.js';
import { cancelJob, hasJob } from '../features/ai/runner/jobManager.js';

export const data = new SlashCommandBuilder()
  .setName('cancelresearch')
  .setDescription('Cancel your currently running research job');

export async function execute(interaction) {
  // Acknowledge the interaction immediately to prevent errors.
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  if (!hasJob(userId)) {
    return interaction.editReply('You do not have an active research job to cancel.');
  }

  const wasCancelled = cancelJob(userId);

  if (wasCancelled) {
    return interaction.editReply('Your research job has been canceled.');
  } else {
    // This case might happen if the job finished between the hasJob check and the cancelJob call.
    return interaction.editReply('Could not cancel the job. It may have just finished or already been canceled.');
  }
}
