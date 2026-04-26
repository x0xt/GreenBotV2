import { OLLAMA_HOST, MODEL, REQ_TIMEOUT_MS } from '../../shared/constants.js';

function randomTokenBudget(depth = 0) {
  const r = Math.random();
  if (depth >= 50) return Math.floor(Math.random() * 80) + 80;  // 50+: unhinged wall of text
  if (depth >= 20) {                               // 20+: getting weirder
    if (r < 0.45) return Math.floor(Math.random() * 20) + 40;   // short:  40-60
    if (r < 0.80) return Math.floor(Math.random() * 40) + 60;   // medium: 60-100
    return Math.floor(Math.random() * 50) + 100;                 // long:   100-150
  }
  if (depth >= 10) {                               // 10-19: warming up
    if (r < 0.55) return Math.floor(Math.random() * 20) + 40;   // short:  40-60
    if (r < 0.88) return Math.floor(Math.random() * 40) + 60;   // medium: 60-100
    return Math.floor(Math.random() * 50) + 100;                 // long:   100-150
  }
  // 0-9: punchy but complete sentences
  if (r < 0.70) return Math.floor(Math.random() * 20) + 40;     // short:  40-60
  if (r < 0.93) return Math.floor(Math.random() * 40) + 60;     // medium: 60-100
  return Math.floor(Math.random() * 50) + 100;                   // long:   100-150
}

function tempForDepth(depth = 0) {
  if (depth >= 50) return 1.4;   // noticeably weird but still words
  if (depth >= 35) return 1.25;  // getting strange
  if (depth >= 20) return 1.15;  // slight drift
  if (depth >= 10) return 1.05;  // barely perceptible
  return 1.15;                   // punchy but not too precise
}

// This function already uses AbortController for timeouts, it's very robust.
export async function ollamaNovel(messages) {
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
        think: false,
        keep_alive: -1,
        options: { num_predict: 700, temperature: 1.15 }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ollama ${res.status} ${res.statusText} :: ${body}`);
    }
    const data = await res.json().catch(e => { throw new Error(`ollama JSON parse error :: ${e?.message || e}`); });
    const raw = data?.message?.content ?? '';
    const thinkEnd = raw.indexOf('</think>');
    const out = (thinkEnd !== -1 ? raw.slice(thinkEnd + 8) : raw.replace(/<think>[\s\S]*/gi, '')).trim();
    return (out || '…').slice(0, 1900).trim();
  } finally {
    clearTimeout(t);
  }
}

export async function ollamaChat(messages, depth = 0, { hasImage = false } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  const budget = hasImage ? Math.max(randomTokenBudget(depth), 120) : randomTokenBudget(depth);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        think: false,
        keep_alive: -1,
        options: { num_predict: budget, temperature: tempForDepth(depth) }
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ollama ${res.status} ${res.statusText} :: ${body}`);
    }
    const data = await res.json().catch(e => { throw new Error(`ollama JSON parse error :: ${e?.message || e}`); });
    const raw = data?.message?.content ?? '';
    // extract only what comes after </think> — if no closing tag, the whole response is thinking, discard it
    const thinkEnd = raw.indexOf('</think>');
    const out = (thinkEnd !== -1 ? raw.slice(thinkEnd + 8) : raw.replace(/<think>[\s\S]*/gi, '')).trim();
    return (out || '…').slice(0, 1900).trim();
  } finally {
    clearTimeout(t);
  }
}
