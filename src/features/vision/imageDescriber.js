import sharp from 'sharp';

const MAX_BYTES = 10 * 1024 * 1024;
const SUPPORTED = /\.(jpe?g|png|gif|webp)$/i;

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('attachment too large');
  return Buffer.from(buf);
}

// Extract first frame of GIF as JPEG buffer
async function gifFirstFrame(buffer) {
  return sharp(buffer, { pages: 1 })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Returns { base64, isGif } or null
export async function prepareAttachment(attachment) {
  if (!attachment?.url) return null;
  if (!SUPPORTED.test(attachment.name ?? '')) return null;

  try {
    const buffer = await fetchBuffer(attachment.url);
    const isGif = /\.gif$/i.test(attachment.name ?? '') || attachment.contentType?.includes('gif');

    const finalBuffer = isGif ? await gifFirstFrame(buffer) : buffer;
    return { base64: finalBuffer.toString('base64'), isGif };
  } catch {
    return null;
  }
}
