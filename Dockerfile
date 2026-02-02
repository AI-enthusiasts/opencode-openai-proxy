# syntax=docker/dockerfile:1

FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

FROM oven/bun:1
WORKDIR /app

COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./
COPY --chown=bun:bun ./src ./src

# Pre-create volume mount points with correct ownership.
# Auth plugins are installed at runtime by BunProc.install (~12s on first start).
RUN mkdir -p /home/bun/.cache/opencode /home/bun/.config/opencode /data/opencode \
    && chown -R bun:bun /home/bun/.cache /home/bun/.config /data

ENV NODE_ENV=production PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD bun -e "const res = await fetch('http://localhost:${PORT:-8080}/health'); process.exit(res.ok ? 0 : 1)"

USER bun
CMD ["bun", "run", "start"]
