# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS base

# python3 for python runner (optional)
RUN apk add --no-cache python3 py3-pip curl

WORKDIR /app
COPY package.json bun.lock* ./
# If bun.lock not present at service root, fall back to bun install
RUN bun install --frozen-lockfile 2>/dev/null || bun install

COPY server.ts ./
# tsconfig minimal for bun
COPY tsconfig.json* ./

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Security: drop capabilities, run as non-root (bun image already has bun user)
USER bun

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "server.ts"]
