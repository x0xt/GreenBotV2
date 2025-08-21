// src/events/interactionCreate.js

import { Events } from 'discord.js';

export const name = Events.InteractionCreate;

export async function execute(interaction) {
  // We only care about slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    // Run the command's execute function
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}`);
    console.error(error);
    
    // --- CORRECTED ERROR REPLY ---
    // Reply to the user with an error message using the new flags system
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
    }
  }
}
