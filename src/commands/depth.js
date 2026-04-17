import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getDepth } from '../features/ai/depthTracker.js';
import { isAdmin } from '../shared/constants.js';

function describeDepth(depth) {
  if (depth === 0)   return 'fresh — no active conversation';
  if (depth < 10)    return 'normal — coherent, punchy';
  if (depth < 20)    return 'warming up — slight weirdness creeping in';
  if (depth < 35)    return 'getting strange — noticeable drift';
  if (depth < 50)    return 'losing it — barely tracking';
  return 'full chaos — word salad territory';
}

export const data = new SlashCommandBuilder()
  .setName('depth')
  .setDescription('Check how deep into the escalation a user is. Admin only.')
  .addUserOption(o =>
    o.setName('user').setDescription('Who to check').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({ content: 'no.', ephemeral: true });
  }

  const target = interaction.options.getUser('user');
  const depth = getDepth(target.id);

  await interaction.reply({
    content: `**${target.username}** — depth ${depth}\n${describeDepth(depth)}`,
    ephemeral: true,
  });
}
