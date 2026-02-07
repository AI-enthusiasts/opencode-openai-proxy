#!/usr/bin/env bash
# Build opencode-anthropic-auth plugin from rmk40 fork (includes 1M context support).
# Usage: ./scripts/build-anthropic-auth.sh [output_dir]
#
# Clones (or pulls) the rmk40 fork, installs deps, runs esbuild,
# and copies the bundled plugin to output_dir (default: ./vendor/anthropic-auth).

set -euo pipefail

REPO_URL="https://github.com/rmk40/opencode-anthropic-auth.git"
BRANCH="rmk"
CLONE_DIR="${TMPDIR:-/tmp}/opencode-anthropic-auth-build"
OUTPUT_DIR="${1:-./vendor/anthropic-auth}"

echo "==> Building opencode-anthropic-auth from rmk40 fork (branch: ${BRANCH})"

# Clone or pull
if [ -d "${CLONE_DIR}/.git" ]; then
  echo "    Updating existing clone..."
  git -C "${CLONE_DIR}" fetch origin "${BRANCH}" --depth=1
  git -C "${CLONE_DIR}" checkout "origin/${BRANCH}" --force
else
  echo "    Cloning ${REPO_URL}..."
  rm -rf "${CLONE_DIR}"
  git clone --depth=1 --branch "${BRANCH}" "${REPO_URL}" "${CLONE_DIR}"
fi

# Install deps and build
echo "    Installing dependencies..."
cd "${CLONE_DIR}"
npm install --ignore-scripts

echo "    Building with esbuild..."
npm run build

# Copy output
echo "    Copying plugin to ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"
cp dist/opencode-anthropic-auth-plugin.js "${OUTPUT_DIR}/plugin.mjs"

echo "==> Done: ${OUTPUT_DIR}/plugin.mjs"
