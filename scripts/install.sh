#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Install Node.js 24 LTS first."; exit 1; }
command -v pnpm >/dev/null || { echo "Install pnpm 11 first."; exit 1; }
test -f .env || cp .env.example .env
pnpm install --frozen-lockfile
pnpm build
echo "Ready. Run pnpm start, then open http://localhost:8094"
