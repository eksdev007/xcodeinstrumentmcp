#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node <<'NODE'
import fs from 'node:fs';
const matrix = JSON.parse(fs.readFileSync('docs/acceptance-matrix.json', 'utf8'));
const failing = matrix.items.filter((item) => item.required && item.status !== 'done');
if (failing.length > 0) {
  console.error('release-readiness: failing required acceptance items:');
  for (const item of failing) {
    console.error(`- ${item.id}: ${item.status}`);
  }
  process.exit(1);
}
console.log('release-readiness: all required acceptance items are done');
NODE
