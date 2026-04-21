---
name: mcp
description: Use this skill when editing src/mcp, public MCP tool schemas, request/response contracts, or MCP-facing tests and docs. Trigger on tasks involving tool naming, input/output schemas, server wiring, or agent-oriented workflow design. Do not use for internal-only code that does not change the MCP surface.
---

# MCP

Use this skill for the public MCP interface.

## Goal

Expose high-value workflows that help agents answer the next engineering question without forcing them to consume raw trace plumbing.

## Product rules

- Expose workflows, not low-level exports.
- Keep schemas explicit, bounded, and versionable.
- Keep one tool focused on one job.
- Reuse the same core services that power the CLI.
- Favor stable machine-readable output over presentation-oriented text.

## Workflow

1. Check the spec for the exact tool contract and scope.
2. Implement or update the shared core service first when possible.
3. Map the MCP surface onto that service with narrow validation.
4. Add or update MCP contract tests.
5. Update docs/examples for every public surface change.

## Guardrails

- Do not expose raw parser internals as public API.
- Do not return unbounded payloads.
- Do not create separate MCP-only business logic if the same behavior belongs in core.
- Keep backward-compatibility in mind once a tool is named in docs.
