# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
# bun for speed
RUN npm i -g bun

# deps
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
# standalone output when RAILWAY_ENVIRONMENT set, otherwise full .next
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone* ./ 2>/dev/null || true
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
# healthcheck (Railway also uses /api/health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health | grep -q '"status":"ok"' || exit 1

CMD ["bun", "run", "start"]
