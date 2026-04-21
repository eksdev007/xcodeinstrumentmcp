import process from 'node:process';

import { formatOutput } from '../../presentation/output.js';
import { inspectCapabilities } from '../../application/capabilities.js';
import type { CapabilityReport } from '../../domain/models.js';

type DoctorCommandOptions = {
  json?: boolean;
  format?: 'json' | 'markdown' | 'table';
};

export async function executeDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  const report = await inspectCapabilities();
  const format = resolveFormat(options);
  const output = renderDoctor(report, format);
  process.stdout.write(output);
}

function resolveFormat(options: DoctorCommandOptions): 'json' | 'markdown' | 'table' {
  if (options.json) {
    return 'json';
  }

  return options.format ?? 'markdown';
}

function renderDoctor(report: CapabilityReport, format: 'json' | 'markdown' | 'table'): string {
  if (format === 'json') {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return formatOutput({
    format,
    title: 'Doctor Report',
    intro: `Environment is ${report.ok ? 'ready for discovery commands' : 'missing required capabilities'}.`,
    sections: [
      {
        title: 'Checks',
        lines: report.checks.map((check) => {
          const state = check.ok ? 'ok' : 'fail';
          return `${state}  ${check.name}${check.details ? `  ${check.details}` : ''}`;
        }),
      },
      {
        title: 'Resolved Tools',
        lines: [
          `platform: ${report.platform}`,
          `node: ${report.nodeVersion}`,
          `xctrace path: ${report.xctracePath ?? 'unavailable'}`,
          `swift helper: ${report.swiftHelperPresent ? 'present' : 'missing'}`,
          `database path writable: ${report.databasePathWritable ? 'yes' : 'no'}`,
        ],
      },
    ],
  });
}
