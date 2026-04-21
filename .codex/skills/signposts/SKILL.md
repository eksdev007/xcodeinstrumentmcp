---
name: signposts
description: Use this skill when editing src/signposts, tools/xim-swiftsignpost, signpost scan/plan/apply/revert flows, or related tests. Trigger on tasks involving automatic signpost insertion, SwiftSyntax rewriting, idempotency, or safe rollback behavior. Do not use for generic source transformations or non-Swift languages.
---

# Signposts

Use this skill for the automatic signpost workflow.

## Scope

Swift only. This skill does not apply to Objective-C, C++, or generic text rewriting.

## Core rules

- Syntax-aware rewriting only. Regex rewriting is forbidden.
- Preserve idempotency: applying the same plan twice must not duplicate instrumentation.
- Preserve previewability: users must be able to inspect proposed changes before apply.
- Preserve exact revert paths.
- Keep inserted code explicit and readable.

## Workflow

1. Start with scan or plan behavior before apply behavior.
2. Keep the edit plan separate from file mutation.
3. Make every insertion traceable back to a plan entry.
4. Ensure revert can remove only tool-authored changes without harming user code.
5. Add targeted tests for scan, plan, apply, and revert.

## Safety checks

- Do not rewrite files when parse errors make the edit unsafe.
- Do not insert signposts into generated files unless the spec explicitly allows it.
- Do not rely on brittle formatting assumptions.
- Prefer minimal code changes around each insertion point.
