// src/features/todo/service.js
import { openDb } from './db.js';

// Create a new todo
export function createTodo({ userId, username, title, guildId = null, channelId = null, messageId = null }) {
  const db = openDb();
  const now = Date.now();

  const info = db.prepare(`
    INSERT INTO todos (
      message_id, channel_id, guild_id,
      title, user_id, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(messageId, channelId, guildId, title, userId, now, now);

  return {
    id: info.lastInsertRowid,
    messageId,
    channelId,
    guildId,
    title,
    userId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
}

// Update status (e.g., 'done' or 'open')
export function setTodoStatus(id, status = 'done') {
  const db = openDb();
  db.prepare(`
    UPDATE todos
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(status, Date.now(), id);
}

// Fetch one
export function getTodo(id) {
  const db = openDb();
  return db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id);
}

// List (handy for future UI)
export function listTodos({ status = 'open', limit = 50 } = {}) {
  const db = openDb();
  return db.prepare(`
    SELECT * FROM todos
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(status, limit);
}
