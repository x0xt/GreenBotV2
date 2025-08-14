import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

// This function already uses AbortController for timeouts, it's very robust.
export async function ollamaChat(text) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: text }],
        stream: false,
        keep_alive: '30m',
        options: { num_predict: 192 }
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
