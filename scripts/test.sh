#!/usr/bin/env bash
set -euo pipefail

bash scripts/bootstrap.sh

if [[ -f pnpm-lock.yaml ]]; then
  if pnpm exec vitest --version >/dev/null 2>&1; then
    pnpm exec vitest run --passWithNoTests=false
    exit 0
  fi
fi

echo "test: implementation test stack not installed yet"
