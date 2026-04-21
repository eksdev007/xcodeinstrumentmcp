#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "bootstrap: $1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node is required"
command -v pnpm >/dev/null 2>&1 || fail "pnpm is required"

node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 22) process.exit(1);" || fail "node >= 22 is required"

required_files=(
  "AGENTS.md"
  "docs/spec.md"
  "docs/appendix.md"
  "docs/architecture-decisions.md"
  "docs/acceptance-matrix.json"
  "docs/task-definition.md"
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || fail "missing required file: $file"
done

echo "bootstrap: ok"
