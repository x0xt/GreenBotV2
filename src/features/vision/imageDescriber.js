import { describeImageBase64 } from './visionClient.js';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const SUPPORTED = /\.(jpe?g|png|webp)$/i; // GIFs excluded — model can't process them

export async function describeAttachment(attachment) {
  if (!attachment?.url) return null;
  if (!SUPPORTED.test(attachment.name ?? '')) return null;

  try {
    const res = await fetch(attachment.url);
    if (!res.ok) return null;

    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BYTES) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return null;

    const base64 = Buffer.from(buffer).toString('base64');
    return await describeImageBase64(base64);
  } catch {
    return null;
  }
}
