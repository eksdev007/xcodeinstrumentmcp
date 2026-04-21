import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { describe, expect, test } from 'vitest';

describe('release readiness gate', () => {
  test('passes when all required acceptance items are done', () => {
    const result = spawnSync('bash', ['scripts/release_readiness.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const matrix = JSON.parse(readFileSync('docs/acceptance-matrix.json', 'utf8')) as {
      items: Array<{ id: string; required: boolean; status: string }>;
    };

    expect(matrix.items.filter((item) => item.required && item.status !== 'done')).toEqual([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('release-readiness: all required acceptance items are done');
  });
});
