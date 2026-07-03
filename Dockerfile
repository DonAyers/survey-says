# Runs only the Bun WebSocket/game server (server.ts). The static frontend
# is built separately and deployed to Vercel — see DEPLOYMENT.md.
FROM oven/bun:1.3.14-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts ./
COPY data ./data
COPY src/spritePresets.ts ./src/spritePresets.ts

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "server.ts"]
