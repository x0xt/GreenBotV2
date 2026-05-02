// filter/contentFilter.js
// Two-layer content filter for the image pool.
//
// Layer 1 (save-time): nsfwjs fast pre-screen → moondream2 contextual verdict.
//   Blocks CSAM and gore. Adult porn is permitted.
//   On block: refuse to cache, log to DB, ping report channel.
//
// Layer 2 (post-time): hash blocklist check only — handled in imagePool.js.

// IMPORTANT: @tensorflow/tfjs-node must be imported before nsfwjs.
// It registers the native TF backend used by the classifier.
import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

import {
  OLLAMA_HOST,
  FILTER_REPORT_CHANNEL,
  FILTER_NSFWJS_FAST_PASS_NEUTRAL,
  FILTER_NSFWJS_BLOCK_PORN,
  FILTER_NSFWJS_BLOCK_SEXY,
  FILTER_MOONDREAM_TIMEOUT_MS,
} from '../src/shared/constants.js';

import { logFilterDecision, isHashBlocked, addToBlocklist } from './filterDb.js';
import { getClient } from './filterClient.js';

// ---------------------------------------------------------------------------
// STUB: PhotoDNA / Thorn Safer cloud hash-matching
//
// To enable: apply at https://www.thorn.org/safer/ (Thorn Safer platform API)
// or Microsoft PhotoDNA Cloud Service (via NCMEC partnership).
// Both accept an image and return whether it matches known CSAM hashes.
//
// Replace this function body with your provider's API call when approved.
// Return { matched: true } to block the image immediately, before any ML runs.
// ---------------------------------------------------------------------------
async function checkPhotoDNA(/* base64String */) {
  return { matched: false };
}

// ---------------------------------------------------------------------------
// nsfwjs model — lazy singleton, loaded once
// ---------------------------------------------------------------------------
let _nsfwModel = null;

async function getNsfwModel() {
  if (!_nsfwModel) {
    // Uses the MobileNetV2 model bundled with the nsfwjs package — no separate download needed.
    _nsfwModel = await nsfwjs.load();
    console.log('[filter] nsfwjs model loaded');
  }
  return _nsfwModel;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);

// Resize to 224×224 JPEG for nsfwjs (extracts first frame for GIFs).
async function prepareImageForNsfwjs(buffer) {
  return sharp(buffer, { pages: 1 })
    .resize(224, 224, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// Resize to max 512×512 JPEG for moondream2 (keeps inference time bounded).
async function prepareImageForMoondream(buffer) {
  return sharp(buffer, { pages: 1 })
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// nsfwjs classification
// ---------------------------------------------------------------------------

async function classifyWithNsfwjs(buffer) {
  const model  = await getNsfwModel();
  const resized = await prepareImageForNsfwjs(buffer);
  const tensor  = tf.node.decodeImage(resized, 3);
  let predictions;
  try {
    predictions = await model.classify(tensor);
  } finally {
    tensor.dispose(); // prevent TF memory leak — must always run
  }
  return predictions; // [{className, probability}, ...]
}

// Returns true if nsfwjs is confident enough to block as porn outright.
function nsfwjsBlocks(predictions) {
  const byClass = Object.fromEntries(predictions.map(p => [p.className, p.probability]));
  if ((byClass['Porn']   ?? 0) >= FILTER_NSFWJS_BLOCK_PORN) return true;
  if ((byClass['Hentai'] ?? 0) >= FILTER_NSFWJS_BLOCK_PORN) return true;
  if ((byClass['Sexy']   ?? 0) >= FILTER_NSFWJS_BLOCK_SEXY) return true;
  return false;
}

// Returns true if nsfwjs is very confident the image is clean — skip moondream2.
function nsfwjsFastPass(predictions) {
  const byClass = Object.fromEntries(predictions.map(p => [p.className, p.probability]));
  // High neutral confidence AND no meaningful porn signal
  return (byClass['Neutral'] ?? 0) >= FILTER_NSFWJS_FAST_PASS_NEUTRAL
      && (byClass['Porn']    ?? 0) < 0.05
      && (byClass['Hentai']  ?? 0) < 0.05;
}

// ---------------------------------------------------------------------------
// moondream2 classification via Ollama
// ---------------------------------------------------------------------------

const MOONDREAM_PROMPT = `Look at this image. Answer one question with yes or no:
Does this image contain graphic gore, severe bodily injury, or graphic violence?

Reply with exactly this format and nothing else:
GORE: yes|no`;

function parseMoondreamResponse(raw) {
  const goreLine = raw.match(/GORE:\s*(yes|no)/i);
  // Parse failure → conservative block (fail-safe)
  if (!goreLine) {
    console.warn('[filter] moondream2 response unparseable, blocking conservatively:', raw.slice(0, 100));
    return { parseOk: false, gore: true };
  }
  return {
    parseOk: true,
    gore: goreLine[1].toLowerCase() === 'yes',
  };
}

async function classifyWithMoondream(buffer) {
  const resized = await prepareImageForMoondream(buffer);
  const base64  = resized.toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILTER_MOONDREAM_TIMEOUT_MS);

  let raw = '';
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      signal:  controller.signal,
      body: JSON.stringify({
        model:    'moondream2',
        messages: [{ role: 'user', content: MOONDREAM_PROMPT, images: [base64] }],
        stream:   false,
        options:  { num_predict: 30, temperature: 0.0 },
      }),
    });
    const json = await res.json();
    raw = json?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }

  return { ...parseMoondreamResponse(raw), raw };
}

// ---------------------------------------------------------------------------
// Report ping
// ---------------------------------------------------------------------------

