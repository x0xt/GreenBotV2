import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { SUGGEST_CHANNEL_ID, SUGGEST_COOLDOWN_SECONDS } from '../shared/constants.js';
import { recordSuggestion } from '../features/suggestions/registry.js';
import { check as cooldownCheck, set as cooldownSet } from '../shared/cooldown.js';

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Submit a suggestion for the bot.')
  .addStringOption(option =>
    option.setName('suggestion')
      .setDescription('Your brilliant idea')
      .setRequired(true)
  );

export async function execute(interaction) {
  const remaining = cooldownCheck(`suggest:${interaction.user.id}`);
  if (remaining > 0) {
    return interaction.reply({ content: `${remaining}s. wait.`, flags: MessageFlags.Ephemeral });
  }

  const suggestionText = interaction.options.getString('suggestion');

  try {
    const suggestionsChannel = await interaction.client.channels.fetch(SUGGEST_CHANNEL_ID);
    if (!suggestionsChannel) {
      console.error(`Could not find suggestions channel with ID: ${SUGGEST_CHANNEL_ID}`);
      return interaction.reply({ content: "suggestions channel is gone. config is borked.", flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('New Suggestion')
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(suggestionText)
      .addFields({ name: 'Submitted From', value: `<#${interaction.channel.id}>`, inline: true })
      .setTimestamp();

    const posted = await suggestionsChannel.send({ embeds: [embed] });

    // auto-react so you can approve later
    await posted.react('✅').catch(() => {});

    // record mapping so the reaction handler can DM later
    const link = posted.url; // discord deep link
    await recordSuggestion({
      messageId: posted.id,
      userId: interaction.user.id,
      username: interaction.user.username,
      guildId: posted.guildId,
      channelId: posted.channelId,
      text: suggestionText,
      link,
    });

    cooldownSet(`suggest:${interaction.user.id}`, parseInt(SUGGEST_COOLDOWN_SECONDS, 10) * 1000);

    await interaction.reply({ content: "sent. probably won't matter.", flags: MessageFlags.Ephemeral });

  } catch (error) {
    console.error('Failed to post suggestion:', error);
    await interaction.reply({ content: "broke. try again or don't.", flags: MessageFlags.Ephemeral });
  }
}
