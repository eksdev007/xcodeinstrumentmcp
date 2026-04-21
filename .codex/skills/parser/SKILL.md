---
name: parser
description: Use this skill when editing src/parsers, src/instruments, src/domain, or parser-backed normalization code and tests. Trigger on tasks involving trace export parsing, normalization, ranking inputs, adapter contracts, or schema stability. Do not use for unrelated CLI or documentation-only changes.
---

# Parser

Use this skill for parser and normalization work.

## Goal

Produce deterministic, bounded, versionable normalized outputs from Apple export data without claiming more precision than the source actually supports.

## Rules

- Prefer deterministic normalization over clever heuristics.
- Preserve stable keys and stable ordering where the format allows it.
- Keep raw-source ambiguity visible in the normalized model instead of hiding it.
- Do not silently discard data unless the spec explicitly says to.
- Separate parsing from ranking and presentation logic.
- Keep adapter-specific code out of shared domain types where possible.

## Required workflow

1. Inspect the relevant fixture family before changing parser behavior.
2. Update or add fixtures in the same change as the parser edit.
3. Update expected normalized outputs and golden summaries if behavior changes.
4. Run targeted tests first, then `bash scripts/verify.sh`.

## Precision policy

- Never fabricate durations, counts, or ownership information.
- When symbols, threads, or intervals are only partially known, model that uncertainty explicitly.
- Prefer lossless capture in the IR and lossy reduction only in later stages.

## Done criteria

A parser change is not done until fixtures, expected outputs, and tests reflect the new behavior.
