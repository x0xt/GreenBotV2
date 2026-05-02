// filter/filterDb.js
// SQLite persistence for content filter decisions and hash blocklist.
// Uses better-sqlite3 (synchronous) — same pattern as src/features/todo/dao.js.

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { FILTER_DB_PATH } from '../src/shared/constants.js';

let db;

export function initFilterDb() {
  const dir = path.dirname(FILTER_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(FILTER_DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS filter_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            INTEGER NOT NULL,
      filepath      TEXT    NOT NULL,
      hash_md5      TEXT,
      decision      TEXT    NOT NULL CHECK(decision IN ('cached','blocked_save','blocked_post')),
      reason        TEXT,
      nsfwjs_json   TEXT,
      moondream_raw TEXT,
      source_url    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_fl_ts       ON filter_log(ts);
    CREATE INDEX IF NOT EXISTS idx_fl_decision ON filter_log(decision);
    CREATE INDEX IF NOT EXISTS idx_fl_hash     ON filter_log(hash_md5);

    CREATE TABLE IF NOT EXISTS hash_blocklist (
      hash_md5 TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL,
      reason   TEXT
    );
  `);

  return db;
}

// auto-init on import
if (!db) initFilterDb();

// Prepared statements (cached after first init)
const stmts = {
  logInsert: () => db.prepare(`
    INSERT INTO filter_log (ts, filepath, hash_md5, decision, reason, nsfwjs_json, moondream_raw, source_url)
    VALUES (@ts, @filepath, @hash_md5, @decision, @reason, @nsfwjs_json, @moondream_raw, @source_url)
  `),
  hashCheck:  () => db.prepare(`SELECT 1 FROM hash_blocklist WHERE hash_md5 = ?`),
  hashInsert: () => db.prepare(`INSERT OR IGNORE INTO hash_blocklist (hash_md5, added_at, reason) VALUES (?, ?, ?)`),
  hashDelete: () => db.prepare(`DELETE FROM hash_blocklist WHERE hash_md5 = ?`),
};

let _stmtCache = {};
function stmt(name) {
  if (!_stmtCache[name]) _stmtCache[name] = stmts[name]();
  return _stmtCache[name];
}

export function logFilterDecision({ filepath, hashMd5 = null, decision, reason = null, nsfwjsJson = null, moondreamRaw = null, sourceUrl = null }) {
  try {
    stmt('logInsert').run({
      ts:           Date.now(),
      filepath,
      hash_md5:     hashMd5,
      decision,
      reason,
      nsfwjs_json:  nsfwjsJson,
      moondream_raw: moondreamRaw,
      source_url:   sourceUrl,
    });
  } catch (e) {
    console.error('[filterDb] logFilterDecision failed:', e?.message || e);
  }
}

export function isHashBlocked(hashMd5) {
  try {
    return !!stmt('hashCheck').get(hashMd5);
  } catch (e) {
    console.error('[filterDb] isHashBlocked failed:', e?.message || e);
    return false;
  }
}

export function addToBlocklist(hashMd5, reason = null) {
  try {
    stmt('hashInsert').run(hashMd5, Date.now(), reason);
  } catch (e) {
    console.error('[filterDb] addToBlocklist failed:', e?.message || e);
  }
}

export function removeFromBlocklist(hashMd5) {
  try {
    stmt('hashDelete').run(hashMd5);
  } catch (e) {
    console.error('[filterDb] removeFromBlocklist failed:', e?.message || e);
  }
}
