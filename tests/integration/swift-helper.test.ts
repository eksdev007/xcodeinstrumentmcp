import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { runSwiftHelperApply, runSwiftHelperInventory } from '../../src/infrastructure/swifthelper.js';

function copyFixtureProject(): string {
  const sourceRoot = path.resolve('fixtures/signposts/SampleApp');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-signpost-project-'));
  fs.cpSync(sourceRoot, tempRoot, { recursive: true });
  return tempRoot;
}

describe('swift helper', () => {
  test('inventories swift declarations and applies OSSignposter instrumentation', async () => {
    const projectRoot = copyFixtureProject();
    const filePath = path.join(projectRoot, 'Sources', 'GatewayViewModel.swift');
    const inventory = await runSwiftHelperInventory({ projectRoot });
    const refresh = inventory.declarations.find((declaration) => declaration.signpostName === 'GatewayViewModel.refresh');
    expect(refresh).toBeDefined();

    const response = await runSwiftHelperApply({
      filePath,
      subsystem: 'com.example.fixture',
      category: 'Performance',
      targets: [{ declarationId: refresh!.id, signpostName: refresh!.signpostName }],
    });

    expect(response.diagnostics).toEqual([]);
    expect(response.modifiedSource).toContain('import OSLog');
    expect(response.modifiedSource).toContain('private let __ximSignposter = OSSignposter(');
    expect(response.modifiedSource).toContain('// xcodeinstrumentmcp:begin');
    expect(response.modifiedSource).toContain('beginInterval("GatewayViewModel.refresh")');
    expect(response.modifiedSource).toContain('defer { __ximSignposter.endInterval("GatewayViewModel.refresh", __ximState) }');
  }, 30000);
});
