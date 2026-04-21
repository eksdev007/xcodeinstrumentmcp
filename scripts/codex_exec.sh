#!/usr/bin/env bash
set -euo pipefail

PROMPT=$(cat <<'EOF'
Read AGENTS.md and docs/task-definition.md first.
Implement the first public OSS release exactly as defined by docs/spec.md, docs/appendix.md, docs/architecture-decisions.md, docs/acceptance-matrix.json, and docs/launch-checklist-v1.md.
Work in small validated increments.
After each meaningful change run bash scripts/verify.sh.
Continue until bash scripts/release_readiness.sh exits 0.
Do not mark checklist items done unless backed by tests, fixtures, schemas, or documented manual verification.
EOF
)

exec codex exec --full-auto "$PROMPT"
