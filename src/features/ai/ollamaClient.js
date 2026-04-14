import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget(depth = 0) {
  const r = Math.random();
  if (depth >= 50) return -1;                       // 50+ exchanges: no limit, full chaos
  if (depth >= 15) {                                // 15+ exchanges: mostly long, occasional rant
    if (r < 0.05) return Math.floor(Math.random() * 30) + 20;
    if (r < 0.20) return Math.floor(Math.random() * 80) + 60;
    return Math.floor(Math.random() * 200) + 280;   // 280-480 tokens — walls of text
  }
  if (depth >= 10) {                                // 10-14 exchanges: long dominant
    if (r < 0.10) return Math.floor(Math.random() * 30) + 20;
    if (r < 0.35) return Math.floor(Math.random() * 80) + 60;
    return Math.floor(Math.random() * 150) + 200;   // 200-350 tokens
  }
  if (depth >= 8) {                                 // 8-9 exchanges: even split
    if (r < 0.25) return Math.floor(Math.random() * 30) + 20;
    if (r < 0.55) return Math.floor(Math.random() * 80) + 60;
    return Math.floor(Math.random() * 130) + 160;   // 160-290 tokens
  }
  // 0-7 exchanges: short/medium heavy
  if (r < 0.55) return Math.floor(Math.random() * 30) + 20;             // short: 20-50
  if (r < 0.90) return Math.floor(Math.random() * 80) + 60;             // medium: 60-140
  return Math.floor(Math.random() * 100) + 150;                          // long: 150-250
}

function tempForDepth(depth = 0) {
  if (depth >= 50) return 1.9;   // deeply unhinged, barely coherent
  if (depth >= 35) return 1.75;
  if (depth >= 20) return 1.6;
  if (depth >= 10) return 1.5;
  return 1.4;                    // base
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
