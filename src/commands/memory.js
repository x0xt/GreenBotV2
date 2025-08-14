import { SlashCommandBuilder } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir, readUserMemory, userFilePath } from '../features/user/userMemory.js';

export const data = new SlashCommandBuilder()
	.setName('mem')
	.setDescription('Manages your user memory file.')
    .addSubcommand(subcommand =>
        subcommand
            .setName('show')
            .setDescription('Shows the last 40 lines of your memory file.'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('clear')
            .setDescription('Wipes your memory file clean.'));

export async function execute(interaction) {
    const subCommand = interaction.options.getSubcommand();
    const file = userFilePath(interaction.guild?.id, interaction.user.id);

    if (subCommand === 'show') {
        try {
            await ensureDir(path.dirname(file));
            const memoryContent = await readUserMemory(interaction.guild?.id, interaction.user.id);
            const content = memoryContent ? `\`\`\`\n${memoryContent}\n\`\`\`` : 'no notes.';
            return interaction.reply({ content, ephemeral: true });
        } catch {
            return interaction.reply({ content: 'no notes.', ephemeral: true });
        }
    }

    if (subCommand === 'clear') {
        try {
            await fs.unlink(file);
        } catch (e) { /* Ignore error if file doesn't exist */ }
        return interaction.reply({ content: 'notes wiped.', ephemeral: true });
    }
}
