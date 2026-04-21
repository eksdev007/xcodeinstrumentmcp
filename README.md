<img width="125" height="125" alt="xcodeinstrumentmcp" src="https://github.com/user-attachments/assets/a13c7343-50c3-4d0f-8645-bd3e5893f433" />

# xcodeinstrumentmcp

`xcodeinstrumentmcp` is a local-first CLI and MCP server for turning Xcode Instruments artifacts into bounded, agent-sized evidence.

It ships one package with:

- CLI workflows for `doctor`, `list`, `record`, `import`, `summarize`, `compare`, `prompt`, `db`, `signpost`, and `mcp`
- local SQLite caching with stable snapshot, comparison, and prompt-pack IDs
- fixture-backed analyzers for Time Profiler, Allocations, Hangs, Network, Leaks, Energy Log, Memory Graph, and experimental Processor Trace
- Swift-only signpost scan/plan/apply/revert/status flows backed by the `xim-swiftsignpost` SwiftSyntax helper
- a bounded MCP surface over the same high-value workflows

## Install

Global install:

```bash
npm install -g xcodeinstrumentmcp
```

Repo-local install:

```bash
pnpm install
pnpm exec tsup
node dist/index.js doctor
```

Requirements:

- macOS 14+
- Node.js 22+
- Xcode / `xctrace`
- Swift toolchain for signpost helper build/use

## CLI Quick Start

Check the local environment:

```bash
xcodeinstrumentmcp doctor
```

Import and persist a Time Profiler trace:

```bash
xcodeinstrumentmcp import --instrument time-profiler --input ./run.trace
```

Summarize a supported family fixture or artifact:

```bash
xcodeinstrumentmcp summarize --instrument allocations --input ./allocations.xml --format markdown
xcodeinstrumentmcp summarize --instrument network --input ./session.har --format json
```

Compare two stored snapshots:

```bash
xcodeinstrumentmcp compare --baseline-snapshot snap_base --candidate-snapshot snap_new --format json
```

Generate a reusable prompt pack:

```bash
xcodeinstrumentmcp prompt --snapshot snap_abc --size medium --format json
```

Scan and apply Swift signpost instrumentation:

```bash
xcodeinstrumentmcp signpost scan --project-root .
xcodeinstrumentmcp signpost plan --project-root . --strategy explicit-symbols --symbol GatewayViewModel.refresh
xcodeinstrumentmcp signpost apply --plan plan_abc
```

Inspect the local cache:

```bash
xcodeinstrumentmcp db stats
xcodeinstrumentmcp db list-snapshots
```

## Support Matrix

- `time-profiler`: stable first-class analyzer with record, summarize, compare, and prompt support
- `allocations`: stable first-class analyzer from trace export or exported detail XML
- `hangs`: stable first-class analyzer from hang tables or fixture XML
- `network`: stable first-class analyzer from HAR import with redaction by default
- `leaks`: stable summary analyzer with conservative confidence language
- `energy-log`: stable summary analyzer from exported summary XML
- `memory-graph`: stable summary analyzer from imported `.memgraph` fixtures
- `processor-trace`: experimental gated analyzer with explicit caveats in CLI and MCP responses

## MCP Setup

Cursor / generic stdio client:

```json
{
  "command": "xcodeinstrumentmcp",
  "args": ["mcp"]
}
```

Repo-local stdio launch:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/dist/index.js", "mcp"]
}
```

Current MCP surface includes bounded workflow tools such as:

- `record_time_profile`
- `record_profile`
- `import_source`
- `summarize_trace`
- `summarize_snapshot`
- `compare_traces`
- `compare_snapshots`
- `generate_optimization_prompt`
- `generate_prompt_pack`
- `list_snapshots`
- `get_snapshot`
- `get_comparison`
- `get_findings`
- `plan_signposts`
- `apply_signpost_plan`
- `revert_signpost_patch`

## Limitations

- Processor Trace is experimental and returns `experimental: true` in MCP responses.
- Network analysis is HAR-first in this release; trace-side network capture is still target/platform dependent.
- Memory Graph support is import-oriented rather than a unified `xctrace record` path.
- Outputs are intentionally bounded; raw exports are not returned by default.

## Privacy

The tool is local-only. Persistence is local SQLite under `~/Library/Application Support/xcodeinstrumentmcp/cache.db` unless `XIM_DB_PATH` overrides it for tests or custom local workflows.

Network outputs keep bodies, auth headers, and sensitive query values redacted by default. Sensitive network fields require an explicit opt-in flag or MCP argument.

## Troubleshooting

`xctrace` not found:

- Run `xcodeinstrumentmcp doctor`.
- Confirm `xcrun --find xctrace` succeeds.

No Time Profiler table found:

- Re-record with the Time Profiler template or import a supported Time Profiler trace.

Processor Trace record/import is unavailable:

- The analyzer is experimental and capability-gated.
- Prefer importing a known-good Processor Trace artifact when host/target versions differ.

Signpost helper build fails:

- Confirm `swift --version` works.
- Re-run `xcodeinstrumentmcp doctor` and `swift build -c release --package-path tools/xim-swiftsignpost`.

compare --baseline-snapshot fails:

- Ensure both snapshots come from the same family, or pass explicit source artifacts with a supported comparison strategy.
