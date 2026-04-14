import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget() {
  const r = Math.random();
  if (r < 0.35) return Math.floor(Math.random() * 30) + 30;   // 35%: 30-60 tokens — one-liner
  if (r < 0.65) return Math.floor(Math.random() * 80) + 80;   // 30%: 80-160 tokens — medium
  return Math.floor(Math.random() * 120) + 180;                // 35%: 180-300 tokens — full rant
}

// This function already uses AbortController for timeouts, it's very robust.
export async function ollamaChat(messages) {
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
        options: { num_predict: randomTokenBudget() }
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
