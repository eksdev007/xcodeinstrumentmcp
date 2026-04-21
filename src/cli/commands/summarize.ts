import process from 'node:process';

import { createRepositories } from '../../application/db.js';
import { summarizeGenericFamily } from '../../application/family-summaries.js';
import { inferFamilyFromPath, isSupportedInstrumentFamily } from '../../application/instrument-family.js';
import { summarizeTimeProfilerTrace } from '../../application/time-profiler.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';
import { renderGenericSummary } from '../../presentation/generic.js';
import { renderTimeProfilerSummary } from '../../presentation/time-profiler.js';

type SummarizeOptions = {
  input?: string;
  snapshot?: string;
  instrument?: string;
  json?: boolean;
  format?: 'json' | 'markdown' | 'table';
};

export async function executeSummarizeCommand(options: SummarizeOptions): Promise<void> {
  if (!options.input && !options.snapshot) {
    throw new Error('The summarize command currently requires --input <path> or --snapshot <id>.');
  }

  let summary;
  let family = options.instrument;

  if (options.snapshot) {
    const db = openDatabase();
    runMigrations(db);
    const repositories = createRepositories(db);
    const stored = repositories.snapshots.getSnapshot(options.snapshot);
    db.close();

    if (!stored) {
      throw new Error(`Snapshot "${options.snapshot}" was not found.`);
    }

    summary = stored.summary;
    family = stored.family;
  } else {
    family = options.instrument ?? inferFamilyFromPath(options.input!);
    if (!family || !isSupportedInstrumentFamily(family)) {
      throw new Error('The summarize command requires a supported --instrument <family> when the family cannot be inferred.');
    }
    summary =
      family === 'time-profiler'
        ? await summarizeTimeProfilerTrace(options.input!)
        : await summarizeGenericFamily({ family, sourcePath: options.input! });
  }

  const format = options.json ? 'json' : options.format ?? 'markdown';
  process.stdout.write(
    'hotspots' in summary ? renderTimeProfilerSummary(summary, format) : renderGenericSummary(summary, format),
  );
}