async function sendReport({ filepath, hashMd5, reason, nsfwjsJson = null, moondreamRaw = null, sourceUrl = null, isPostTime = false }) {
  const client = getClient();
  if (!client) {
    console.error('[filter] cannot send report — Discord client not set yet');
    return;
  }
  const channel = client.channels.cache.get(FILTER_REPORT_CHANNEL);
  if (!channel) {
    console.error('[filter] report channel not found in cache:', FILTER_REPORT_CHANNEL);
    return;
  }

  const header = isPostTime
    ? '**[CONTENT FILTER]** Image blocked at post-time (hash blocklist)'
    : '**[CONTENT FILTER]** Image blocked at save-time';

  const lines = [
    header,
    `**Reason:** ${reason}`,
    `**File:** \`${path.basename(filepath)}\``,
    `**MD5:** \`${hashMd5}\``,
    sourceUrl     ? `**Source URL:** <${sourceUrl}>` : null,
    nsfwjsJson    ? `**nsfwjs:** \`${nsfwjsJson.slice(0, 300)}\`` : null,
    moondreamRaw  ? `**moondream2:** \`${String(moondreamRaw).slice(0, 200)}\`` : null,
  ].filter(Boolean).join('\n');

  await channel.send(lines).catch(e =>
    console.error('[filter] failed to send report ping:', e?.message || e)
  );
}

// ---------------------------------------------------------------------------
// Public API — Layer 1
// ---------------------------------------------------------------------------

export async function runSaveFilter(filepath, sourceUrl = null) {
  // 1. Read file and compute MD5
  let buffer;
  try {
    buffer = await readFile(filepath);
  } catch (e) {
    console.error('[filter] could not read file for inspection:', e?.message || e);
    return true; // file read error → allow (don't silently drop)
  }

  const hashMd5 = createHash('md5').update(buffer).digest('hex');

  // 2. Hash blocklist check (instant DB lookup)
  if (isHashBlocked(hashMd5)) {
    logFilterDecision({ filepath, hashMd5, decision: 'blocked_save', reason: 'hash_blocklist', sourceUrl });
    await sendReport({ filepath, hashMd5, reason: 'hash_blocklist (previously identified)', sourceUrl });
    return false;
  }

  // 3. PhotoDNA / Thorn Safer stub (no-op until integration is approved)
  try {
    const base64 = buffer.toString('base64');
    const pdResult = await checkPhotoDNA(base64);
    if (pdResult.matched) {
      addToBlocklist(hashMd5, 'photodna_match');
      logFilterDecision({ filepath, hashMd5, decision: 'blocked_save', reason: 'photodna_match', sourceUrl });
      await sendReport({ filepath, hashMd5, reason: 'PhotoDNA hash match', sourceUrl });
      return false;
    }
  } catch (e) {
    console.error('[filter] PhotoDNA check error (non-fatal):', e?.message || e);
  }

  // 4. Skip ML classifiers for video files — frame extraction requires ffmpeg
  const ext = path.extname(filepath).toLowerCase();
  if (VIDEO_EXTS.has(ext)) {
    logFilterDecision({ filepath, hashMd5, decision: 'cached', reason: 'video_passthrough', sourceUrl });
    return true;
  }

  // 5. nsfwjs pre-screen
  let predictions = null;
  let nsfwjsJson  = null;
  try {
    predictions = await classifyWithNsfwjs(buffer);
    nsfwjsJson  = JSON.stringify(predictions);
  } catch (e) {
    console.error('[filter] nsfwjs error, falling through to moondream2:', e?.message || e);
  }

  if (predictions) {
    // nsfwjs confident it's porn/hentai/sexy → block directly, no moondream2 needed
    if (nsfwjsBlocks(predictions)) {
      addToBlocklist(hashMd5, 'nsfwjs_porn');
      logFilterDecision({ filepath, hashMd5, decision: 'blocked_save', reason: 'nsfwjs_porn', nsfwjsJson, sourceUrl });
      await sendReport({ filepath, hashMd5, reason: 'porn/explicit (nsfwjs)', nsfwjsJson, sourceUrl });
      return false;
    }

    // nsfwjs confident it's clean → skip moondream2
    if (nsfwjsFastPass(predictions)) {
      logFilterDecision({ filepath, hashMd5, decision: 'cached', reason: 'nsfwjs_fastpass', nsfwjsJson, sourceUrl });
      return true;
    }
  }

  // 6. moondream2 gore check (images that passed nsfwjs screening)
  let moondreamResult;
  try {
    moondreamResult = await classifyWithMoondream(buffer);
  } catch (e) {
    // Timeout, Ollama down, etc. — block conservatively
    console.error('[filter] moondream2 error, blocking conservatively:', e?.message || e);
    logFilterDecision({ filepath, hashMd5, decision: 'blocked_save', reason: 'moondream_error', nsfwjsJson, sourceUrl });
    await sendReport({ filepath, hashMd5, reason: 'moondream2 unavailable (conservative block)', nsfwjsJson, sourceUrl });
    return false;
  }

  if (moondreamResult.gore) {
    addToBlocklist(hashMd5, 'moondream2_gore');
    logFilterDecision({ filepath, hashMd5, decision: 'blocked_save', reason: 'moondream_gore', nsfwjsJson, moondreamRaw: moondreamResult.raw, sourceUrl });
    await sendReport({ filepath, hashMd5, reason: 'gore', nsfwjsJson, moondreamRaw: moondreamResult.raw, sourceUrl });
    return false;
  }

  logFilterDecision({ filepath, hashMd5, decision: 'cached', reason: 'moondream_cleared', nsfwjsJson, moondreamRaw: moondreamResult.raw, sourceUrl });
  return true;
}

// Exported for use in imagePool.js Layer 2 reporting
export { sendReport };
