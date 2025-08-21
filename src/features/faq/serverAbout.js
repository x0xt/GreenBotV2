import { EmbedBuilder } from "discord.js";
import { SERVER_ABOUT_REPLIES } from "../../data/serverAboutReplies.js";

// --- knobs (override in .env) ---
const ENABLED = process.env.ABOUT_FAQ_ENABLED?.toLowerCase() !== "false";
const COOLDOWN_MS = Number(process.env.ABOUT_FAQ_COOLDOWN_MS ?? 30000);
const TITLE = process.env.ABOUT_FAQ_TITLE || "what this server is about";
const COLOR = Number(process.env.ABOUT_FAQ_COLOR_HEX ?? "0x57f287");
const ABOUT_CHANNEL_ID = (process.env.ABOUT_SERVER_ID || "").trim(); // e.g. "634592604306014209"

// per-channel cooldown to avoid spam
const lastAnswerAt = new Map();
const cooled = (ch) => (Date.now() - (lastAnswerAt.get(ch) ?? 0)) >= COOLDOWN_MS;
const mark = (ch) => lastAnswerAt.set(ch, Date.now());

const escapeRe = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// normalize but keep words; allow slang/filler
function norm(s = "") {
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}\s@#'".:!?-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliases(msg) {
  const out = [];
  if (msg.guild?.name) {
    const n = norm(msg.guild.name);
    if (n) { out.push(n); out.push(n.replace(/\s+/g, "")); }
  }
  const botName = msg.client?.user?.username || "";
  if (botName) {
    const n = norm(botName);
    if (n) { out.push(n); out.push(n.replace(/\s+/g, "")); }
  }
  const extra = (process.env.ABOUT_FAQ_ALIASES || "")
    .split(",")
    .map((s) => norm(s))
    .filter(Boolean);
  for (const a of extra) { out.push(a); out.push(a.replace(/\s+/g, "")); }
  return [...new Set(out)];
}

function buildPatterns(aliases) {
  const whatWords = "(?:what|wha|wat|wut|wot|whut|wtf)";
  const topics = [ "server","serve","srvr","sever","serer","srv", "discord","guild","place","chat","room","channel", "grp","group","community","greenweb" ];
  const anyTopic = `(?:${topics.map(escapeRe).join("|")}${aliases.length ? "|" : ""}${aliases.map(escapeRe).join("|")})`;
  const aboutWords = "(?:about|abt|bout|bot|for|purpose|theme|topic)";

  return [
    new RegExp(`\\b${whatWords}\\b.*\\b${anyTopic}\\b.*\\b${aboutWords}\\b`, "i"),
    new RegExp(`\\b${whatWords}\\b.*\\b(?:is|iz|dis|this|thiz|da|the)?\\s*${anyTopic}\\b`, "i"),
    new RegExp(`^\\s*${anyTopic}\\s*\\??\\s*$`, "i"),
    /\bwhat\s+(?:do|d)\s+(?:you|u|ya|y'all|yall|guys|ppl|people)\b.*\b(do|do\s+here)\b/i,
    /\bwhat\s+(?:are|r)\s+(?:you|u|ya|y'all|yall|guys|ppl|people)\b.*\babout\b/i,
    new RegExp(`\\bpurpose\\s+(?:of|for)\\b.*\\b${anyTopic}\\b`, "i"),
  ];
}

function heuristicShortHit(s, aliases) {
  const words = s.trim().split(/\s+/);
  if (words.length <= 14) {
    const topicHit =
      /\b(server|serve|srvr|sever|serer|srv|discord|guild|place|chat|room|channel|grp|group|community|greenweb)\b/.test(s) ||
      aliases.some((a) => a && s.includes(a));
    const aboutHit = /\b(about|abt|bout|bot|for|purpose|theme|topic|do)\b/.test(s);
    const whatHit = /\b(what|wha|wat|wut|wot|whut|wtf)\b/.test(s);
    return topicHit && (aboutHit || whatHit);
  }
  return false;
}

export async function maybeAnswerServerAbout(msg) {
  try {
    if (!ENABLED) return false;
    if (!msg?.guild || typeof msg.content !== "string") return false;

    const s = norm(msg.content);
    if (!s) return false;

    const aliases = buildAliases(msg);
    const patterns = buildPatterns(aliases);

    const matched = patterns.some((re) => re.test(s)) || heuristicShortHit(s, aliases);
    if (!matched) return false;
    if (!cooled(msg.channel.id)) return false;

    const line = SERVER_ABOUT_REPLIES[Math.floor(Math.random() * SERVER_ABOUT_REPLIES.length)];
    const withLink = ABOUT_CHANNEL_ID ? `${line}\n\nMore here: <#${ABOUT_CHANNEL_ID}>` : line;

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(TITLE)
      .setDescription(withLink);

    await msg.reply({
      embeds: [embed],
      allowedMentions: { parse: [], repliedUser: false },
    }).catch(() => {});

    mark(msg.channel.id);
    return true;
  } catch {
    return false;
  }
}
