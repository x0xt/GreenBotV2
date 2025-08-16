import { tonePack } from "../ai/toneStyles.js";

export function randomAck({ username, link, toneId }) {
  const tp = tonePack(toneId);
  const opener = tp.dmOpener();
  const status = tp.dmStatus();
  const tail = ["Stay tuned.", "Thanks again.", "🚀", "🛠️", "📬"][Math.floor(Math.random() * 5)];
  return [`${opener} ${username}.`, `Your suggestion was ${status}.`, link ? `Ref: ${link}` : "", tail]
    .filter(Boolean)
    .join(" ");
}
