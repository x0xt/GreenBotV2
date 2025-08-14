function hash32(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rnd01(seed) {
  let x = seed || 123456789;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}

function spongeCaseSeeded(text, seed) {
  let x = hash32(seed);
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += next() < 0.5 ? text[i].toUpperCase() : text[i].toLowerCase();
  }
  return out;
}

export function shapeWithSeed(text, max = 240, seedStr) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const r = rnd01(hash32(seedStr));

  if (r < 0.2) { t = t.toUpperCase(); }
  else if (r < 0.4) { t = spongeCaseSeeded(t, seedStr); }
  else { t = t.toLowerCase(); }

  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return (end > 40 ? cut.slice(0, end + 1) : cut).trim();
}
