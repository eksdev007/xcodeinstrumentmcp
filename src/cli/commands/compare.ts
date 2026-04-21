import process from 'node:process';

import { compareTimeProfilerSummaries } from '../../application/compare.js';
import { createRepositories } from '../../application/db.js';
import { summarizeGenericFamily } from '../../application/family-summaries.js';
import { compareGenericSummaries } from '../../application/generic-compare.js';
import { inferFamilyFromPath, isSupportedInstrumentFamily } from '../../application/instrument-family.js';
import { summarizeTimeProfilerTrace } from '../../application/time-profiler.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';
import { renderTimeProfilerComparison } from '../../presentation/comparison.js';
import { renderGenericComparison } from '../../presentation/generic.js';

type CompareOptions = {
  baselineSnapshot?: string;
  candidateSnapshot?: string;
  baselineInput?: string;
  candidateInput?: string;
  instrument?: string;
  json?: boolean;
  format?: 'json' | 'markdown' | 'table';
  topDeltas?: number;
  regressionThresholdPct?: number;
  regressionThresholdMs?: number;
};

export async function executeCompareCommand(options: CompareOptions): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const family =
    options.instrument ??
    (options.baselineSnapshot ? repositories.snapshots.getSnapshot(options.baselineSnapshot)?.family : undefined) ??
    (options.candidateSnapshot ? repositories.snapshots.getSnapshot(options.candidateSnapshot)?.family : undefined) ??
    (options.baselineInput ? inferFamilyFromPath(options.baselineInput) : undefined) ??
    (options.candidateInput ? inferFamilyFromPath(options.candidateInput) : undefined);
  if (!family || !isSupportedInstrumentFamily(family)) {
    db.close();
    throw new Error('The compare command requires a supported --instrument <family> when the family cannot be inferred.');
  }

  const baseline =
    options.baselineSnapshot !== undefined
      ? repositories.snapshots.getSnapshot(options.baselineSnapshot)?.summary
      : options.baselineInput !== undefined
        ? family === 'time-profiler'
          ? await summarizeTimeProfilerTrace(options.baselineInput)
          : await summarizeGenericFamily({ family, sourcePath: options.baselineInput })
        : null;
  const candidate =
    options.candidateSnapshot !== undefined
      ? repositories.snapshots.getSnapshot(options.candidateSnapshot)?.summary
      : options.candidateInput !== undefined
        ? family === 'time-profiler'
          ? await summarizeTimeProfilerTrace(options.candidateInput)
          : await summarizeGenericFamily({ family, sourcePath: options.candidateInput })
        : null;

  if (!baseline || !candidate) {
    db.close();
    throw new Error('The compare command requires baseline/candidate inputs or snapshot ids.');
  }

  const comparison =
    family === 'time-profiler' && 'hotspots' in baseline && 'hotspots' in candidate
      ? compareTimeProfilerSummaries({
          baseline,
          candidate,
          topDeltas: options.topDeltas,
          regressionThresholdPct: options.regressionThresholdPct,
          regressionThresholdMs: options.regressionThresholdMs,
        })
      : compareGenericSummaries({
          baseline: baseline as never,
          candidate: candidate as never,
          topDeltas: options.topDeltas,
        });

  const comparisonId = repositories.snapshots.persistComparison({
    baselineSnapshotId: options.baselineSnapshot ?? null,
    candidateSnapshotId: options.candidateSnapshot ?? null,
    family,
    comparison,
  });

  const format = options.json ? 'json' : options.format ?? 'markdown';
  const output =
    family === 'time-profiler' && 'regressions' in comparison && 'baseline' in comparison
      ? renderTimeProfilerComparison(comparison, format)
      : renderGenericComparison(comparison as never, format);

  if (format === 'json') {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    process.stdout.write(`${JSON.stringify({ comparison_id: comparisonId.comparisonId, ...parsed }, null, 2)}\n`);
  } else {
    process.stdout.write(output);
  }

  db.close();
}
