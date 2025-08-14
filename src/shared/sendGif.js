import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

/** Send a .gif so it actually animates in Discord */
export async function sendGif(channel, pathOrBuffer, {
  embed = true,
  filename = 'lobotomy.gif',
  description = '',
} = {}) {
  const file = new AttachmentBuilder(pathOrBuffer, { name: filename });
  if (!embed) return channel.send({ files: [file] });

  const emb = new EmbedBuilder()
    .setImage(`attachment://${filename}`)
    .setDescription(description);

  return channel.send({ embeds: [emb], files: [file] });
}
