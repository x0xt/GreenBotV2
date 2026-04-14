import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget(depth = 0) {
  const r = Math.random();
  if (depth >= 50) return -1;                       // 50+ exchanges: no limit, full chaos
  if (depth >= 15) {                                // 15+ exchanges: mostly long
    if (r < 0.10) return Math.floor(Math.random() * 40) + 60;   // short: 60-100
    if (r < 0.30) return Math.floor(Math.random() * 80) + 100;  // medium: 100-180
    return Math.floor(Math.random() * 120) + 180;                // long: 180-300
  }
  if (depth >= 10) {                                // 10-14 exchanges: long dominant
    if (r < 0.15) return Math.floor(Math.random() * 40) + 60;   // short: 60-100
    if (r < 0.45) return Math.floor(Math.random() * 80) + 100;  // medium: 100-180
    return Math.floor(Math.random() * 100) + 160;                // long: 160-260
  }
  if (depth >= 8) {                                 // 8-9 exchanges: even split
    if (r < 0.30) return Math.floor(Math.random() * 40) + 60;   // short: 60-100
    if (r < 0.65) return Math.floor(Math.random() * 70) + 90;   // medium: 90-160
    return Math.floor(Math.random() * 80) + 140;                 // long: 140-220
  }
  // 0-7 exchanges: short and punchy
  if (r < 0.55) return Math.floor(Math.random() * 30) + 35;     // short: 35-65
  if (r < 0.90) return Math.floor(Math.random() * 50) + 65;     // medium: 65-115
  return Math.floor(Math.random() * 60) + 120;                   // long: 120-180
}

function tempForDepth(depth = 0) {
  if (depth >= 50) return 1.9;   // full word salad, barely coherent
  if (depth >= 35) return 1.6;   // losing it
  if (depth >= 20) return 1.3;   // noticeably off
  if (depth >= 10) return 1.1;   // slight weirdness creeping in
  return 1.05;                   // punchy and mean, not a reddit essay
}

// This function already uses AbortController for timeouts, it's very robust.
export async function ollamaChat(messages, depth = 0) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        keep_alive: '30m',
        options: { num_predict: randomTokenBudget(depth), temperature: tempForDepth(depth) }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ollama ${res.status} ${res.statusText} :: ${body}`);
    }
    const data = await res.json().catch(e => { throw new Error(`ollama JSON parse error :: ${e?.message || e}`); });
    const out = data?.message?.content ?? '';
    return (out || '…').slice(0, 1900).trim();
  } finally {
    clearTimeout(t);
  }
}
