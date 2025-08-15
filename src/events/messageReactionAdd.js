import { Events } from "discord.js";
import { getByMessageId, markNotified } from "../features/suggestions/registry.js";
import { randomAck } from "../features/suggestions/dmTemplates.js";
import { pickTone } from "../features/ai/toneStyles.js";

const CHECK = "✅";
const OWNER_USER_ID = process.env.OWNER_ID || "";

function isAuthorized(_member, userId) {
  return userId === OWNER_USER_ID; // only you approve for now
}

export const name = Events.MessageReactionAdd;
export const once = false;

export async function execute(reaction, user) {
  try {
    if (user?.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    const msg = reaction.message;
    if (!msg?.id) return;
    if (reaction.emoji?.name !== CHECK) return;

    const row = await getByMessageId(msg.id);
    if (!row) return;

    const member = msg.guild?.members?.cache?.get(user.id) ??
                   await msg.guild?.members?.fetch?.(user.id).catch(() => null);
    if (!isAuthorized(member, user.id)) return;

    const didMark = await markNotified(msg.id);
    if (!didMark) return;

    const target = await msg.client.users.fetch(row.userId).catch(() => null);
    if (!target) return;

    // stable tone per suggestion card
    const toneId = pickTone(row.messageId);
    const text = randomAck({ username: row.username ?? "there", link: row.link, toneId });
    await target.send(text).catch(() => {});

    await msg.react("📬").catch(() => {});
  } catch (e) {
    console.warn("messageReactionAdd handler error:", e?.message || e);
  }
}
