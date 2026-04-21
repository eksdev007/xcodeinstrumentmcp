import process from 'node:process';

import { createRepositories } from '../../application/db.js';
import { buildGenericComparisonPrompt, buildGenericSummaryPrompt } from '../../application/generic-prompt.js';
import { buildComparisonPrompt, buildOptimizationPrompt } from '../../application/prompt.js';
import { summarizeGenericFamily } from '../../application/family-summaries.js';
import { inferFamilyFromPath } from '../../application/instrument-family.js';
import { summarizeTimeProfilerTrace } from '../../application/time-profiler.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';

type PromptOptions = {
  snapshot?: string;
  comparison?: string;
  trace?: string;
  goal?: 'latency' | 'cpu' | 'startup' | 'throughput' | 'generic';
  budgetChars?: number;
  size?: 'small' | 'medium' | 'large';
  format?: 'markdown' | 'json';
};

export async function executePromptCommand(options: PromptOptions): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);

  const snapshot =
    options.snapshot !== undefined
      ? repositories.snapshots.getSnapshot(options.snapshot)?.summary
      : options.trace !== undefined
        ? (inferFamilyFromPath(options.trace) ?? 'time-profiler') === 'time-profiler'
          ? await summarizeTimeProfilerTrace(options.trace)
          : await summarizeGenericFamily({
              family: inferFamilyFromPath(options.trace)!,
              sourcePath: options.trace,
            })
        : null;
  const comparison = options.comparison ? repositories.snapshots.getComparison(options.comparison) : null;

  if (!snapshot && !comparison) {
    db.close();
    throw new Error('The prompt command requires --snapshot <id>, --comparison <id>, or --trace <path>.');
  }

  const budgetChars = options.budgetChars ?? budgetFromSize(options.size);
  const prompt = comparison
    ? 'baseline' in comparison
      ? buildComparisonPrompt({
          comparison,
          budgetChars,
        })
      : buildGenericComparisonPrompt({
          comparison,
          budgetChars,
        })
    : snapshot && 'hotspots' in snapshot
      ? buildOptimizationPrompt({
          summary: snapshot,
          goal: options.goal ?? 'generic',
          budgetChars,
        })
      : buildGenericSummaryPrompt({
          summary: snapshot as never,
          goal: options.goal ?? 'generic',
          budgetChars,
        });

  const family =
    snapshot && 'hotspots' in snapshot
      ? 'time-profiler'
      : snapshot && 'family' in snapshot
        ? snapshot.family
        : comparison && 'family' in comparison
          ? comparison.family
          : 'time-profiler';

  const stored = repositories.snapshots.persistPromptPack({
    snapshotId: options.snapshot ?? null,
    comparisonId: options.comparison ?? null,
    family,
    purpose: options.goal ?? 'generic',
    promptText: prompt,
  });

  if (options.format === 'json') {
    process.stdout.write(
      `${JSON.stringify({ prompt_markdown: prompt, metadata: { char_count: prompt.length, prompt_pack_id: stored.promptPackId } }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(prompt);
  }

  db.close();
}

function budgetFromSize(size: 'small' | 'medium' | 'large' | undefined): number {
  switch (size) {
    case 'small':
      return 2800;
    case 'medium':
      return 7200;
    case 'large':
      return 14000;
    default:
      return 8000;
  }
}
