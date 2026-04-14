// Per-channel short-term conversation history for multi-turn context.
// Keyed by channel ID. Expires after 30min of inactivity.

const MAX_MESSAGES = 8; // 4 back-and-forths
const EXPIRY_MS = 30 * 60 * 1000;

const store = new Map();

function getEntry(channelId) {
  const entry = store.get(channelId);
  if (!entry) return null;
  if (Date.now() - entry.lastAt > EXPIRY_MS) {
    store.delete(channelId);
    return null;
  }
  return entry;
}

export function getHistory(channelId) {
  return getEntry(channelId)?.messages ?? [];
}

export function pushHistory(channelId, role, content) {
  const entry = getEntry(channelId) ?? { messages: [], lastAt: 0 };
  entry.messages.push({ role, content });
  if (entry.messages.length > MAX_MESSAGES) {
    entry.messages = entry.messages.slice(-MAX_MESSAGES);
  }
  entry.lastAt = Date.now();
  store.set(channelId, entry);
}

export function clearHistory(channelId) {
  store.delete(channelId);
}
