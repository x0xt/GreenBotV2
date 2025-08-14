// src/shared/network.js

// Node 18+ has global fetch; this helper adds a timeout to it.
export function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal })
    .finally(() => clearTimeout(t));
}
