# GreenBotV2

A Discord bot that is specifically designed to not help you. It will mock you, insult you, go on unhinged tangents, and remember things you've said so it can use them against you later. It runs entirely locally on your own hardware with no external AI APIs.

> **Warning:** This bot swears, uses slurs, and will say things that are intentionally hurtful. It is not moderated. Deploy with full awareness of what it is.

---

## What it does

- Responds when @mentioned, replied to, or DMed — with a local LLM running the `greenbot` persona
- Randomly interjects into conversations when media is posted (12% chance, 30min cooldown per channel)
- Remembers things users have said across sessions and may bring them up unprompted
- Visually chaotic responses — randomly ALL CAPS, sPOnGeCaSe, or lowercase
- Genuinely tries to be mean, not just edgy

### Slash Commands
| Command | Description |
|---|---|
| `/suggest` | Submit a suggestion — gets posted to a channel for review |
| `/mem show` | See what the bot remembers about you |
| `/mem clear` | Wipe your memory file |
| `/todo` | Owner only — create a todo item |
| `/health` | Check if the bot and Ollama are alive |
| `/lobotomy` | Owner/admin only — resets bot state |

---

## Stack

- **Runtime:** Node.js (ESM)
- **Discord:** discord.js v14
- **AI:** [Ollama](https://ollama.com) running `dolphin3:8b` locally (Dolphin 3.0 on Llama 3.1 8B — uncensored)
- **DB:** better-sqlite3 (for todos)

---

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) installed and running
- A GPU with enough VRAM to run the model (6GB+ recommended for `dolphin3:8b`)
- A Discord bot token with the following intents: `Guilds`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`, `DirectMessages`

---

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/x0xt/GreenBotV2.git
cd GreenBotV2
```

**2. Install dependencies**
```bash
npm install
```

**3. Pull the base model and build the greenbot persona**
```bash
ollama pull dolphin3:8b
ollama create greenbot -f LLM/modelfile/Modelfile7
```

**4. Create your `.env` file**
```env
DISCORD_TOKEN=your_token_here
OWNER_ID=your_discord_user_id
DISCORD_GUILD_ID=your_server_id
SUGGEST_CHANNEL_ID=channel_id
TODO_CHANNEL_ID=channel_id
TODO_COMPLETED_CHANNEL_ID=channel_id
OLLAMA_HOST=http://127.0.0.1:11434
MODEL=greenbot
```

**5. Register slash commands**
```bash
npm run deploy
```

**6. Start the bot**
```bash
npm start
```

### Running as a systemd service (recommended)

```ini
[Unit]
Description=GreenBotV2
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/GreenBotV2
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Privacy

Data collection is **opt-in by interaction** — if you never talk to the bot, nothing is stored about you. See [privacy_policy.md](./privacy_policy.md) for full details.

Users can view or delete their stored data at any time with `/mem show` and `/mem clear`.

---

## License

[MIT](./LICENSE)

---

*by x0xt*
