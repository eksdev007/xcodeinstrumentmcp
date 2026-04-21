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

function copyFixtureProject(): string {
  const sourceRoot = path.resolve('fixtures/signposts/SampleApp');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-signpost-project-'));
  fs.cpSync(sourceRoot, tempRoot, { recursive: true });
  return tempRoot;
}

describe('signpost CLI flow', () => {
  test('scan/plan/apply/status/revert completes against a Swift fixture project', async () => {
    const projectRoot = copyFixtureProject();
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xim-signpost-db-')), 'cache.db');
    process.env.XIM_DB_PATH = databasePath;
    const filePath = path.join(projectRoot, 'Sources', 'GatewayViewModel.swift');
    const originalText = fs.readFileSync(filePath, 'utf8');

    const scanned = await captureCli(['signpost', 'scan', '--project-root', projectRoot]);
    expect(scanned.code).toBe(0);
    expect(scanned.stdout).toContain('GatewayViewModel.refresh');

    const planned = await captureCli([
      'signpost',
      'plan',
      '--project-root',
      projectRoot,
      '--strategy',
      'explicit-symbols',
      '--symbol',
      'GatewayViewModel.refresh',
      '--symbol',
      'GatewayViewModel.loadDevices',
    ]);
    expect(planned.code).toBe(0);
    const planJson = JSON.parse(planned.stdout) as { planId: string; candidates: Array<{ confidence: string }> };
    expect(planJson.planId).toMatch(/^plan_/);
    expect(planJson.candidates).toHaveLength(2);

    const applied = await captureCli(['signpost', 'apply', '--plan', planJson.planId]);
    expect(applied.code).toBe(0);
    const applyJson = JSON.parse(applied.stdout) as { patchId: string };
    expect(applyJson.patchId).toMatch(/^patch_/);
    const modifiedText = fs.readFileSync(filePath, 'utf8');
    expect(modifiedText).toContain('// xcodeinstrumentmcp:begin');
    expect(modifiedText).toContain('beginInterval("GatewayViewModel.refresh")');

    const status = await captureCli(['signpost', 'status', '--project-root', projectRoot]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(applyJson.patchId);

    const reverted = await captureCli(['signpost', 'revert', '--patch', applyJson.patchId]);
    expect(reverted.code).toBe(0);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(originalText);
  }, 30000);
});
