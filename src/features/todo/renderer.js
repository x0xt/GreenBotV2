// src/features/todo/renderer.js
import { EmbedBuilder } from 'discord.js';

export function renderTodoEmbed({ text, done, authorName, authorIcon }) {
  return new EmbedBuilder()
    .setColor(done ? 0x2ecc71 : 0x5865F2)
    .setTitle(done ? '✅ Done' : '📝 To-Do')
    .setDescription(text || '(no text)')
    .setTimestamp()
    .setAuthor(authorName ? { name: authorName, iconURL: authorIcon } : null);
}
