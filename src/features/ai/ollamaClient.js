import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget(depth = 0) {
  const r = Math.random();
  if (depth >= 50) return -1;                      // 50+: no limit, full chaos
  if (depth >= 20) {                               // 20+: getting ranty
    if (r < 0.20) return Math.floor(Math.random() * 20) + 15;   // short:  15-35
    if (r < 0.55) return Math.floor(Math.random() * 40) + 40;   // medium: 40-80
    return Math.floor(Math.random() * 80) + 90;                  // long:   90-170
  }
  if (depth >= 10) {                               // 10-19: warming up
    if (r < 0.35) return Math.floor(Math.random() * 20) + 15;   // short:  15-35
    if (r < 0.75) return Math.floor(Math.random() * 35) + 35;   // medium: 35-70
    return Math.floor(Math.random() * 60) + 75;                  // long:   75-135
  }
  // 0-9: normal person length — short and snappy
  if (r < 0.60) return Math.floor(Math.random() * 15) + 10;     // short:  10-25
  if (r < 0.90) return Math.floor(Math.random() * 25) + 25;     // medium: 25-50
  return Math.floor(Math.random() * 35) + 55;                    // long:   55-90
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
