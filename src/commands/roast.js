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
    return interaction.reply({ content: `not yet. ${remaining}s.`, ephemeral: true });
  }

  const target = interaction.options.getUser('target');
  if (target.id === interaction.client.user.id) {
    return interaction.reply({ content: 'no.', ephemeral: true });
  }

  await interaction.deferReply();
  cooldownSet(`roast:${interaction.user.id}`, ROAST_COOLDOWN_MS);

  try {
    const prompt = `deliver a brutal one-liner about ${target.username}. do NOT address them directly — make a declaration about them to the room. one line.`;
    const raw = await ollamaChat([{ role: 'user', content: prompt }], 0);
    const shaped = shapeWithSeed(raw, 1800, `${interaction.id}:${target.id}`);
    const stripped = stripExoticUnicode(shaped);
    const clean = stripped.replace(/[^a-zA-Z0-9]/g, '').length < 3 ? 'no.' : stripped;

    await interaction.editReply({ content: `${target} ${safe(replaceBotRefs(clean))}` });
  } catch {
    await interaction.editReply({ content: 'busy. whatever.' });
  }
}
