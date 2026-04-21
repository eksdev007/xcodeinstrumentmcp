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

describe('signpost idempotency', () => {
  test('helper skips already instrumented declarations on repeat apply', async () => {
    const projectRoot = copyFixtureProject();
    const filePath = path.join(projectRoot, 'Sources', 'GatewayViewModel.swift');
    const inventory = await runSwiftHelperInventory({ projectRoot });
    const loadDevices = inventory.declarations.find((declaration) => declaration.signpostName === 'GatewayViewModel.loadDevices');
    expect(loadDevices).toBeDefined();

    const first = await runSwiftHelperApply({
      filePath,
      subsystem: 'com.example.fixture',
      category: 'Performance',
      targets: [{ declarationId: loadDevices!.id, signpostName: loadDevices!.signpostName }],
    });
    fs.writeFileSync(filePath, first.modifiedSource);

    const second = await runSwiftHelperApply({
      filePath,
      subsystem: 'com.example.fixture',
      category: 'Performance',
      targets: [{ declarationId: loadDevices!.id, signpostName: loadDevices!.signpostName }],
    });

    expect(second.skippedDeclarationIds.length).toBeGreaterThan(0);
    expect(second.modifiedSource.split('// xcodeinstrumentmcp:begin').length - 1).toBe(1);
  }, 30000);
});
