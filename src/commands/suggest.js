import { EmbedBuilder } from 'discord.js';
import { SUGGEST_CHANNEL_ID, SUGGEST_COOLDOWN_SECONDS } from '../shared/constants.js';

const userCooldowns = new Map();

export const data = {
  name: 'suggest',
  description: 'Submit a suggestion for the bot from anywhere.',
};

export async function execute(msg, args) {
  // --- Cooldown Check (Stays the same) ---
  const cooldown = userCooldowns.get(msg.author.id);
  if (cooldown && Date.now() < cooldown) {
    const timeLeft = Math.ceil((cooldown - Date.now()) / 1000);
    return msg.reply({
      content: `calm down, you can suggest again in ${timeLeft} seconds.`,
      allowedMentions: { parse: [], repliedUser: false }
    });
  }

  const suggestion = args.join(' ');
  if (!suggestion) {
    return msg.reply({
      content: "you forgot to write a suggestion, idiot.",
      allowedMentions: { parse: [], repliedUser: false }
    });
  }

  // --- New Logic to Post to the Suggestion Channel ---
  try {
    // Find the channel using the ID from your .env file
    const suggestionsChannel = await msg.client.channels.fetch(SUGGEST_CHANNEL_ID);
    if (!suggestionsChannel) {
        console.error(`Could not find suggestions channel with ID: ${SUGGEST_CHANNEL_ID}`);
        return msg.reply({ content: "i couldn't find the suggestions channel. my master probably screwed up the config.", allowedMentions: { parse: [], repliedUser: false } });
    }

    // Create a nicely formatted embed message
    const suggestionEmbed = new EmbedBuilder()
        .setColor(0x5865F2) // A nice blue color
        .setTitle('New Suggestion')
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
        .setDescription(suggestion)
        .addFields({ name: 'Submitted From', value: `<#${msg.channel.id}>`, inline: true })
        .setTimestamp();
    
    // Send the embed to the suggestions channel
    await suggestionsChannel.send({ embeds: [suggestionEmbed] });

    // Set the user's cooldown only after a successful submission
    const cooldownSeconds = parseInt(SUGGEST_COOLDOWN_SECONDS, 10);
    userCooldowns.set(msg.author.id, Date.now() + cooldownSeconds * 1000);

    // Confirm to the user that their suggestion was sent
    await msg.reply({
      content: "cool, i've passed your suggestion along to the right place. it's probably still trash though.",
      allowedMentions: { parse: [], repliedUser: false }
    });

  } catch (error) {
    console.error('Failed to post suggestion:', error);
    await msg.reply({
      content: "something broke when i tried to send your suggestion. skill issue.",
      allowedMentions: { parse: [], repliedUser: false }
    });
  }
}
