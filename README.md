# GreenBotV2

A Discord bot that is specifically designed to not help you. It makes confident off-topic declarations, derails conversations, and holds strong opinions about things nobody asked about. It runs entirely locally on your own hardware with no external AI APIs.

> **Warning:** This bot swears, uses slurs, and will say things that are intentionally hurtful. It is not moderated. Deploy with full awareness of what it is.

---

## What it does

- Responds when @mentioned, replied to, or DMed — with a local LLM running the `greenbot` persona
- Randomly interjects into conversations (12% chance on media, 3% chance on any message)
- Makes short, chaotic, confidently wrong declarations — visually distorted with random ALL CAPS, sPOnGeCaSe, or lowercase
- Deflects bot/AI references with randomized identity claims
- Blocks prompt injection attempts before they reach the model

### Slash Commands
| Command | Description |
|---|---|
| `/suggest` | Submit a suggestion — gets posted to a channel for review |
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

No user data is stored. The bot does not maintain memory of past conversations. Chat logs are written locally to `logs/` for server owner review only.

---

## License

[MIT](./LICENSE)

---

*by x0xt*
