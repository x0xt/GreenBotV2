import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import { IMAGE_ALLOWED_EXTENSIONS, IMAGE_MAX_SIZE_BYTES, IMAGE_POOL_ROOT } from '../../shared/constants.js';
import { fetchWithTimeout } from '../../shared/network.js';
import { ensureDir } from '../user/userMemory.js';
import { prunePool } from './imagePool.js';

function contentTypeToExt(ct) {
  if (!ct) return null;
  ct = ct.split(';')[0].trim().toLowerCase();
  switch (ct) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'video/mp4': return '.mp4';
    case 'video/webm': return '.webm';
    case 'video/quicktime': return '.mov';
    default: return null;
  }
}

async function resolveMediaLandingPage(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    if (hostname.endsWith('tenor.com')) {
      if (hostname.startsWith('media.') || hostname.startsWith('c.')) return url;
      const resp = await fetchWithTimeout(url, {}, 8000);
      if (!resp.ok) return null;
      const html = await resp.text();
      const ogVideo = html.match(/property=["']og:video["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogVideo) return ogVideo;
      const ogImage = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
      if (ogImage) return ogImage;
      const contentUrl = html.match(/"contentUrl"\s*:\s*"([^"]+)"/i)?.[1];
      if (contentUrl) return contentUrl;
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function saveImageFromUrl(url) {
  try {
    const resolved = await resolveMediaLandingPage(url) || url;
    const response = await fetchWithTimeout(resolved, {}, 12000);
    if (!response.ok) return false;

    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length'));

    if (Number.isFinite(contentLength) && contentLength > IMAGE_MAX_SIZE_BYTES) {
      console.log(`Skipping large media (${(contentLength / 1024 / 1024).toFixed(2)} MB): ${resolved}`);
      response.body?.destroy();
      return false;
    }

    const extFromCT = contentTypeToExt(contentType) ||
      path.extname(new URL(resolved).pathname.split('?')[0].split('#')[0]).toLowerCase();

    if (!IMAGE_ALLOWED_EXTENSIONS.includes(extFromCT)) {
        response.body?.destroy();
        return false;
    }

    await ensureDir(IMAGE_POOL_ROOT);
    const filename = `${crypto.randomBytes(16).toString('hex')}${extFromCT}`;
    const filepath = path.join(IMAGE_POOL_ROOT, filename);

    await pipeline(response.body, createWriteStream(filepath));
    console.log(`IMAGE GRAB: Saved ${resolved} to ${filename}`);
    await prunePool();
    return true;
  } catch (e) {
    console.error(`IMAGE GRAB ERR: Failed to download ${url}:`, e?.message || e);
    return false;
  }
}

export async function collectImage(msg) {
    const imageUrls = [];
    msg.attachments.forEach(att => imageUrls.push(att.url));
    
    const urlRegex = new RegExp(`https?://\\S+`, 'gi');
    const matches = msg.content.match(urlRegex) || [];
    matches.forEach(url => imageUrls.push(url.replace(/[)>}\]]+$/, '')));

    if (imageUrls.length > 0) {
        for (const url of imageUrls) {
            // Try to save the first valid image we find and then stop.
            if (await saveImageFromUrl(url)) break;
        }
    }
}
