import { beforeEach, describe, expect, test, vi } from 'vitest';

const executeRecordCommandMock = vi.fn();

vi.mock('../../src/cli/commands/record.js', () => ({
  executeRecordCommand: executeRecordCommandMock,
}));

describe('MCP record profile wrapper', () => {
  beforeEach(() => {
    executeRecordCommandMock.mockReset();
  });

  test('returns the structured record result without parsing stdout noise', async () => {
    executeRecordCommandMock.mockImplementation(async () => {
      process.stdout.write('xctrace progress that should not be parsed\n');
      return {
        recorded: true,
        output: '/tmp/out.trace',
        family: 'time-profiler',
        snapshot_id: 'snap_123',
      };
    });

    const { executeRecordProfile } = await import('../../src/mcp/tools/record-profile.js');
    const result = await executeRecordProfile({
      instrument: 'time-profiler',
      outputPath: '/tmp/out.trace',
      device: 'iPhone Air Simulator (26.2) (BE673C04-EC65-4D6A-B3B1-F93AB9406D3C)',
      attach: '20498',
      timeLimit: '5s',
      saveSnapshot: true,
    });

    expect(result).toEqual({
      recorded: true,
      output: '/tmp/out.trace',
      family: 'time-profiler',
      snapshot_id: 'snap_123',
    });
    expect(executeRecordCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        xctraceStdout: 'ignore',
      }),
    );
  });
});
