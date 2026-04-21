---
name: implementation-loop
description: Use this skill for long-horizon implementation work in this repository when the goal is to move the project toward a shippable state. Trigger when a prompt mentions implementing the spec, iterating until verify passes, clearing acceptance IDs, or finishing the OSS release. Do not use for narrow one-file edits that do not require the repo execution loop.
---

# Implementation Loop

Use this skill when working through the xcodeinstrumentmcp delivery loop over many changes.

## Goal

Move the repository toward a releasable state by selecting the highest-value unfinished work, implementing it in bounded slices, and proving progress with the repo scripts.

## Primary workflow

1. Read `AGENTS.md` and `docs/task-definition.md` before making changes.
2. Inspect `docs/acceptance-matrix.json` and identify the highest-priority failing or unimplemented acceptance IDs.
3. Choose the smallest implementation slice that can move one or more important IDs forward.
4. Before coding, inspect the nearby package boundaries and existing docs so the change stays aligned with the repo architecture.
5. Implement the slice with minimal, production-oriented changes.
6. After each meaningful change, run `bash scripts/verify.sh`.
7. If `verify.sh` fails, fix the most relevant failure before expanding scope.
8. Repeat until the selected acceptance IDs are green or until a clearly documented blocker is found.
9. Before declaring broad completion, run `bash scripts/release_readiness.sh`.

## Working rules

- Prefer end-to-end progress over broad speculative scaffolding.
- Prefer one coherent slice over touching every package lightly.
- Keep the package boundaries intact: CLI, MCP, core, parsers, domain, signposts, sqlite, shared.
- Keep outputs deterministic and bounded.
- Keep privacy-sensitive data local by default.
- Do not silently change schemas, file formats, or public command behavior; update fixtures, docs, and tests in the same change.
- Do not mark a checklist item complete without test, fixture, schema, or documented manual evidence.

## Prioritization

When multiple items are open, prefer this order unless the prompt says otherwise:

1. Core type-safe domain model and normalized schemas
2. Deterministic parser/normalizer behavior backed by fixtures
3. High-value CLI workflows
4. MCP tool surface for the same workflows
5. Persistent database and caching behavior
6. Signpost scan/plan/apply/revert flows
7. Docs, polish, and release wiring

## Output style

When reporting progress, name the acceptance IDs you moved, the commands you ran, and the remaining highest-priority gaps.
