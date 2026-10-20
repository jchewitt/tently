#!/usr/bin/env bash
# Managed cloud development setup; normal package installation remains portable.
set -euo pipefail
cd /workspace/tently
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Cloud development setup requires Node 24 or newer; Node 24 is tested")'
mkdir -p /workspace/context-graph-tools /workspace/.npm-cache /workspace/.pnpm-store /workspace/.cache
npm install --prefix /workspace/context-graph-tools --cache /workspace/.npm-cache \
  --ignore-scripts --no-audit --no-fund pnpm@10.18.2
export PATH=/workspace/context-graph-tools/node_modules/.bin:$PATH
export npm_config_store_dir=/workspace/.pnpm-store
export XDG_CACHE_HOME=/workspace/.cache
pnpm install --frozen-lockfile
pnpm build
