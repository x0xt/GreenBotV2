// src/commands/todo.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { TODO_CHANNEL_ID, isOwner } from '../shared/constants.js';
import { upsertTodo } from '../features/todo/dao.js';
import { renderTodoEmbed } from '../features/todo/renderer.js';

export const data = new SlashCommandBuilder()
  .setName('todo')
  .setDescription('Create a to-do item (OWNER only)')
  .addStringOption(o =>
    o.setName('text').setDescription('What needs to be done?').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: 'no.', ephemeral: true });
  }

  const text = interaction.options.getString('text');

  if (!TODO_CHANNEL_ID) {
    return interaction.reply({
      content: 'todo channel not configured. tell my owner to set TODO_CHANNEL_ID.',
      ephemeral: true,
    });
  }

  const todoChannel = await interaction.client.channels.fetch(TODO_CHANNEL_ID).catch(() => null);
  if (!todoChannel) {
    return interaction.reply({
      content: "i can’t find the todo channel. config is borked.",
      ephemeral: true,
    });
  }

  try {
    const embed = renderTodoEmbed({
      text,
      done: false,
      authorName: interaction.user.username,
      authorIcon: interaction.user.displayAvatarURL(),
    });

    // Send the embed (needs: Send Messages, Embed Links)
    const msg = await todoChannel.send({ embeds: [embed] });

    // Reactions (needs: Add Reactions, Read Message History)
    await msg.react('✅').catch(() => {});
    await msg.react('🗑️').catch(() => {});

    // Persist immediately with the message id
    upsertTodo({
      messageId: msg.id,
      channelId: msg.channelId,
      guildId: msg.guildId,
      authorId: interaction.user.id,
      text,
      done: 0,
    });

    return interaction.reply({ content: `added it → ${msg.url}`, ephemeral: true });
  } catch (err) {
    console.error('todo command failed:', err);
    return interaction.reply({
      content: `broke: ${err?.message || err}`,
      ephemeral: true,
    });
  }
}
