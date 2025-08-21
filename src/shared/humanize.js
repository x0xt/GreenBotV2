// src/shared/humanize.js
import { MYSTIQUE_MODE, HUMANIZE_HEDGES, SELF_DISCLOSURE_PROB } from './constants.js';

function softTrim(s) { return s.replace(/\s+$/g, '').replace(/^\s+/g, ''); }

function removeBotSelfRefs(text) {
  return text
    .replace(/\b(as\s+an?\s+ai|as\s+an?\s+AI)\b.*?(?=[\.\!\?]|$)/gi, '')
    .replace(/\b(i'?m|i am)\s+(an?\s+)?bot\b.*?(?=[\.\!\?]|$)/gi, '')
    .replace(/\b(as a language model)\b.*?(?=[\.\!\?]|$)/gi, '')
    .replace(/\b(i cannot|i can't)\s+assist\s+with\s+that\s+as\s+an?\s+ai\b/gi, "I can't help with that")
    .replace(/\s{2,}/g, ' ');
}

function addHedge(text) {
  if (!Array.isArray(HUMANIZE_HEDGES) || HUMANIZE_HEDGES.length === 0) return text;
  if (Math.random() < 0.3) {
    const h = HUMANIZE_HEDGES[Math.floor(Math.random() * HUMANIZE_HEDGES.length)];
    return `${h} ${text}`;
  }
  return text;
}

export function humanize(text) {
  if (!MYSTIQUE_MODE || typeof text !== 'string' || !text) return text;
  if (Math.random() < (Number(SELF_DISCLOSURE_PROB) || 0)) return text;
  let out = text;
  out = removeBotSelfRefs(out);
  out = softTrim(out);
  out = addHedge(out);
  return out;
}
