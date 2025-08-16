// src/features/todo/dao.js
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { TODO_DB_PATH } from '../../shared/constants.js';

let db;

export function initTodoDB() {
  const dir = path.dirname(TODO_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(TODO_DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      channel_id TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      author_id  TEXT NOT NULL,
      text       TEXT NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todos_message ON todos(message_id);
  `);
  return db;
}

// auto-init
if (!db) initTodoDB();

const now = () => Date.now();

// Insert or update by messageId
export function upsertTodo(row) {
  const hasMessage = !!row.messageId;
  const existing = hasMessage
    ? db.prepare(`SELECT id FROM todos WHERE message_id = ?`).get(row.messageId)
    : null;

  if (existing) {
    db.prepare(`
      UPDATE todos
         SET text=@text, done=@done, updated_at=@updated_at
       WHERE message_id=@message_id
    `).run({
      text: row.text,
      done: row.done ? 1 : 0,
      updated_at: now(),
      message_id: row.messageId,
    });
    return existing.id;
  }

  const info = db.prepare(`
    INSERT INTO todos (message_id, channel_id, guild_id, author_id, text, done, created_at, updated_at)
    VALUES (@message_id, @channel_id, @guild_id, @author_id, @text, @done, @created_at, @updated_at)
  `).run({
    message_id: row.messageId ?? null,
    channel_id: row.channelId,
    guild_id:   row.guildId,
    author_id:  row.authorId,
    text:       row.text,
    done:       row.done ? 1 : 0,
    created_at: now(),
    updated_at: now(),
  });

  return info.lastInsertRowid;
}

// ---- Lookups ----
export function getByMessageId(messageId) {
  return db.prepare(`SELECT * FROM todos WHERE message_id=?`).get(messageId);
}
export function getTodo(id) {
  return db.prepare(`SELECT * FROM todos WHERE id=?`).get(id);
}
export function listTodos(limit = 50) {
  return db.prepare(`SELECT * FROM todos ORDER BY created_at DESC LIMIT ?`).all(limit);
}

// ---- Mutations by numeric id ----
export function toggleTodo(id) {
  const r = db.prepare(`SELECT done FROM todos WHERE id=?`).get(id);
  if (!r) return null;
  const newVal = r.done ? 0 : 1;
  db.prepare(`UPDATE todos SET done=@d, updated_at=@u WHERE id=@id`)
    .run({ d: newVal, u: now(), id });
  return newVal;
}
export function deleteTodo(id) {
  db.prepare(`DELETE FROM todos WHERE id=?`).run(id);
}

// ---- Aliases by message id (handy for reaction handler) ----
export function toggleByMessageId(messageId) {
  const row = getByMessageId(messageId);
  if (!row) return null;
  return toggleTodo(row.id);
}
export function deleteByMessageId(messageId) {
  const row = getByMessageId(messageId);
  if (!row) return null;
  deleteTodo(row.id);
  return true;
}
