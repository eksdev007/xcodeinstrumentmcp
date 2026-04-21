import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { compareTimeProfilerSummaries } from '../application/compare.js';
import { createRepositories } from '../application/db.js';
import { summarizeGenericFamily } from '../application/family-summaries.js';
import { compareGenericSummaries } from '../application/generic-compare.js';
import { buildGenericComparisonPrompt, buildGenericSummaryPrompt } from '../application/generic-prompt.js';
import { inferFamilyFromPath } from '../application/instrument-family.js';
import { buildComparisonPrompt, buildOptimizationPrompt } from '../application/prompt.js';
import { inspectCapabilities } from '../application/capabilities.js';
import { listDiscoveryDevices, listDiscoverySurface } from '../application/listing.js';
import { applySignpostPlan, createSignpostPlan, revertSignpostPatch } from '../application/signposts.js';
import { summarizeTimeProfilerTrace } from '../application/time-profiler.js';
import { openDatabase } from '../infrastructure/sqlite/database.js';
import { runMigrations } from '../infrastructure/sqlite/migrations.js';
import { packageVersion } from '../shared/version.js';
import { executeRecordProfile } from './tools/record-profile.js';

const FAMILY_ENUM = z.enum([
  'time-profiler',
  'allocations',
  'leaks',
  'hangs',
  'network',
  'processor-trace',
  'energy-log',
  'memory-graph',
]);

