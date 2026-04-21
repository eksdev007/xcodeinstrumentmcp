import { describe, expect, test } from 'vitest';

import { buildCli } from '../../src/cli/index.js';

describe('CLI help surface', () => {
  test('includes the required top-level commands for the first OSS release', () => {
    const help = buildCli().helpInformation();

    expect(help).toContain('doctor');
    expect(help).toContain('list');
    expect(help).toContain('record');
    expect(help).toContain('summarize');
    expect(help).toContain('compare');
    expect(help).toContain('prompt');
    expect(help).toContain('import');
    expect(help).toContain('db');
    expect(help).toContain('signpost');
    expect(help).toContain('mcp');
  });

  test('exposes the required db and signpost subcommands', () => {
    const root = buildCli();
    const db = root.commands.find((command) => command.name() === 'db');
    const signpost = root.commands.find((command) => command.name() === 'signpost');

    expect(db?.commands.map((command) => command.name())).toEqual([
      'stats',
      'list-snapshots',
      'show-snapshot',
      'show-comparison',
      'vacuum',
    ]);

    expect(signpost?.commands.map((command) => command.name())).toEqual([
      'scan',
      'plan',
      'apply',
      'revert',
      'status',
    ]);
  });
});
