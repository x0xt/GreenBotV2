// Tracks per-user conversation depth for temperature/token budget scaling.
// Depth increments each exchange and resets after 5 minutes of inactivity.

const EXPIRY_MS = 5 * 60 * 1000;

const store = new Map(); // userId -> { depth, lastAt }

export function getDepth(userId) {
  const entry = store.get(userId);
  if (!entry) return 0;
  if (Date.now() - entry.lastAt > EXPIRY_MS) {
    store.delete(userId);
    return 0;
  }
  return entry.depth;
}

export function incrementDepth(userId) {
  const current = getDepth(userId);
  store.set(userId, { depth: current + 1, lastAt: Date.now() });
}

export function resetDepth(userId) {
  store.delete(userId);
}
