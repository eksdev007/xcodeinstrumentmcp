import process from 'node:process';

import { execa } from 'execa';

import { summarizeGenericFamily } from '../../application/family-summaries.js';
import { normalizeDeviceSelector } from '../../application/listing.js';
import { defaultTemplateForFamily, isSupportedInstrumentFamily } from '../../application/instrument-family.js';
import { summarizeTimeProfilerTrace } from '../../application/time-profiler.js';
import { createRepositories } from '../../application/db.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';
import { resolveXctrace } from '../../infrastructure/xctrace.js';

type RecordOptions = {
  instrument?: string;
  template?: string;
  device?: string;
  output?: string;
  timeLimit?: string;
  manualStop?: boolean;
  runName?: string;
  attach?: string;
  launch?: string;
  allProcesses?: boolean;
  saveSnapshot?: boolean;
  summarize?: boolean;
  summaryFormat?: 'json' | 'markdown' | 'table';
  noPrompt?: boolean;
  xctraceStdout?: 'inherit' | 'ignore';
};

export type RecordCommandResult = {
  recorded: true;
  output: string;
  family: string;
  snapshot_id?: string;
};

export async function executeRecordCommand(options: RecordOptions): Promise<RecordCommandResult> {
  if (!options.instrument || !isSupportedInstrumentFamily(options.instrument)) {
    throw new Error('The record command requires a supported --instrument <family>.');
  }
  if (!options.output) {
    throw new Error('The record command requires --output <path>.');
  }
  if (options.instrument === 'memory-graph') {
    throw new Error('Memory Graph is import-only in this release. Use `import --instrument memory-graph --input <file.memgraph>`.');
  }

  const xctracePath = await resolveXctrace();
  if (!xctracePath) {
    throw new Error('xctrace could not be resolved. Run `xcodeinstrumentmcp doctor` for remediation details.');
  }

  const args = ['record', '--template', options.template ?? defaultTemplateForFamily(options.instrument) ?? 'Time Profiler', '--output', options.output];
  if (options.device) args.push('--device', normalizeDeviceSelector(options.device));
  if (options.timeLimit && !options.manualStop) args.push('--time-limit', options.timeLimit);
  if (options.runName) args.push('--run-name', options.runName);
  if (options.noPrompt) args.push('--no-prompt');
  if (options.attach) {
    args.push('--attach', options.attach);
  } else if (options.launch) {
    throw new Error('Launch-based record is not implemented yet; use --attach for this release.');
  } else if (options.allProcesses) {
    args.push('--all-processes');
  } else {
    throw new Error('Record requires one of --attach, --launch, or --all-processes.');
  }

  try {
    await execa(xctracePath, args, { stderr: 'inherit', stdout: options.xctraceStdout ?? 'inherit' });
  } catch (error) {
    throw new Error(`xctrace record failed for ${options.instrument}. If this target/platform is unsupported, import an existing artifact instead.`);
  }

  if (!options.saveSnapshot && !options.summarize) {
    const result = { recorded: true, output: options.output, family: options.instrument } satisfies RecordCommandResult;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const summary =
    options.instrument === 'time-profiler'
      ? await summarizeTimeProfilerTrace(options.output)
      : await summarizeGenericFamily({ family: options.instrument, sourcePath: options.output });

  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const stored = repositories.snapshots.persistSummary({
    tracePath: options.output,
    family: options.instrument,
    summary,
    schemaVersion: 1,
  });
  db.close();

  const result = {
    recorded: true,
    output: options.output,
    family: options.instrument,
    snapshot_id: stored.snapshotId,
  } satisfies RecordCommandResult;

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}
