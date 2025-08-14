#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/greenbot-bot"
SERVICE="greenbot"

cd "$REPO"

# sanity: OWNER_ID present
if ! grep -q '^OWNER_ID=' .env; then
  echo "OWNER_ID is missing in .env. Add: OWNER_ID=1180570092132642936" >&2
  exit 1
fi

# ensure branch
git checkout -B fix/lobotomy-gif-wireup

# --- 1) rewrite notifyTimeout.js (robust for slash + channel) ---
cat > src/shared/notifyTimeout.js <<'EOF'
// src/shared/notifyTimeout.js
import { AttachmentBuilder } from 'discord.js';
import path from 'path';
import { TIMEOUT_ERROR_GIF } from './constants.js';
import { sendGif } from './sendGif.js';

// derive a sane filename even if not exported explicitly
const DEFAULT_NAME = path.basename(TIMEOUT_ERROR_GIF || 'lobotomy.gif');

/**
 * Send the lobotomy GIF on timeout/breaker/test events.
 * Works with either a TextBasedChannel or a Repliable interaction.
 * @param {import('discord.js').TextBasedChannel|import('discord.js').RepliableInteraction} target
 * @param {string|null} message Optional description text
 */
export async function notifyTimeout(target, message = null) {
  const description = message ?? '⏳ timed out — initiating emergency lobotomy...';

  // Slash command / interaction path — files must be attached in same payload
  if (typeof target?.isRepliable === 'function' && target.isRepliable()) {
    const file = new AttachmentBuilder(TIMEOUT_ERROR_GIF, { name: DEFAULT_NAME });
    const payload = {
      embeds: [{ image: { url: `attachment://${DEFAULT_NAME}` }, description }],
      files: [file],
      ephemeral: false,
    };
    if (target.deferred || target.replied) return target.followUp(payload);
    return target.reply(payload);
  }

  // Channel path
  return sendGif(target, TIMEOUT_ERROR_GIF, {
    filename: DEFAULT_NAME,
    description,
  });
}
EOF

# --- 2) write the slash command, restricted to OWNER_ID ---
cat > src/commands/testlobotomy.js <<'EOF'
// src/commands/testlobotomy.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { notifyTimeout } from '../shared/notifyTimeout.js';
import { OWNER_ID } from '../shared/constants.js';

// Hide from DMs and disable by default for everyone (we gate by OWNER_ID anyway)
export const data = new SlashCommandBuilder()
  .setName('testlobotomy')
  .setDescription('Send the lobotomy.gif to verify it animates (dev/test)')
  .setDMPermission(false)
  // Setting to 0 disables it by default for everyone in guild menus
  .setDefaultMemberPermissions(0n);

export async function execute(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: "🚫 You are not my owner fuck face. go back tO blowing your brother",
      ephemeral: true,
    });
  }
  await notifyTimeout(interaction, '🪓 test fire — this should animate.');
}
EOF

# --- 3) remove the old message-based dev trigger (slash-only now) ---
if [ -f src/features/dev/testLobotomy.js ]; then
  git rm -f src/features/dev/testLobotomy.js
fi

# --- 4) commit changes ---
git add src/shared/notifyTimeout.js src/commands/testlobotomy.js || true
git commit -m "feat: robust notifyTimeout & /testlobotomy (owner-only, hidden by default)"

# --- 5) deploy commands (guild = instant; fallback to global) ---
if node ./deploy-commands.js --guild 2>/dev/null; then
  echo "✅ Guild slash commands deployed."
else
  echo "ℹ️  Falling back to global deploy (may take time)..."
  node ./deploy-commands.js
fi

# --- 6) restart bot ---
sudo systemctl restart "$SERVICE"
echo "✅ Restarted $SERVICE. Now run /testlobotomy from OWNER_ID."
