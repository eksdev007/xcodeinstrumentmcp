#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FORMAT="text"
if [[ "${1:-}" == "--json" ]]; then
  FORMAT="json"
fi

node - "$FORMAT" <<'NODE'
import fs from 'node:fs';
const format = process.argv[2];
const matrix = JSON.parse(fs.readFileSync('docs/acceptance-matrix.json', 'utf8'));
const items = matrix.items;
const required = items.filter((item) => item.required);
const counts = {
  total: items.length,
  required: required.length,
  done: items.filter((item) => item.status === 'done').length,
  required_done: required.filter((item) => item.status === 'done').length,
  blocked: items.filter((item) => item.status === 'blocked').length,
  open: items.filter((item) => item.status === 'open').length,
};
if (format === 'json') {
  console.log(JSON.stringify({ counts, items }, null, 2));
  process.exit(0);
}
console.log('Acceptance status');
console.log(`- total: ${counts.total}`);
console.log(`- required: ${counts.required}`);
console.log(`- done: ${counts.done}`);
console.log(`- required done: ${counts.required_done}`);
console.log(`- open: ${counts.open}`);
console.log(`- blocked: ${counts.blocked}`);
console.log('');
for (const item of items) {
  console.log(`[${item.status}] ${item.id} ${item.title}`);
}
NODE
