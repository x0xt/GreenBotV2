// Tracks per-channel spam buildup and rage mode state.
// recordMessage() is called for every message in the channel.
// After 10 consecutive qualifying spam messages, rage mode activates
// for the next 20 channel messages.

const randStreak = () => Math.floor(Math.random() * 13) + 13; // 13-25
const RAGE_DURATION   = 20;   // channel messages rage lasts once triggered
const UNPROMPTED_PROB = 0.18; // chance of unprompted mirror during rage

// state per user per channel
const state = new Map();
// { word: string, streak: number, raging: boolean, rageLeft: number }

function getState(channelId, userId) {
  const key = `${channelId}:${userId}`;
  if (!state.has(key)) state.set(key, { word: null, streak: 0, threshold: randStreak(), raging: false, rageLeft: 0 });
  return state.get(key);
}

function qualifiesAsSpam(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 8) return null;
  const freq = {};
  for (const w of words) freq[w.toLowerCase()] = (freq[w.toLowerCase()] || 0) + 1;
  const [topWord, topCount] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  return topCount / words.length >= 0.75 ? topWord : null;
}

// Call for every non-bot message in the channel.
// Returns { shouldMirrorUnprompted: boolean, word: string|null }
export function recordMessage(channelId, userId, text) {
  const s = getState(channelId, userId);
  const spamWord = qualifiesAsSpam(text);

  if (s.raging) {
    s.rageLeft--;
    if (s.rageLeft <= 0) {
      s.raging = false;
      s.word = null;
      s.streak = 0;
    }
    // unprompted mirror chance during rage
    const shouldMirror = s.raging && Math.random() < UNPROMPTED_PROB;
    return { shouldMirrorUnprompted: shouldMirror, word: s.word };
  }

  // not in rage — track streak
  if (spamWord) {
    if (s.word === spamWord) {
      s.streak++;
    } else {
      s.word = spamWord;
      s.streak = 1;
      s.threshold = randStreak(); // new word, new random threshold
    }
    if (s.streak >= s.threshold) {
      s.raging = true;
      s.rageLeft = RAGE_DURATION;
      s.streak = 0;
      s.threshold = randStreak(); // reset for next time
    }
  } else {
    // non-spam message breaks streak
    s.streak = 0;
    s.word = null;
  }

  return { shouldMirrorUnprompted: false, word: null };
}

// Call when bot is directly responding to a spam message.
// Returns the spam word if in rage mode, null otherwise.
export function checkRage(channelId, userId) {
  const s = getState(channelId, userId);
  return s.raging ? s.word : null;
}