export const MCP_TOOL_NAMES = [
  'doctor',
  'list_templates',
  'list_devices',
  'list_instruments',
  'record_time_profile',
  'summarize_trace',
  'compare_traces',
  'generate_optimization_prompt',
  'inspect_capabilities',
  'record_profile',
  'import_source',
  'summarize_snapshot',
  'compare_snapshots',
  'generate_prompt_pack',
  'list_snapshots',
  'get_snapshot',
  'get_comparison',
  'get_findings',
  'plan_signposts',
  'apply_signpost_plan',
  'revert_signpost_patch',
] as const;

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'xcodeinstrumentmcp',
    version: packageVersion,
  });

  registerMcpTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function registerMcpTools(server: McpServer): void {
  server.tool('doctor', {}, async () => jsonContent(await inspectCapabilities()));
  server.tool('inspect_capabilities', {}, async () => jsonContent(await inspectCapabilities()));

  server.tool('list_templates', {}, async () =>
    jsonContent({ templates: (await listDiscoverySurface('templates')).items.map((name) => ({ name, kind: 'built-in' })) }),
  );
  server.tool('list_devices', {}, async () => jsonContent(await listDiscoveryDevices()));
  server.tool('list_instruments', {}, async () =>
    jsonContent({ instruments: (await listDiscoverySurface('instruments')).items.map((name) => ({ name })) }),
  );

  server.tool(
    'summarize_trace',
    {
      trace_path: z.string(),
      instrument: FAMILY_ENUM.optional(),
      include_sensitive_network_fields: z.boolean().default(false),
    },
    async ({ trace_path, instrument, include_sensitive_network_fields }) =>
      jsonContent(await summarizeSource(trace_path, instrument, include_sensitive_network_fields)),
  );

  server.tool(
    'import_source',
    {
      instrument: FAMILY_ENUM,
      input_path: z.string(),
      persist: z.boolean().default(true),
      include_sensitive_network_fields: z.boolean().default(false),
    },
    async ({ instrument, input_path, persist, include_sensitive_network_fields }) => {
      const summaryResult = await summarizeSource(input_path, instrument, include_sensitive_network_fields);
      if (!persist) {
        return jsonContent({ persisted: false, ...summaryResult });
      }

      const db = openDatabase();
      runMigrations(db);
      const repositories = createRepositories(db);
      const stored = repositories.snapshots.persistSummary({
        tracePath: input_path,
        family: instrument,
        summary: summaryResult.summary,
        schemaVersion: 1,
      });
      db.close();
      return jsonContent({ persisted: true, snapshot_id: stored.snapshotId, ...summaryResult });
    },
  );

  server.tool(
    'summarize_snapshot',
    {
      snapshot_id: z.string(),
    },
    async ({ snapshot_id }) => {
      const snapshot = loadSnapshot(snapshot_id);
      return jsonContent({
        snapshot_id,
        family: snapshot.family,
        experimental: snapshot.family === 'processor-trace',
        summary: snapshot.summary,
      });
    },
  );

  server.tool(
    'compare_traces',
    {
      baseline_trace_path: z.string(),
      candidate_trace_path: z.string(),
      instrument: FAMILY_ENUM.optional(),
    },
    async ({ baseline_trace_path, candidate_trace_path, instrument }) => {
      const family = instrument ?? inferFamilyFromPath(baseline_trace_path) ?? inferFamilyFromPath(candidate_trace_path) ?? 'time-profiler';
      const comparison = await compareTraceSources(family, baseline_trace_path, candidate_trace_path);
      return jsonContent({
        family,
        experimental: family === 'processor-trace',
        comparison,
      });
    },
  );

  server.tool(
    'compare_snapshots',
    {
      baseline_snapshot_id: z.string(),
      candidate_snapshot_id: z.string(),
    },
    async ({ baseline_snapshot_id, candidate_snapshot_id }) => {
      const baseline = loadSnapshot(baseline_snapshot_id);
      const candidate = loadSnapshot(candidate_snapshot_id);
      const comparison =
        baseline.family === 'time-profiler' && candidate.family === 'time-profiler' && 'hotspots' in baseline.summary && 'hotspots' in candidate.summary
          ? compareTimeProfilerSummaries({
              baseline: baseline.summary,
              candidate: candidate.summary,
            })
          : compareGenericSummaries({
              baseline: baseline.summary as never,
              candidate: candidate.summary as never,
            });

      const db = openDatabase();
      runMigrations(db);
      const repositories = createRepositories(db);
      const stored = repositories.snapshots.persistComparison({
        baselineSnapshotId: baseline_snapshot_id,
        candidateSnapshotId: candidate_snapshot_id,
        family: baseline.family,
        comparison,
      });
      db.close();

      return jsonContent({
        comparison_id: stored.comparisonId,
        family: baseline.family,
        experimental: baseline.family === 'processor-trace',
        comparison,
      });
    },
  );

  server.tool(
    'generate_optimization_prompt',
    {
      trace_path: z.string().optional(),
      instrument: FAMILY_ENUM.optional(),
      snapshot_id: z.string().optional(),
      comparison_id: z.string().optional(),
      goal: z.enum(['latency', 'cpu', 'startup', 'throughput', 'generic']).default('generic'),
      budget_chars: z.number().int().positive().default(8000),
    },
    async (input) => generatePromptTool(input),
  );

  server.tool(
    'generate_prompt_pack',
    {
      snapshot_id: z.string().optional(),
      comparison_id: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).default('medium'),
      purpose: z.string().default('generic'),
    },
    async ({ snapshot_id, comparison_id, size, purpose }) =>
      generatePromptTool({
        snapshot_id,
        comparison_id,
        goal: 'generic',
        budget_chars: size === 'small' ? 2800 : size === 'large' ? 14000 : 7200,
        purpose,
      }),
  );

  server.tool('list_snapshots', {}, async () => {
    const db = openDatabase();
    runMigrations(db);
    const snapshots = createRepositories(db).snapshots.listSnapshots();
    db.close();
    return jsonContent({ snapshots });
  });

  server.tool(
    'get_snapshot',
    {
      snapshot_id: z.string(),
    },
    async ({ snapshot_id }) => {
      const snapshot = loadSnapshot(snapshot_id);
      return jsonContent({
        snapshot_id,
        family: snapshot.family,
        experimental: snapshot.family === 'processor-trace',
        summary: snapshot.summary,
      });
    },
  );

  server.tool(
    'get_comparison',
    {
      comparison_id: z.string(),
    },
    async ({ comparison_id }) => {
      const db = openDatabase();
      runMigrations(db);
      const comparison = createRepositories(db).snapshots.getComparison(comparison_id);
      db.close();
      if (!comparison) {
        throw new Error(`Comparison "${comparison_id}" was not found.`);
      }
      return jsonContent({ comparison_id, comparison });
    },
  );

  server.tool(
    'get_findings',
    {
      snapshot_id: z.string(),
    },
    async ({ snapshot_id }) => {
      const snapshot = loadSnapshot(snapshot_id);
      return jsonContent({ snapshot_id, findings: snapshot.summary.findings });
    },
  );

  server.tool(
    'record_time_profile',
    {
      output_path: z.string(),
      device: z.string().optional(),
      attach: z.string().optional(),
      time_limit: z.string().default('10s'),
      save_snapshot: z.boolean().default(true),
    },
    async ({ output_path, device, attach, time_limit, save_snapshot }) =>
      jsonContent(
        await executeRecordProfile({
          instrument: 'time-profiler',
          outputPath: output_path,
          device,
          attach,
          timeLimit: time_limit,
          saveSnapshot: save_snapshot,
        }),
      ),
  );

  server.tool(
    'record_profile',
    {
      instrument: z.enum(['time-profiler', 'allocations', 'leaks', 'hangs', 'network', 'processor-trace', 'energy-log']),
      output_path: z.string(),
      device: z.string().optional(),
      attach: z.string().optional(),
      time_limit: z.string().default('10s'),
      save_snapshot: z.boolean().default(true),
    },
    async ({ instrument, output_path, device, attach, time_limit, save_snapshot }) =>
      jsonContent(
        await executeRecordProfile({
          instrument,
          outputPath: output_path,
          device,
          attach,
          timeLimit: time_limit,
          saveSnapshot: save_snapshot,
        }),
      ),
  );

  server.tool(
    'plan_signposts',
    {
      project_root: z.string(),
      source_snapshot_id: z.string().optional(),
      strategy: z.enum(['top-hot-functions', 'top-app-functions', 'explicit-symbols', 'file-scope']),
      symbols: z.array(z.string()).optional(),
      max_insertions: z.number().int().positive().default(10),
      max_files_touched: z.number().int().positive().default(8),
    },
    async ({ project_root, source_snapshot_id, strategy, symbols, max_insertions, max_files_touched }) =>
      jsonContent(
        await createSignpostPlan({
          projectRoot: project_root,
          sourceSnapshotId: source_snapshot_id,
          strategy,
          explicitSymbols: symbols,
          maxInsertions: max_insertions,
          maxFilesTouched: max_files_touched,
        }),
      ),
  );

  server.tool(
    'apply_signpost_plan',
    {
      plan_id: z.string(),
      subsystem: z.string().default('xcodeinstrumentmcp'),
      category: z.string().default('Performance'),
      allow_low_confidence: z.boolean().default(false),
      best_effort: z.boolean().default(false),
    },
    async ({ plan_id, subsystem, category, allow_low_confidence, best_effort }) =>
      jsonContent(
        await applySignpostPlan({
          planId: plan_id,
          subsystem,
          category,
          allowLowConfidence: allow_low_confidence,
          bestEffort: best_effort,
        }),
      ),
  );

  server.tool(
    'revert_signpost_patch',
    {
      patch_id: z.string(),
    },
    async ({ patch_id }) => jsonContent(await revertSignpostPatch(patch_id)),
  );
}

