import { ollamaChat } from '../features/ai/ollamaClient.js';
import { shapeWithSeed } from '../features/ai/tone.js';
import { replaceBotRefs, stripExoticUnicode } from '../features/ai/aiHandler.js';
import { safe } from '../shared/safe.js';

export const name = 'guildMemberRemove';

export async function execute(member) {
  if (member.user?.bot) return;

  try {
    const username = member.user?.username ?? 'you';
    const prompt = `${username} just left the server. say one brutal line mocking them for leaving. speak directly to them. do not soften it.`;
    const raw = await ollamaChat([{ role: 'user', content: prompt }], 0);
    const shaped = shapeWithSeed(raw, 1800, `leave:${member.id}`);
    const stripped = stripExoticUnicode(shaped);
    const clean = stripped.replace(/[^a-zA-Z0-9]/g, '').length < 3 ? 'good riddance.' : stripped;

    await member.send({ content: safe(replaceBotRefs(clean)) }).catch(() => {});
  } catch {
    // DMs closed or blocked — silently drop
  }
}
