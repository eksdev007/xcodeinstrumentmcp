# AGENTS.md

## Repository expectations

- Read `docs/task-definition.md` before editing code.
- Treat `docs/spec.md` and `docs/appendix.md` as normative requirements, not suggestions.
- The first public release is the feature set formerly discussed as `v1.1`; ship tag remains `v1.0.0`.
- This repository is a **single package** implementation target. Do not convert it into a monorepo.
- Prefer `pnpm` for all package operations.
- Keep the implementation ESM-only TypeScript on Node.js 22+.
- Do not add production dependencies unless required by the specs or documented in `docs/architecture-decisions.md`.

## Execution loop

- Before making broad architectural changes, re-read `docs/architecture-decisions.md`.
- After each meaningful change, run `bash scripts/verify.sh`.
- Do not mark any requirement complete unless verification evidence exists in tests, fixtures, or a documented manual validation note.
- When a behavior changes, update docs, fixtures, and snapshots in the same change.
- Prefer small validated diffs over speculative large rewrites.

## Priority order

1. failing verification script outputs
2. missing required public surface from the specs
3. fixture coverage gaps
4. docs drift
5. convenience improvements

## Guardrails

- Never expose raw low-level `xctrace` passthrough tools in the public MCP surface unless the specs explicitly require them.
- Never implement signpost rewriting with regex. Use the SwiftSyntax helper path described in `docs/appendix.md`.
- Never claim metric precision that is unsupported by the exported evidence.
- Keep outputs bounded by default.
- Preserve privacy-first local behavior.

## Audit Answer Expectations

- Do not turn sparse or low-signal traces into broad performance narratives.
- Lead with the strongest defensible conclusion, not a tour of every instrument result.
- Separate app-owned evidence from SDK, wrapper, analytics, and framework noise.
- If the trace is weak, say so explicitly: `no actionable app bottleneck isolated` is better than generic advice.
- Prefer one concrete suspect path, symbol, or subsystem over a long generic hotspot list.
- State confidence and limits in plain language when the capture window is too quiet, too broad, or dominated by vendor code.
- End with the next targeted recording step needed to answer the unresolved human question.
- When summarizing for humans, answer these four questions directly:
  1. What is the most likely real issue?
  2. How confident is that conclusion?
  3. What specific code or subsystem should be inspected next?
  4. What capture should be rerun if the evidence is still weak?

## Done definition

A task is only done when all of the following are true:

- relevant acceptance IDs are green in `docs/acceptance-matrix.json`
- `bash scripts/verify.sh` passes
- `bash scripts/release_readiness.sh` passes for release-blocking work
- public docs and examples match the implementation
