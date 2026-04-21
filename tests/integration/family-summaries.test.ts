import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { summarizeGenericFamily } from '../../src/application/family-summaries.js';
import { renderGenericSummary } from '../../src/presentation/generic.js';

const cases = [
  ['allocations', 'fixtures/exports/allocations/statistics.xml', 'fixtures/expected/allocations/summary.md'],
  ['leaks', 'fixtures/exports/leaks/leaks.xml', 'fixtures/expected/leaks/summary.md'],
  ['hangs', 'fixtures/exports/hangs/potential-hangs.xml', 'fixtures/expected/hangs/summary.md'],
  ['network', 'fixtures/exports/network/sample.har', 'fixtures/expected/network/summary.md'],
  ['energy-log', 'fixtures/exports/energy-log/energy.xml', 'fixtures/expected/energy-log/summary.md'],
  ['processor-trace', 'fixtures/exports/processor-trace/processor.xml', 'fixtures/expected/processor-trace/summary.md'],
  ['memory-graph', 'fixtures/exports/memory-graph/sample.memgraph', 'fixtures/expected/memory-graph/summary.md'],
] as const;

describe('multi-family summary fixtures', () => {
  for (const [family, inputPath, expectedPath] of cases) {
    test(`${family} fixture renders the committed Markdown golden`, async () => {
      const summary = await summarizeGenericFamily({
        family,
        sourcePath: inputPath,
      });
      const expectedMarkdown = readFileSync(expectedPath, 'utf8');

      expect(renderGenericSummary(summary, 'markdown').trimEnd()).toBe(expectedMarkdown.trimEnd());
    });
  }

  test('network summaries keep sensitive values redacted by default', async () => {
    const summary = await summarizeGenericFamily({
      family: 'network',
      sourcePath: 'fixtures/exports/network/sample.har',
    });
    const rendered = renderGenericSummary(summary, 'json');

    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain('secret-token');
    expect(rendered).toContain('/v1/devices/:id');
  });
});
