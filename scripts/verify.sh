#!/usr/bin/env bash
set -euo pipefail

bash scripts/bootstrap.sh
bash scripts/lint.sh
bash scripts/test.sh
bash scripts/checklist_status.sh > /tmp/xcodeinstrumentmcp-checklist.txt

echo "verify: bootstrap/lint/test/checklist completed"
echo "verify: note that scaffold repositories will remain incomplete until implementation is added"
