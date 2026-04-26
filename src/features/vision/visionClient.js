import { REQ_TIMEOUT_MS } from '../../shared/constants.js';

const VISION_HOST = process.env.VISION_HOST ?? 'http://127.0.0.1:11436';
const VISION_MODEL = process.env.VISION_MODEL ?? 'huihui_ai/gemma-4-abliterated:e2b';

export async function describeImageBase64(base64, mimeType = 'image/jpeg') {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${VISION_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{
          role: 'user',
          content: 'describe what is in this image in one short sentence. be blunt and literal.',
          images: [base64],
        }],
        stream: false,
        options: { num_predict: 80, temperature: 0.3 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`vision ollama ${res.status}`);
    const data = await res.json();
    return (data?.message?.content ?? '').trim().slice(0, 300) || null;
  } finally {
    clearTimeout(t);
  }
}
