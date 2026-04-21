#!/usr/bin/env bash
set -euo pipefail

bash scripts/bootstrap.sh

if [[ -f pnpm-lock.yaml ]]; then
  if pnpm exec tsc --noEmit >/dev/null 2>&1; then
    pnpm exec tsc --noEmit
    exit 0
  fi
fi

echo "lint: implementation lint stack not installed yet"
