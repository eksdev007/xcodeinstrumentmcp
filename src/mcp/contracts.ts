import { z } from 'zod';

export const McpSummaryResponseSchema = z.object({
  family: z.string(),
  experimental: z.boolean(),
  summary: z.object({
    findings: z.array(z.object({ kind: z.string(), title: z.string(), summary: z.string() })),
  }).passthrough(),
});

export const McpImportResponseSchema = z.object({
  persisted: z.boolean(),
  snapshot_id: z.string().optional(),
  family: z.string(),
  experimental: z.boolean(),
  summary: z.object({
    findings: z.array(z.object({ kind: z.string(), title: z.string(), summary: z.string() })),
  }).passthrough(),
});

export const McpComparisonResponseSchema = z.object({
  comparison_id: z.string().optional(),
  family: z.string(),
  experimental: z.boolean(),
  comparison: z.object({}).passthrough(),
});

export const McpPromptResponseSchema = z.object({
  prompt_markdown: z.string(),
  metadata: z.object({
    char_count: z.number(),
    prompt_pack_id: z.string(),
  }),
});

export const McpSignpostPlanResponseSchema = z.object({
  planId: z.string(),
  projectId: z.string(),
  strategy: z.string(),
  candidates: z.array(
    z.object({
      declarationId: z.string(),
      filePath: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      signpostName: z.string(),
    }).passthrough(),
  ),
});

export const McpSignpostApplyResponseSchema = z.object({
  patchId: z.string(),
  appliedFiles: z.array(z.string()),
  skippedCandidates: z.array(z.string()),
});

export const McpSignpostRevertResponseSchema = z.object({
  patchId: z.string(),
  revertedFiles: z.array(z.string()),
});
