// Cache tone per message so every artifact (reply, lead-in, DM, logs) matches.
const toneByMessage = new Map();

export function setToneForMessage(msgId, toneId) {
  toneByMessage.set(msgId, { toneId, at: Date.now() });
  if (toneByMessage.size > 5000) {
    const cutoff = Date.now() - 60_000;
    for (const [k, v] of toneByMessage) if (v.at < cutoff) toneByMessage.delete(k);
  }
}

export function getToneForMessage(msgId) {
  return toneByMessage.get(msgId)?.toneId ?? null;
}
