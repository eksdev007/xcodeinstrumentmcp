import { describe, expect, test } from 'vitest';

import { MCP_TOOL_NAMES } from '../../src/mcp/server.js';

describe('MCP tool registry', () => {
  test('includes the required v1 and v1.1 high-value tools', () => {
    expect(MCP_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        'doctor',
        'list_templates',
        'list_devices',
        'list_instruments',
        'record_time_profile',
        'summarize_trace',
        'compare_traces',
        'generate_optimization_prompt',
        'inspect_capabilities',
        'record_profile',
        'import_source',
        'summarize_snapshot',
        'compare_snapshots',
        'generate_prompt_pack',
        'list_snapshots',
        'get_snapshot',
        'get_comparison',
        'get_findings',
        'plan_signposts',
        'apply_signpost_plan',
        'revert_signpost_patch',
      ]),
    );
  });
});
