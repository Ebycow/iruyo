# syntax=docker/dockerfile:1
FROM node:22-slim AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p data

# Build Next.js
RUN npx next build src/web

# --- Runner ---
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p data .next/cache/images && \
    chown -R appuser:nodejs data && \
    chmod 1777 .next/cache .next/cache/images

USER appuser

ENV NODE_ENV=production

EXPOSE 3000 3001

# Run DB migrations, then start both server and Next.js
CMD ["sh", "-c", "npm run db:migrate && npx concurrently \"npx tsx src/server/index.ts\" \"npx next start src/web -p 3000\""]
