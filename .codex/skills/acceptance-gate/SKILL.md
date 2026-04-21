---
name: acceptance-gate
description: Use this skill when working against docs/acceptance-matrix.json, docs/launch-checklist-v1.md, scripts/checklist_status.sh, scripts/verify.sh, or scripts/release_readiness.sh. Trigger when the task is to decide what is done, close release blockers, validate evidence, or tighten the ship gate. Do not use for feature implementation that does not touch completion criteria.
---

# Acceptance Gate

Use this skill to keep the implementation tied to an objective definition of done.

## Goal

Ensure every completion claim is backed by executable checks, fixtures, or explicit manual evidence.

## Workflow

1. Read the relevant acceptance IDs in `docs/acceptance-matrix.json`.
2. Read the corresponding sections in `docs/launch-checklist-v1.md`.
3. Confirm how the repo currently evaluates those IDs via:
   - `scripts/checklist_status.sh`
   - `scripts/verify.sh`
   - `scripts/release_readiness.sh`
4. If an acceptance item is not machine-verifiable yet, add the narrowest verification path that matches the repo contract.
5. When feature work changes the evidence model, update docs and scripts together.

## Rules

- Treat the JSON acceptance matrix as normative for engineering completion.
- Keep acceptance IDs stable once they are referenced by scripts, tests, or reports.
- Prefer deterministic scriptable checks over prose-only status.
- If a check must remain manual, make the evidence path explicit in the checklist.
- Do not let the launch checklist drift from the scripts.

## Good outcomes

- `checklist_status.sh --json` clearly reflects reality.
- `verify.sh` catches the important regressions for current scope.
- `release_readiness.sh` fails only for real blockers and passes only when the release bar is met.
