import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

describe('README coverage', () => {
  test('documents install, quick start, MCP setup, limitations, privacy, and troubleshooting', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).toContain('## Install');
    expect(readme).toContain('## CLI Quick Start');
    expect(readme).toContain('## MCP Setup');
    expect(readme).toContain('## Limitations');
    expect(readme).toContain('## Privacy');
    expect(readme).toContain('## Troubleshooting');
    expect(readme).toContain('xctrace');
    expect(readme).toContain('No Time Profiler table found');
    expect(readme).toContain('compare --baseline-snapshot');
  });
});
