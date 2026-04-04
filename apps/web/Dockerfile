# ── Stage 1: install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Enable pnpm via corepack (reads version from package.json packageManager field)
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public/ exists (Next.js standalone expects it even if empty)
RUN mkdir -p /app/public

# NEXT_PUBLIC_* vars are inlined at build time by the Next.js compiler.
# Override this arg when building for a deployed backend:
#   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com .
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm build


# ── Stage 3: production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output — copy only what Next.js needs to run
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
# public/ may be empty, but the directory must exist for Next.js standalone
RUN mkdir -p ./public
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000 || exit 1

# next.js standalone entry point
CMD ["node", "server.js"]
