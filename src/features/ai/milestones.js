// Tracks per-user message counts and fires easter egg milestones.
// Persists to SQLite so counts survive restarts.

import Database from 'better-sqlite3';
import path from 'path';
import { DATA_DIR } from '../../shared/constants.js';

const DB_PATH = path.join(DATA_DIR, 'milestones.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_counts (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS milestone_reaches (
    milestone INTEGER NOT NULL PRIMARY KEY,
    reach_count INTEGER NOT NULL DEFAULT 0
  );
`);

const MILESTONES = [100, 250, 1000];

const MILESTONE_MSGS = {
  100: (n) => `wait hold on\n\ncongratulations. genuinely. you just sent your 100th message to me. you are the ${ordinal(n)} person to do this. i don't know what's wrong with you but i respect it. now fuck off.`,
  250: (n) => `ok STOP.\n\nyou have sent me 250 messages. TWO HUNDRED AND FIFTY. you are the ${ordinal(n)} person in history to waste this much of your life talking to me. your parents would be so proud. keep going i guess.`,
  1000: (n) => `...\n\nbro.\n\n1000 messages. ONE THOUSAND. you are the ${ordinal(n)} person to ever reach 1000 messages with me and i genuinely don't know how to feel about that. there should be a support group for you. there is something deeply wrong with you and i mean that from the bottom of my heart. congratulations i guess. weirdo.`,
};

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const incrementStmt = db.prepare(`
  INSERT INTO user_counts (user_id, guild_id, count) VALUES (?, ?, 1)
  ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + 1
  RETURNING count
`);

const getMilestoneReachStmt = db.prepare(`
  INSERT INTO milestone_reaches (milestone, reach_count) VALUES (?, 1)
  ON CONFLICT(milestone) DO UPDATE SET reach_count = reach_count + 1
  RETURNING reach_count
`);

// Call after every real bot reply to a user.
// Returns an easter egg string if a milestone was hit, null otherwise.
export function trackAndCheck(userId, guildId) {
  const row = incrementStmt.get(userId, guildId ?? 'dm');
  const count = row?.count ?? 0;

  if (MILESTONES.includes(count)) {
    const reachRow = getMilestoneReachStmt.get(count);
    const nthPerson = reachRow?.reach_count ?? 1;
    return MILESTONE_MSGS[count](nthPerson);
  }
  return null;
}
