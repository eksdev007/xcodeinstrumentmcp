import { describe, expect, test } from 'vitest';

import { buildOptimizationPrompt } from '../../src/application/prompt.js';
import { buildTimeProfilerSummary } from '../../src/domain/analysis/time-profiler-summary.js';
import type { ParsedSample } from '../../src/domain/time-profiler.js';

describe('time profiler quality heuristics', () => {
  test('excludes wrapper entrypoints from actionable hotspot ranking and prompt evidence', () => {
    const summary = buildTimeProfilerSummary({
      tracePath: '/tmp/test.trace',
      runNumber: 1,
      selectedProcessName: 'DemoApp',
      selectedProcessId: '123',
      selectedProcessPath: '/tmp/DemoApp.app/DemoApp',
      notes: [],
      samples: [
        sample('Main Thread', [
          frame(0, 'FeatureA.render', 'DemoApp'),
          frame(1, '__debug_main_executable_dylib_entry_point', 'DemoApp.debug.dylib'),
        ]),
        sample('Main Thread', [
          frame(0, 'FeatureB.load', 'DemoApp'),
          frame(1, '__debug_main_executable_dylib_entry_point', 'DemoApp.debug.dylib'),
        ]),
        sample('Main Thread', [
          frame(0, 'FeatureC.persist', 'DemoApp'),
          frame(1, '__debug_main_executable_dylib_entry_point', 'DemoApp.debug.dylib'),
        ]),
      ],
    });

    expect(summary.hotspots[0]?.symbol).toBe('FeatureA.render');
    expect(summary.hotspots.map((hotspot) => hotspot.symbol)).not.toContain('__debug_main_executable_dylib_entry_point');
    expect(summary.notes.join(' ')).toContain('Wrapper-style entrypoint frames were excluded');

    const prompt = buildOptimizationPrompt({
      summary,
      goal: 'cpu',
      budgetChars: 4000,
    });

    expect(prompt).toContain('FeatureA.render');
    expect(prompt).not.toContain('__debug_main_executable_dylib_entry_point');
  });

  test('makes sparse-trace findings explicit when wrapper noise was filtered out', () => {
    const summary = buildTimeProfilerSummary({
      tracePath: '/tmp/test.trace',
      runNumber: 1,
      selectedProcessName: 'DemoApp',
      selectedProcessId: '123',
      selectedProcessPath: '/tmp/DemoApp.app/DemoApp',
      notes: [],
      samples: Array.from({ length: 10 }, (_, index) =>
        sample('Main Thread', [
          frame(0, `Feature${index}.render`, 'LuciqSDK'),
          frame(1, '__debug_main_executable_dylib_entry_point', 'DemoApp.debug.dylib'),
        ]),
      ),
    });

    expect(summary.findings.find((finding) => finding.kind === 'sparse_trace_warning')?.summary).toContain(
      'excluded from actionable ranking',
    );
  });

  test('prefers app-binary symbols over third-party sdk symbols when both are present', () => {
    const summary = buildTimeProfilerSummary({
      tracePath: '/tmp/test.trace',
      runNumber: 1,
      selectedProcessName: 'DemoApp',
      selectedProcessId: '123',
      selectedProcessPath: '/tmp/DemoApp.app/DemoApp',
      notes: [],
      samples: [
        sample('Main Thread', [frame(0, 'SDK.poll', 'LuciqSDK')]),
        sample('Main Thread', [frame(0, 'SDK.persist', 'LuciqSDK')]),
        sample('Main Thread', [frame(0, 'FIRCLSBinaryImageRecordSlice', 'DemoApp.debug.dylib')]),
        sample('Main Thread', [frame(0, 'AppDelegate.application', 'DemoApp.debug.dylib')]),
        sample('Main Thread', [frame(0, 'FeatureView.render', 'DemoApp')]),
      ],
    });

    expect(summary.hotspots.map((hotspot) => hotspot.module)).toEqual(expect.arrayContaining(['DemoApp', 'DemoApp.debug.dylib']));
    expect(summary.hotspots.map((hotspot) => hotspot.module)).not.toContain('LuciqSDK');
    expect(summary.hotspots.map((hotspot) => hotspot.symbol)).not.toContain('FIRCLSBinaryImageRecordSlice');
    expect(summary.notes.join(' ')).toContain('Third-party and non-app modules were excluded');
  });
});

function sample(threadName: string, frames: ParsedSample['frames']): ParsedSample {
  return {
    sampleTimeNs: 1,
    threadName,
    threadId: '1',
    processName: 'DemoApp',
    processId: '123',
    weightNs: 1,
    frames,
  };
}

function frame(index: number, symbol: string, module: string): ParsedSample['frames'][number] {
  return {
    index,
    symbol,
    module,
    binaryPath: null,
    rawAddress: null,
    canonicalKey: `${module}::${symbol}`,
    isSystem: false,
  };
}
