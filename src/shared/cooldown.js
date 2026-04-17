// Shared cooldown utility — keyed by any string (userId, guildId:userId, etc.)
const store = new Map();

/**
 * Check if a key is on cooldown.
 * Returns seconds remaining, or 0 if not on cooldown.
 */
export function check(key) {
  const until = store.get(key);
  if (!until) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Put a key on cooldown for `ms` milliseconds.
 */
export function set(key, ms) {
  store.set(key, Date.now() + ms);
}
