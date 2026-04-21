import { describe, expect, test } from 'vitest';

import {
  McpComparisonResponseSchema,
  McpImportResponseSchema,
  McpPromptResponseSchema,
  McpSignpostApplyResponseSchema,
  McpSignpostPlanResponseSchema,
  McpSignpostRevertResponseSchema,
  McpSummaryResponseSchema,
} from '../../src/mcp/contracts.js';

describe('MCP response contracts', () => {
  test('summary/import/comparison/prompt/signpost schemas stay stable and bounded', () => {
    expect(
      McpSummaryResponseSchema.parse({
        family: 'network',
        experimental: false,
        summary: { findings: [{ kind: 'chatty-endpoint', title: 'Chatty', summary: 'Example' }] },
      }),
    ).toBeTruthy();

    expect(
      McpImportResponseSchema.parse({
        persisted: true,
        snapshot_id: 'snap_123',
        family: 'allocations',
        experimental: false,
        summary: { findings: [{ kind: 'allocation-churn', title: 'Churn', summary: 'Example' }] },
      }),
    ).toBeTruthy();

    expect(
      McpComparisonResponseSchema.parse({
        comparison_id: 'cmp_123',
        family: 'processor-trace',
        experimental: true,
        comparison: { comparable: true },
      }),
    ).toBeTruthy();

    expect(
      McpPromptResponseSchema.parse({
        prompt_markdown: 'Optimize this result',
        metadata: { char_count: 20, prompt_pack_id: 'prompt_123' },
      }),
    ).toBeTruthy();

    expect(
      McpSignpostPlanResponseSchema.parse({
        planId: 'plan_123',
        projectId: 'sgproj_123',
        strategy: 'explicit-symbols',
        candidates: [{ declarationId: 'file::GatewayViewModel.refresh', filePath: '/tmp/file.swift', confidence: 'high', signpostName: 'GatewayViewModel.refresh' }],
      }),
    ).toBeTruthy();

    expect(
      McpSignpostApplyResponseSchema.parse({
        patchId: 'patch_123',
        appliedFiles: ['/tmp/file.swift'],
        skippedCandidates: [],
      }),
    ).toBeTruthy();

    expect(
      McpSignpostRevertResponseSchema.parse({
        patchId: 'patch_123',
        revertedFiles: ['/tmp/file.swift'],
      }),
    ).toBeTruthy();
  });
});