async function summarizeSource(
  sourcePath: string,
  instrument?: z.infer<typeof FAMILY_ENUM>,
  includeSensitiveNetworkFields = false,
): Promise<{ family: string; experimental: boolean; summary: unknown }> {
  const family = instrument ?? inferFamilyFromPath(sourcePath) ?? 'time-profiler';
  const summary =
    family === 'time-profiler'
      ? await summarizeTimeProfilerTrace(sourcePath)
      : await summarizeGenericFamily({
          family,
          sourcePath,
          includeSensitiveNetworkFields,
        });
  return {
    family,
    experimental: family === 'processor-trace',
    summary,
  };
}

async function compareTraceSources(
  family: z.infer<typeof FAMILY_ENUM>,
  baselinePath: string,
  candidatePath: string,
): Promise<unknown> {
  if (family === 'time-profiler') {
    const baseline = await summarizeTimeProfilerTrace(baselinePath);
    const candidate = await summarizeTimeProfilerTrace(candidatePath);
    return compareTimeProfilerSummaries({ baseline, candidate });
  }

  const baseline = await summarizeGenericFamily({ family, sourcePath: baselinePath });
  const candidate = await summarizeGenericFamily({ family, sourcePath: candidatePath });
  return compareGenericSummaries({ baseline, candidate });
}

function loadSnapshot(snapshotId: string): { family: string; summary: any } {
  const db = openDatabase();
  runMigrations(db);
  const snapshot = createRepositories(db).snapshots.getSnapshot(snapshotId);
  db.close();
  if (!snapshot) {
    throw new Error(`Snapshot "${snapshotId}" was not found.`);
  }
  return snapshot;
}

async function generatePromptTool(input: {
  trace_path?: string;
  instrument?: z.infer<typeof FAMILY_ENUM>;
  snapshot_id?: string;
  comparison_id?: string;
  goal?: 'latency' | 'cpu' | 'startup' | 'throughput' | 'generic';
  budget_chars?: number;
  purpose?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);

  const snapshot =
    input.snapshot_id !== undefined
      ? repositories.snapshots.getSnapshot(input.snapshot_id)?.summary
      : input.trace_path !== undefined
        ? (await summarizeSource(input.trace_path, input.instrument)).summary
        : null;
  const comparison = input.comparison_id !== undefined ? repositories.snapshots.getComparison(input.comparison_id) : null;

  if (!snapshot && !comparison) {
    db.close();
    throw new Error('A trace_path, snapshot_id, or comparison_id is required.');
  }

  const promptText = comparison
    ? 'baseline' in comparison
      ? buildComparisonPrompt({
          comparison,
          budgetChars: input.budget_chars ?? 8000,
        })
      : buildGenericComparisonPrompt({
          comparison,
          budgetChars: input.budget_chars ?? 8000,
        })
    : snapshot && 'hotspots' in snapshot
      ? buildOptimizationPrompt({
          summary: snapshot,
          goal: input.goal ?? 'generic',
          budgetChars: input.budget_chars ?? 8000,
        })
      : buildGenericSummaryPrompt({
          summary: snapshot as never,
          goal: input.goal ?? 'generic',
          budgetChars: input.budget_chars ?? 8000,
        });

  const family =
    snapshot && 'hotspots' in snapshot
      ? 'time-profiler'
      : snapshot && 'family' in snapshot
        ? snapshot.family
        : comparison && 'family' in comparison
          ? comparison.family
          : input.instrument ?? 'time-profiler';

  const stored = repositories.snapshots.persistPromptPack({
    snapshotId: input.snapshot_id ?? null,
    comparisonId: input.comparison_id ?? null,
    family,
    purpose: input.purpose ?? input.goal ?? 'generic',
    promptText,
  });

  db.close();
  return jsonContent({
    prompt_markdown: promptText,
    metadata: {
      char_count: promptText.length,
      prompt_pack_id: stored.promptPackId,
    },
  });
}

function jsonContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
