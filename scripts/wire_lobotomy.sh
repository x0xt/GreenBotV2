#!/usr/bin/env bash
set -euo pipefail

# --- repo root guard ---
if [ ! -d .git ]; then
  echo "Run this from your repo root (where .git lives)"; exit 1
fi

ENTRY=""
if [ -f "src/index.js" ]; then ENTRY="src/index.js"
elif [ -f "index.js" ]; then ENTRY="index.js"
else
  echo "Couldn't find src/index.js or index.js. Edit the script and set ENTRY manually."; exit 1
fi

branch="fix/lobotomy-gif-wireup"
git checkout -b "$branch" || git checkout "$branch" || true

mkdir -p src/shared src/features/dev

# --- 1) sendGif helper ---
cat > src/shared/sendGif.js <<'EOF'
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';

/** Send a .gif so it actually animates in Discord */
export async function sendGif(channel, pathOrBuffer, {
  embed = true,
  filename = 'lobotomy.gif',
  description = '',
} = {}) {
  const file = new AttachmentBuilder(pathOrBuffer, { name: filename });
  if (!embed) return channel.send({ files: [file] });

  const emb = new EmbedBuilder()
    .setImage(`attachment://${filename}`)
    .setDescription(description);

  return channel.send({ embeds: [emb], files: [file] });
}
EOF

# --- 2) notifyTimeout helper ---
cat > src/shared/notifyTimeout.js <<'EOF'
import { sendGif } from './sendGif.js';
import { TIMEOUT_ERROR_GIF, TIMEOUT_ERROR_GIF_NAME } from './constants.js';

/**
 * Send the lobotomy GIF on timeout/breaker conditions.
 * Accepts either a channel (TextBasedChannel) or an interaction (slash).
 */
export async function notifyTimeout(target, extraMsg = null) {
  const description = extraMsg ?? '⏳ timed out — initiating emergency lobotomy...';
  try {
    // If it's an Interaction (isRepliable), reply/followUp with files+embed
    if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
      const payload = {
        embeds: [{
          image: { url: `attachment://${TIMEOUT_ERROR_GIF_NAME}` },
          description,
        }],
        files: [{ attachment: TIMEOUT_ERROR_GIF, name: TIMEOUT_ERROR_GIF_NAME }],
        ephemeral: false,
      };
      if (target.deferred || target.replied) return target.followUp(payload);
      return target.reply(payload);
    }
    // Otherwise assume a channel
    return sendGif(target, TIMEOUT_ERROR_GIF, {
      filename: TIMEOUT_ERROR_GIF_NAME,
      description,
    });
  } catch (e) {
    console.error('notifyTimeout failed', e);
  }
}
EOF

# --- 3) ensure explicit .gif name in constants ---
if ! grep -q 'TIMEOUT_ERROR_GIF_NAME' src/shared/constants.js; then
  echo "export const TIMEOUT_ERROR_GIF_NAME = 'lobotomy.gif';" >> src/shared/constants.js
fi

# --- 4) dev test feature (keyword: !testlobotomy) ---
cat > src/features/dev/testLobotomy.js <<'EOF'
import { notifyTimeout } from '../../shared/notifyTimeout.js';

export default {
  name: 'dev-test-lobotomy',
  on: 'messageCreate',
  async run(msg) {
    if (msg.author.bot) return;
    if (!msg.content?.startsWith('!testlobotomy')) return;
    await notifyTimeout(msg.channel, '🪓 test fire — this should animate.');
  }
};
EOF

# --- 5) wire into ENTRY (import + event binding) ---
# insert import after the last existing import line
if ! grep -q "features/dev/testLobotomy.js" "$ENTRY"; then
  awk '
    BEGIN {done=0}
    /^import / {last=NR}
    {print}
    END {
      if (last) {
        # we cannot edit past contents here; use sed afterwards
      }
    }
  ' "$ENTRY" > "$ENTRY.tmp"

  # place import after last import line
  if grep -q '^import ' "$ENTRY"; then
    last_import_line=$(grep -n '^import ' "$ENTRY" | tail -n1 | cut -d: -f1)
    { head -n "$last_import_line" "$ENTRY"; echo "import testLobo from \"./features/dev/testLobotomy.js\";"; tail -n +$((last_import_line+1)) "$ENTRY"; } > "$ENTRY.tmp"
    mv "$ENTRY.tmp" "$ENTRY"
  else
    # no import lines? prepend one
    (echo 'import testLobo from "./features/dev/testLobotomy.js";'; cat "$ENTRY") > "$ENTRY.tmp" && mv "$ENTRY.tmp" "$ENTRY"
  fi
fi

# add a registration line before client.login(...) if possible
if ! grep -q 'testLobo.run' "$ENTRY"; then
  if grep -q 'client\.login' "$ENTRY"; then
    line=$(grep -n 'client\.login' "$ENTRY" | head -n1 | cut -d: -f1)
    { head -n $((line-1)) "$ENTRY"; echo 'client.on("messageCreate", (...args) => testLobo.run(...args));'; tail -n +$((line)) "$ENTRY"; } > "$ENTRY.tmp"
    mv "$ENTRY.tmp" "$ENTRY"
  else
    # fallback: append at end
    echo 'client.on("messageCreate", (...args) => testLobo.run(...args));' >> "$ENTRY"
  fi
fi

# --- 6) git add & commit ---
git add src/shared/sendGif.js src/shared/notifyTimeout.js src/features/dev/testLobotomy.js src/shared/constants.js "$ENTRY"
git commit -m "feat: add animated lobotomy GIF helpers + dev test trigger (!testlobotomy) and wire into ${ENTRY}"
echo "Done. Branch: $branch"

echo
echo "Test it by running your bot and typing:  !testlobotomy"
