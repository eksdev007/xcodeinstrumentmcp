import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { runCli } from '../../src/cli/index.js';

const originalStdoutWrite = process.stdout.write.bind(process.stdout);

async function captureCli(argv: string[]): Promise<{ code: number; stdout: string }> {
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  }) as typeof process.stdout.write;

  try {
    const code = await runCli(['node', 'xcodeinstrumentmcp', ...argv]);
    return { code, stdout: output };
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
}

describe('multi-family CLI workflows', () => {
  test('import/summarize/compare/prompt operate across the required families', async () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xim-cli-')), 'cache.db');
    process.env.XIM_DB_PATH = databasePath;

    const cases = [
      ['allocations', 'fixtures/exports/allocations/statistics.xml'],
      ['leaks', 'fixtures/exports/leaks/leaks.xml'],
      ['hangs', 'fixtures/exports/hangs/potential-hangs.xml'],
      ['network', 'fixtures/exports/network/sample.har'],
      ['energy-log', 'fixtures/exports/energy-log/energy.xml'],
      ['processor-trace', 'fixtures/exports/processor-trace/processor.xml'],
      ['memory-graph', 'fixtures/exports/memory-graph/sample.memgraph'],
    ] as const;

    for (const [family, input] of cases) {
      const imported = await captureCli(['import', '--instrument', family, '--input', input]);
      expect(imported.code).toBe(0);
      const importJson = JSON.parse(imported.stdout) as { snapshot_id: string };
      expect(importJson.snapshot_id).toMatch(/^snap_/);

      const summarized = await captureCli(['summarize', '--snapshot', importJson.snapshot_id, '--format', 'json']);
      expect(summarized.code).toBe(0);
      expect(summarized.stdout).toContain(`"family": "${family}"`);

      const compared = await captureCli([
        'compare',
        '--baseline-snapshot',
        importJson.snapshot_id,
        '--candidate-snapshot',
        importJson.snapshot_id,
        '--format',
        'json',
      ]);
      expect(compared.code).toBe(0);
      expect(compared.stdout).toContain('"comparison_id"');

      const prompted = await captureCli(['prompt', '--snapshot', importJson.snapshot_id, '--format', 'json']);
      expect(prompted.code).toBe(0);
      expect(prompted.stdout).toContain('"prompt_pack_id"');
    }
  }, 30000);
});
