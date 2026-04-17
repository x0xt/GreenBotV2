import { SlashCommandBuilder } from 'discord.js';
import { ollamaChat } from '../features/ai/ollamaClient.js';
import { shapeWithSeed } from '../features/ai/tone.js';
import { safe } from '../shared/safe.js';
import { replaceBotRefs, stripExoticUnicode } from '../features/ai/aiHandler.js';
import { check as cooldownCheck, set as cooldownSet } from '../shared/cooldown.js';

const ROAST_COOLDOWN_MS = 30_000;

export const data = new SlashCommandBuilder()
  .setName('roast')
  .setDescription('Make greenbot go after someone.')
  .addUserOption(o =>
    o.setName('target').setDescription('Who to roast').setRequired(true)
  );

export async function execute(interaction) {
  const remaining = cooldownCheck(`roast:${interaction.user.id}`);
  if (remaining > 0) {
    return interaction.reply({ content: `slow down. ${remaining}s left.`, ephemeral: true });
  }

  const target = interaction.options.getUser('target');
  if (target.id === interaction.client.user.id) {
    return interaction.reply({ content: 'nice try.', ephemeral: true });
  }

  await interaction.deferReply();
  cooldownSet(`roast:${interaction.user.id}`, ROAST_COOLDOWN_MS);

  try {
    const prompt = `say something short and dismissive to ${target.username}. one or two lines max.`;
    const raw = await ollamaChat([{ role: 'user', content: prompt }], 0);
    const shaped = shapeWithSeed(raw, 1800, `${interaction.id}:${target.id}`);
    const stripped = stripExoticUnicode(shaped);
    const clean = stripped.replace(/[^a-zA-Z0-9]/g, '').length < 3 ? 'no.' : stripped;

    await interaction.editReply({ content: `${target} ${safe(replaceBotRefs(clean))}` });
  } catch {
    await interaction.editReply({ content: 'model is busy. try again.' });
  }
}
