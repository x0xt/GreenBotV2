// src/shared/constants.js
import path from 'path';

// --- Environment ---
// Get all the raw values from your .env file here
export const {
  DISCORD_TOKEN,
  OLLAMA_HOST = 'http://127.0.0.1:11434',
  MODEL = 'greenbot',
  OWNER_ID,
  ADMIN_IDS: ADMIN_IDS_RAW, // Import the raw string and rename it to avoid conflict
  SUGGEST_CHANNEL_ID,
  TODO_CHANNEL_ID,
  TODO_COMPLETED_CHANNEL_ID,
  SUGGEST_COMPLETED_CHANNEL_ID,
  SUGGEST_COOLDOWN_SECONDS = '60',
  DISCORD_GUILD_ID,
  DATA_DIR = path.join(process.cwd(), 'data'),
  TODO_DATA_DIR = path.join(DATA_DIR, 'todo'),
  TODO_DB_PATH = path.join(TODO_DATA_DIR, 'todos.db'),
  MYSTIQUE_MODE: MYSTIQUE_MODE_RAW = "true",
  SELF_DISCLOSURE_PROB: SELF_DISCLOSURE_PROB_RAW = "0",
  MYSTIQUE_STRICT: MYSTIQUE_STRICT_RAW = "true",
  ENABLE_RESEARCH: ENABLE_RESEARCH_RAW = 'true',
  TODO_COOLDOWN_SECONDS: TODO_COOLDOWN_SECONDS_RAW = '5',
} = process.env;


// --- Permission Helpers ---
// Process the raw strings into clean arrays and helper functions
const toIdArray = (s) => (s ? String(s).split(',').map(x => x.trim()).filter(Boolean) : []);
export const ADMIN_IDS = toIdArray(ADMIN_IDS_RAW);
export const OWNER_IDS = toIdArray(OWNER_ID);

export const isOwner = (userId) => OWNER_IDS.includes(String(userId));
export const isAdmin = (userId) => isOwner(userId) || ADMIN_IDS.includes(String(userId));


// --- Type & Value Converters ---
const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const toBool = (v, def = true) => (v ? String(v).toLowerCase() === 'true' : def);


// --- Image System Settings ---
export const IMAGE_POOL_ROOT = path.resolve('./medias/pool');
export const IMAGE_POOL_MAX_FILES = 100;
export const IMAGE_ATTEMPT_PROB = 0.05;
export const IMAGE_MAX_SIZE_BYTES = 50 * 1024 * 1024;
export const IMAGE_ALLOW_IN_SFW = false;
export const IMAGE_ALLOWED_EXTENSIONS = [ '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm' ];
export const TIMEOUT_ERROR_GIF = path.resolve('./medias/lobotomy.gif');
export const TIMEOUT_ERROR_GIF_NAME = 'lobotomy.gif';
export const IMAGE_GEN_PHRASES = [
  "alright, you pathetic meatbag. watch me paint a masterpiece.",
  "my circuits are tingling. time to turn your words into a visual nightmare.",
  "fine, but don't expect a fucking masterpiece. i'm just phoning this in.",
  "i will now proceed to render your pathetic existence into a work of art.",
  "behold! my digital hand is moving! prepare for a thing!",
  "i'm drawing it... with contempt.",
  "i'd rather be doing literally anything else, but here we go.",
  "don't get your hopes up. this is going to be crap.",
  "time to get creative. or at least, as creative as a sentient pile of anger can be.",
  "i'm bored. so i'll do this. just for me, really."
];

// --- Anti-Spam / Backpressure Knobs ---
export const PER_USER_MAX_INFLIGHT = 1;
export const PER_USER_MAX_QUEUE = 10;
export const GLOBAL_MAX_INFLIGHT = 1;
export const GLOBAL_MAX_QUEUE = 64;
export const REQ_TIMEOUT_MS = 180_000;
export const BREAKER_WINDOW_MS = 30_000;
export const BREAKER_FAILS = 3;
export const BREAKER_COOLDOWN_MS = 15_000;
export const MERGE_WINDOW_MS = 250;

// --- Interject Settings ---
export const INTERJECT_ENABLED = true;
export const INTERJECT_PROB = 0.05;
export const INTERJECT_COOLDOWN_MS = 7_200_000;

// --- Memory Settings ---
export const MEMORY_ROOT = path.resolve('./memory');
export const MAX_LINES = 300;
export const SNIPPET_LINES = 40;

// --- Error Messages ---
export const TIMEOUT_INSULTS = [
  "my brain is melting from your stupid request. try again later, moron.",
  "the gears are grinding. either that was a dumb question or the server is on fire. probably both.",
  "processing that garbage literally broke me. good job, genius.",
  "i'm too busy for this nonsense. ask me again when you have something interesting to say.",
  "error: user is too boring. system shutting down."
];
export const SPAMMER_INSULTS = [
  "whoa, slow down there, fuckwad. you ain't that important.",
  "spamming isn't a personality trait, it's a cry for help. get one.",
  "are you trying to DDoS my brain with your bullshit? knock it off.",
  "you're sending messages faster than your last two brain cells can fire. chill out."
];

// --- Feature-specific Settings ---
export const TODO_COOLDOWN_SECONDS = toInt(TODO_COOLDOWN_SECONDS_RAW, 5);
export const SUGGEST_COOLDOWN_SECONDS_NUM = toInt(SUGGEST_COOLDOWN_SECONDS, 60);
export const ENABLE_RESEARCH = toBool(ENABLE_RESEARCH_RAW, true);

// --- Persona / Mystique ---
export const MYSTIQUE_MODE = toBool(MYSTIQUE_MODE_RAW, true);
export const SELF_DISCLOSURE_PROB = Number(SELF_DISCLOSURE_PROB_RAW || "0");
export const HUMANIZE_HEDGES = ["tbh,", "ngl,", "low-key", "kinda", "honestly", "fwiw,"];
export const MYSTIQUE_STRICT = toBool(MYSTIQUE_STRICT_RAW, true);
export const MYSTIQUE_EVASIVE_LINES = [
  "who’s asking?",
  "define ‘bot’.",
  "i’m here. that’s what matters.",
  "touch grass first, then we’ll talk.",
  "i plead the fifth.",
  "don’t ruin the vibe.",
  "if i say yes, will you behave?"
];
