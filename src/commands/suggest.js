import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { SUGGEST_CHANNEL_ID, SUGGEST_COOLDOWN_SECONDS } from '../shared/constants.js';

const userCooldowns = new Map();

export const data = new SlashCommandBuilder()
	.setName('suggest')
	.setDescription('Submit a suggestion for the bot.')
    .addStringOption(option =>
        option.setName('suggestion')
            .setDescription('Your brilliant idea')
            .setRequired(true));

export async function execute(interaction) {
    const cooldown = userCooldowns.get(interaction.user.id);
    if (cooldown && Date.now() < cooldown) {
        const timeLeft = Math.ceil((cooldown - Date.now()) / 1000);
        return interaction.reply({ content: `calm down, you can suggest again in ${timeLeft} seconds.`, ephemeral: true });
    }

    const suggestionText = interaction.options.getString('suggestion');

    try {
        const suggestionsChannel = await interaction.client.channels.fetch(SUGGEST_CHANNEL_ID);
        if (!suggestionsChannel) {
            console.error(`Could not find suggestions channel with ID: ${SUGGEST_CHANNEL_ID}`);
            return interaction.reply({ content: "i couldn't find the suggestions channel. my master probably screwed up the config.", ephemeral: true });
        }

        const suggestionEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('New Suggestion')
            .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(suggestionText)
            .addFields({ name: 'Submitted From', value: `<#${interaction.channel.id}>`, inline: true })
            .setTimestamp();
        
        await suggestionsChannel.send({ embeds: [suggestionEmbed] });

        const cooldownSeconds = parseInt(SUGGEST_COOLDOWN_SECONDS, 10);
        userCooldowns.set(interaction.user.id, Date.now() + cooldownSeconds * 1000);

        await interaction.reply({ content: "cool, i've passed your suggestion along. it's probably still trash though.", ephemeral: true });

    } catch (error) {
        console.error('Failed to post suggestion:', error);
        await interaction.reply({ content: "something broke when i tried to send your suggestion. skill issue.", ephemeral: true });
    }
}
