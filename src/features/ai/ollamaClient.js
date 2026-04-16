import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget(depth = 0) {
  const r = Math.random();
  if (depth >= 50) return Math.floor(Math.random() * 60) + 60;  // 50+: occasionally goes off, capped
  if (depth >= 20) {                               // 20+: getting weirder
    if (r < 0.45) return Math.floor(Math.random() * 15) + 8;    // short:  8-23
    if (r < 0.80) return Math.floor(Math.random() * 30) + 25;   // medium: 25-55
    return Math.floor(Math.random() * 40) + 55;                  // long:   55-95
  }
  if (depth >= 10) {                               // 10-19: warming up
    if (r < 0.55) return Math.floor(Math.random() * 15) + 8;    // short:  8-23
    if (r < 0.88) return Math.floor(Math.random() * 25) + 25;   // medium: 25-50
    return Math.floor(Math.random() * 30) + 50;                  // long:   50-80
  }
  // 0-9: short and weird by default
  if (r < 0.70) return Math.floor(Math.random() * 12) + 20;     // short:  20-32
  if (r < 0.93) return Math.floor(Math.random() * 20) + 33;     // medium: 33-53
  return Math.floor(Math.random() * 20) + 54;                    // long:   54-74
}

function tempForDepth(depth = 0) {
  if (depth >= 50) return 1.4;   // noticeably weird but still words
  if (depth >= 35) return 1.25;  // getting strange
  if (depth >= 20) return 1.15;  // slight drift
  if (depth >= 10) return 1.05;  // barely perceptible
  return 0.95;                   // sharp and coherent
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
