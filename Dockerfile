# GreenBotV2 — built on PenisSlab (never on a server), shipped to bot-01 with `podman save | docker load`.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY package.json deploy-commands.js ./
COPY src ./src
COPY filter ./filter
# data/ and memory/ are volumes; the repo's copies seed them on first run
COPY data ./data-seed
COPY memory ./memory-seed
ENV NODE_ENV=production DATA_DIR=/app/data
CMD ["sh", "-c", "[ -n \"$(ls -A /app/data 2>/dev/null)\" ] || cp -a /app/data-seed/. /app/data/; [ -n \"$(ls -A /app/memory 2>/dev/null)\" ] || cp -a /app/memory-seed/. /app/memory/; exec node src/index.js"]
