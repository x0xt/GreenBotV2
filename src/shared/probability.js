// Simple RNG + per-bucket cooldown map

const cooldownBuckets = new Map();

export function roll(prob = 0.4) {
  const p = Number(prob);
  if (Number.isNaN(p) || p <= 0) return false;
  if (p >= 1) return true;
  return Math.random() < p;
}

/**
 * cooldownOk("channelId", 8000, "media")
 * Returns true if cooldown elapsed; records the hit on success.
 */
export function cooldownOk(key, cooldownMs = 8000, bucket = "default") {
  const now = Date.now();
  const map = ensureBucket(bucket);
  const last = map.get(key) ?? 0;
  if (now - last < Number(cooldownMs)) return false;
  map.set(key, now);
  return true;
}

function ensureBucket(bucket) {
  if (!cooldownBuckets.has(bucket)) cooldownBuckets.set(bucket, new Map());
  return cooldownBuckets.get(bucket);
}

