// file: src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Environment Setup ---
const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('FATAL: DISCORD_TOKEN missing in env');
  process.exit(1);
}

// --- Global Safety Nets & Shutdown ---
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

const shutdown = (sig) => () => {
  console.log(`\n${sig} received, shutting down…`);
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions, // ← needed for ✅ reacts
    GatewayIntentBits.DirectMessages,        // DM slash replies + DMs
  ],
  partials: [
    Partials.Message,  // ← needed to fetch uncached messages
    Partials.Channel,  // ← needed for DMs
    Partials.Reaction, // ← needed to receive reaction events
  ],
});

// --- Command Handling ---
client.commands = new Collection();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = `file://${path.join(commandsPath, file)}`;
  const command = await import(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// --- Event Handling ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = `file://${path.join(eventsPath, file)}`;
  const event = await import(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// --- Main Execution ---
async function main() {
  try {
    console.log('Logging in...');
    await client.login(DISCORD_TOKEN);

    // keep-alive
    setInterval(() => {}, 1 << 30);
  } catch (error) {
    console.error('FATAL: Failed to log in. Is your DISCORD_TOKEN correct?', error);
    process.exit(1);
  }
}
main();
