import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';

import { buildTimeProfilerSummary } from '../domain/analysis/time-profiler-summary.js';
import type { TimeProfilerSummary, TraceRun } from '../domain/time-profiler.js';
import { exportTocXml, exportXpathToFile } from '../infrastructure/xctrace-export.js';
import { parseTimeProfileTable } from '../parsers/time-profile-table-parser.js';
import { parseTraceToc } from '../parsers/trace-toc-parser.js';

export async function summarizeTimeProfilerTrace(tracePath: string): Promise<TimeProfilerSummary> {
  const source = await prepareTraceSource(tracePath);

  try {
    const toc = parseTraceToc(await exportTocXml(source.tracePath));
    const run = toc.runs.at(-1);

    if (!run) {
      throw new Error('No runs were found in the supplied trace.');
    }

    if (!run.tables.some((table) => table.schema === 'time-profile')) {
      throw new Error('NO_TIME_PROFILE_TABLE');
    }

    const selectedProcess = selectProcess(run);
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'xim-tp-'));
    const xmlPath = path.join(tempDirectory, 'time-profile.xml');

    await exportXpathToFile(source.tracePath, `/trace-toc/run[@number="${run.runNumber}"]/data/table[@schema="time-profile"]`, xmlPath);

    try {
      const samples = await parseTimeProfileTable(xmlPath);
      const filteredSamples = samples.filter((sample) => sample.processName === selectedProcess.name);
      const notes: string[] = [];

      if (run.tables.some((table) => table.schema.includes('signpost') || table.schema.includes('region-of-interest'))) {
        notes.push('Signpost-like interval tables were detected but interval normalization is not implemented yet.');
      }

      if (filteredSamples.some((sample) => sample.weightNs === null)) {
        notes.push('Some samples lacked explicit weight; sample count was used as fallback for affected rows.');
      }

      return buildTimeProfilerSummary({
        tracePath,
        runNumber: run.runNumber,
        selectedProcessName: selectedProcess.name,
        selectedProcessId: selectedProcess.pid,
        selectedProcessPath: selectedProcess.path,
        samples: filteredSamples,
        notes,
      });
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  } finally {
    await source.cleanup();
  }
}

function selectProcess(run: TraceRun) {
  return run.processes.find((process) => process.name !== 'kernel.release.t6000') ?? run.processes[0] ?? { name: 'unknown', pid: null, path: null };
}

async function prepareTraceSource(tracePath: string): Promise<{ tracePath: string; cleanup: () => Promise<void> }> {
  if (!tracePath.endsWith('.zip')) {
    return {
      tracePath,
      cleanup: async () => {},
    };
  }

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'xim-trace-'));
  await execa('unzip', ['-q', tracePath, '-d', tempDirectory]);
  const entries = await fs.readdir(tempDirectory, { withFileTypes: true });
  const traceEntry = entries.find((entry) => entry.isDirectory() && entry.name !== '__MACOSX');

  if (!traceEntry) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    throw new Error(`Unable to locate an extracted trace bundle inside "${tracePath}".`);
  }

  return {
    tracePath: path.join(tempDirectory, traceEntry.name),
    cleanup: async () => {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    },
  };
}
