import { SlashCommandBuilder } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';
import { OWNER_ID, IMAGE_POOL_ROOT } from '../shared/constants.js';
import { getPoolFiles } from '../features/media/imagePool.js';
import { collectImage } from '../features/media/imageCollector.js';

export const data = new SlashCommandBuilder()
    .setName('img')
    .setDescription('Manages the image pool (owner only).')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Adds an image to the pool from a URL.')
            .addStringOption(option => 
                option.setName('url')
                    .setDescription('The direct URL of the image to add')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('count')
            .setDescription('Shows how many images are in the pool.'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('purge')
            .setDescription('Deletes all images from the pool.'));

export async function execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: 'only my master can use these commands.', ephemeral: true });
    }

    const subCommand = interaction.options.getSubcommand();

    if (subCommand === 'add') {
        const url = interaction.options.getString('url');
        await interaction.deferReply({ ephemeral: true }); // Acknowledge the command, as downloading can take time
        const success = await collectImage({ content: url, attachments: new Map() });
        return interaction.editReply({ content: success ? 'image added.' : 'failed to add image. is it a valid link?' });
    }

    if (subCommand === 'count') {
        const files = await getPoolFiles();
        return interaction.reply({ content: `image pool contains ${files.length} files.`, ephemeral: true });
    }

    if (subCommand === 'purge') {
        await interaction.deferReply({ ephemeral: true });
        const files = await getPoolFiles();
        let deletedCount = 0;
        for (const file of files) {
            try {
                await fs.unlink(path.join(IMAGE_POOL_ROOT, file));
                deletedCount++;
            } catch {}
        }
        return interaction.editReply({ content: `purged ${deletedCount} images from the pool.` });
    }
}
