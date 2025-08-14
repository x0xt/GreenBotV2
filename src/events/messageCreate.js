import { Events, ChannelType } from 'discord.js';
import { touchUserMemory } from '../features/user/userMemory.js';
import { handleAiChat } from '../features/ai/aiHandler.js';
import { collectImage } from '../features/media/imageCollector.js';
import { INTERJECT_ENABLED, INTERJECT_PROB, INTERJECT_COOLDOWN_MS } from '../shared/constants.js';

const lastInterjectAt = new Map();
const canInterject = (ch) => (Date.now() - (lastInterjectAt.get(ch) ?? 0)) >= INTERJECT_COOLDOWN_MS;
const markInterject = (ch) => lastInterjectAt.set(ch, Date.now());

export const name = Events.MessageCreate;
export const once = false;

export async function execute(msg) {
  try {
    if (msg.author.bot) return;

    // Concurrently try to collect images and touch user memory
    await Promise.all([
        collectImage(msg),
        touchUserMemory(msg.guild?.id, msg.author.id, msg.author.username)
    ]);

    const rawContent = (msg.content || '').trim();
    const prefix = '!gb ';
    
    const inDM = msg.channel?.type === ChannelType.DM;
    const mentioned = msg.mentions.users?.has?.(msg.client.user.id);
    const isCommand = rawContent.toLowerCase().startsWith(prefix);
    
    // --- Command Handling ---
    if (isCommand) {
      const args = rawContent.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      
      // Route to the appropriate command file
      const command = msg.client.commands.get(commandName);
      if (command) {
        try {
          await command.execute(msg, args);
        } catch (error) {
          console.error(`Error executing command ${commandName}:`, error);
          await msg.reply({ content: 'that command broke, you probably fucked it up.', allowedMentions: { parse: [], repliedUser: false } });
        }
        return; // Stop further processing if it was a command
      }
    }
    
    // --- AI Chat Handling ---
    const targeted = inDM || mentioned;
    let interjecting = false;
    if (!targeted && INTERJECT_ENABLED && msg.guild && canInterject(msg.channel.id) && Math.random() < INTERJECT_PROB) {
      interjecting = true;
      markInterject(msg.channel.id);
    }
    
    if (targeted || interjecting) {
        await handleAiChat(msg, interjecting);
    }

  } catch (outer) {
    console.error('HANDLER ERR:', outer);
  }
}
