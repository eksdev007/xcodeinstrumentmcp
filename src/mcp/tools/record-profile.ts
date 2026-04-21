import { executeRecordCommand } from '../../cli/commands/record.js';

export async function executeRecordProfile(input: {
  instrument: 'time-profiler' | 'allocations' | 'leaks' | 'hangs' | 'network' | 'processor-trace' | 'energy-log';
  outputPath: string;
  device?: string;
  attach?: string;
  timeLimit?: string;
  saveSnapshot?: boolean;
}): Promise<Record<string, unknown>> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;

  try {
    return (await executeRecordCommand({
      instrument: input.instrument,
      output: input.outputPath,
      device: input.device,
      attach: input.attach,
      timeLimit: input.timeLimit,
      saveSnapshot: input.saveSnapshot,
      noPrompt: true,
      xctraceStdout: 'ignore',
    })) as Record<string, unknown>;
  } finally {
    process.stdout.write = originalWrite;
  }
}
