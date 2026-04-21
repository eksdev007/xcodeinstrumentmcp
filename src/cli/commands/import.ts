import process from 'node:process';

import { createRepositories } from '../../application/db.js';
import { summarizeGenericFamily } from '../../application/family-summaries.js';
import { inferFamilyFromPath, isSupportedInstrumentFamily } from '../../application/instrument-family.js';
import { summarizeTimeProfilerTrace } from '../../application/time-profiler.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';

type ImportOptions = {
  input?: string;
  instrument?: string;
};

export async function executeImportCommand(options: ImportOptions): Promise<void> {
  if (!options.input) {
    throw new Error('The import command requires --input <path>.');
  }

  const family = options.instrument ?? inferFamilyFromPath(options.input);
  if (!family || !isSupportedInstrumentFamily(family)) {
    throw new Error('The import command requires a supported --instrument <family> when the family cannot be inferred.');
  }

  const summary =
    family === 'time-profiler'
      ? await summarizeTimeProfilerTrace(options.input)
      : await summarizeGenericFamily({
          family,
          sourcePath: options.input,
        });
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const stored = repositories.snapshots.persistSummary({
    tracePath: options.input,
    family,
    summary,
    schemaVersion: 1,
  });
  const processName = 'processSelection' in stored.summary ? stored.summary.processSelection.name : stored.summary.metadata.processName;
  process.stdout.write(
    `${JSON.stringify({ snapshot_id: stored.snapshotId, family: stored.family, process: processName }, null, 2)}\n`,
  );
  db.close();
}
