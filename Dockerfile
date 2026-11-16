# syntax=docker/dockerfile:1
# One image for all environments: config comes from env vars at runtime.
# The same image runs the web app (default CMD) and the worker (`bun worker.js`).

FROM oven/bun:1.4 AS base
WORKDIR /app

# 1) Install dependencies (cached unless package.json / bun.lock change)
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2) Build the Next.js app and bundle the worker
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --bun run build && bun run build:worker

# 3) Minimal runtime image
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/dist/worker.js ./worker.js
USER bun
EXPOSE 3000
# Liveness only (no DB): a DB outage must not restart-loop the container.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]
