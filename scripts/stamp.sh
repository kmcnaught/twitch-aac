#!/usr/bin/env bash
# Generates build-info.js in the project root with the deploy timestamp and
# the short commit SHA, consumed by index.html's footer stamp.
#
# Run automatically before `wrangler deploy` via the `build.command` field in
# wrangler.jsonc. The file is gitignored because it is produced per-deploy.
#
# Usage: scripts/stamp.sh
#
# Env vars honoured for the commit SHA (first wins):
#   WORKERS_CI_COMMIT_SHA  — Cloudflare Workers Builds
#   CF_PAGES_COMMIT_SHA    — Cloudflare Pages (if ever deployed that way)
#   git rev-parse HEAD     — local fallback
#   "unknown"              — if nothing is available
set -euo pipefail
cd "$(dirname "$0")/.."

time=$(date -u +"%Y-%m-%d %H:%M UTC")
sha="${WORKERS_CI_COMMIT_SHA:-${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}}"
short=${sha:0:7}

cat > build-info.js <<EOF
window.BUILD_INFO = { time: "$time", sha: "$short" };
EOF

echo "stamped build-info.js: $time · $short"
