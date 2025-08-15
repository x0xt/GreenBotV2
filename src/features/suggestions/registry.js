// file: src/features/suggestions/registry.js
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "suggestions.json");

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, "[]", "utf8");
  }
}

async function readAll() {
  await ensureDb();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAll(rows) {
  await ensureDb();
  await fs.writeFile(DB_PATH, JSON.stringify(rows, null, 2), "utf8");
}

export async function recordSuggestion(row) {
  const rows = await readAll();
  rows.push({ ...row, createdAt: Date.now(), notifiedAt: null });
  await writeAll(rows);
}

export async function getByMessageId(messageId) {
  const rows = await readAll();
  return rows.find(r => r.messageId === messageId) ?? null;
}

export async function markNotified(messageId) {
  const rows = await readAll();
  const idx = rows.findIndex(r => r.messageId === messageId);
  if (idx >= 0) {
    rows[idx].notifiedAt = Date.now();
    await writeAll(rows);
    return true;
  }
  return false;
}
