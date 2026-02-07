# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: Build the anthropic-auth plugin from rmk40 fork (1M context support)
# ---------------------------------------------------------------------------
FROM node:20-slim AS plugin-builder
WORKDIR /plugin

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# rmk40 fork adds 1M context auto-detection, multi-account rotation, backoff
ARG ANTHROPIC_AUTH_REPO="https://github.com/rmk40/opencode-anthropic-auth.git"
ARG ANTHROPIC_AUTH_BRANCH="rmk"

RUN git clone --depth=1 --branch ${ANTHROPIC_AUTH_BRANCH} ${ANTHROPIC_AUTH_REPO} . \
    && npm install --ignore-scripts \
    && npm run build

# ---------------------------------------------------------------------------
# Stage 2: Build the proxy app
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY tarquinen-opencode-auth-provider-0.1.8.tgz ./
RUN bun install --frozen-lockfile
COPY . .

# ---------------------------------------------------------------------------
# Stage 3: Final image
# ---------------------------------------------------------------------------
FROM oven/bun:1
WORKDIR /app

COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./
COPY --chown=bun:bun ./src ./src

# Pre-create volume mount points with correct ownership.
RUN mkdir -p /home/bun/.cache/opencode /home/bun/.config/opencode /data/opencode \
    && chown -R bun:bun /home/bun/.cache /home/bun/.config /data

# Pre-seed the rmk40 anthropic-auth plugin into the BunProc cache so that
# loadAuthPlugins() finds it already installed and skips `bun add` from npm.
# This replaces the default opencode-anthropic-auth@latest with our build.
RUN mkdir -p /home/bun/.cache/opencode/node_modules/opencode-anthropic-auth \
    && chown -R bun:bun /home/bun/.cache/opencode
COPY --from=plugin-builder --chown=bun:bun /plugin/dist/opencode-anthropic-auth-plugin.js \
    /home/bun/.cache/opencode/node_modules/opencode-anthropic-auth/index.mjs
COPY --chown=bun:bun <<'EOF' /home/bun/.cache/opencode/node_modules/opencode-anthropic-auth/package.json
{"name":"opencode-anthropic-auth","version":"0.0.13-rmk40","main":"./index.mjs"}
EOF
COPY --chown=bun:bun <<'EOF' /home/bun/.cache/opencode/package.json
{"dependencies":{"opencode-anthropic-auth":"latest"}}
EOF

ENV NODE_ENV=production PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD bun -e "const res = await fetch('http://localhost:${PORT:-8080}/health'); process.exit(res.ok ? 0 : 1)"

USER bun
CMD ["bun", "run", "start"]
