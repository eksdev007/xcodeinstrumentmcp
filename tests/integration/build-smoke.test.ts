import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

import { beforeAll, describe, expect, test } from 'vitest';

describe('build smoke', () => {
  beforeAll(() => {
    rmSync('dist', { force: true, recursive: true });
  });

  test('package builds as one ESM CLI entrypoint', () => {
    const result = spawnSync('pnpm', ['exec', 'tsup'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dist/index.js');
  });
});
