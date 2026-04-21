import process from 'node:process';

import { formatOutput } from '../../presentation/output.js';
import { listDiscoverySurface } from '../../application/listing.js';

export async function executeListCommand(kind: 'templates' | 'devices' | 'instruments'): Promise<void> {
  const report = await listDiscoverySurface(kind);

  process.stdout.write(
    formatOutput({
      format: 'table',
      title: `List ${kind}`,
      sections: [
        {
          title: kind,
          lines: report.items,
        },
      ],
    }),
  );
}
