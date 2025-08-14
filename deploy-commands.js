// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// accept CLIENT_ID alias
if (!process.env.DISCORD_CLIENT_ID && process.env.CLIENT_ID) {
  process.env.DISCORD_CLIENT_ID = process.env.CLIENT_ID;
}

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID, // optional
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID/CLIENT_ID in environment.');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const wantGuildOnly   = args.has('--guild');
const wantGlobalOnly  = args.has('--global');
const clearGuild      = args.has('--clear-guild');
const clearGlobal     = args.has('--clear-global');

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function deployGuild(body) {
  if (!DISCORD_GUILD_ID) {
    console.error('DISCORD_GUILD_ID not set; cannot deploy to guild.');
    process.exit(1);
  }
  const data = await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body }
  );
  console.log(`Guild upsert OK (${data.length}) → guild ${DISCORD_GUILD_ID}`);
}

async function deployGlobal(body) {
  const data = await rest.put(
    Routes.applicationCommands(DISCORD_CLIENT_ID),
    { body }
  );
  console.log(`Global upsert OK (${data.length}).`);
  console.log('Note: global changes can take up to ~1h to appear.');
}

async function clearGuildCommands() {
  if (!DISCORD_GUILD_ID) {
    console.error('DISCORD_GUILD_ID not set; cannot clear guild commands.');
    process.exit(1);
  }
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: [] }
  );
  console.log(`Cleared ALL guild commands for ${DISCORD_GUILD_ID}`);
}

async function clearGlobalCommands() {
  await rest.put(
    Routes.applicationCommands(DISCORD_CLIENT_ID),
    { body: [] }
  );
  console.log('Cleared ALL global commands');
}

async function loadCommands() {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  if (!fs.existsSync(commandsPath)) {
    console.error(`Commands path not found: ${commandsPath}`);
    process.exit(1);
  }
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  if (files.length === 0) {
    console.error(`No .js command files found in ${commandsPath}`);
    process.exit(1);
  }
  const cmds = [];
  for (const file of files) {
    const mod = await import(`file://${path.join(commandsPath, file)}`);
    if (!mod?.data?.toJSON) {
      console.warn(`Skipping ${file}: missing export "data" with toJSON()`);
      continue;
    }
    cmds.push(mod.data.toJSON());
  }
  return cmds;
}

(async () => {
  try {
    if (clearGuild)  await clearGuildCommands();
    if (clearGlobal) await clearGlobalCommands();

    if (clearGuild || clearGlobal) return; // only clearing this run

    const commands = await loadCommands();

    if (wantGuildOnly) {
      await deployGuild(commands);
      return;
    }
    if (wantGlobalOnly) {
      await deployGlobal(commands);
      return;
    }

    // Default behavior: if guild id exists, deploy to guild; else deploy globally
    if (DISCORD_GUILD_ID) {
      await deployGuild(commands);
    } else {
      await deployGlobal(commands);
    }
  } catch (err) {
    console.error('Deploy failed:', err?.message || err);
    process.exit(1);
  }
})();
