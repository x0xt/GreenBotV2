// file: src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCommands } from './loaders/commandLoader.js';
import { loadEvents } from './loaders/eventLoader.js';

// --- Environment ---
const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('FATAL: DISCORD_TOKEN missing in env');
  process.exit(1);
}

// --- Safety Nets ---
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
client.commands = new Collection();

async function bootstrap() {
  // Commands strictly from src/commands
  const names = await loadCommands(client, __dirname);
  console.log('[commands] loaded:', names.length ? names : '(none)');

  // Events from src/events
  const eventCount = await loadEvents(client, __dirname);
  console.log(`[events] loaded: ${eventCount}`);

  console.log('Logging in...');
  await client.login(DISCORD_TOKEN);

  // Keep the process alive
  setInterval(() => {}, 1 << 30);
}

// graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down…`);
    client.destroy();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('FATAL bootstrap error:', err);
  process.exit(1);
});
