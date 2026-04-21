import { execa } from 'execa';

import { resolveXctrace } from './xctrace.js';

export async function exportTocXml(tracePath: string): Promise<string> {
  const xctracePath = await requireXctrace();
  const result = await execa(xctracePath, ['export', '--input', tracePath, '--toc']);
  return result.stdout;
}

export async function exportTableXml(tracePath: string, runNumber: number, schema: string): Promise<string> {
  const xctracePath = await requireXctrace();
  const result = await execa(xctracePath, [
    'export',
    '--input',
    tracePath,
    '--xpath',
    `/trace-toc/run[@number="${runNumber}"]/data/table[@schema="${schema}"]`,
  ]);
  return result.stdout;
}

export async function exportTrackDetailXml(
  tracePath: string,
  runNumber: number,
  trackName: string,
  detailName: string,
): Promise<string> {
  const xctracePath = await requireXctrace();
  const result = await execa(xctracePath, [
    'export',
    '--input',
    tracePath,
    '--xpath',
    `/trace-toc/run[@number="${runNumber}"]/tracks/track[@name="${trackName}"]/details/detail[@name="${detailName}"]`,
  ]);
  return result.stdout;
}

export async function exportXpathToFile(tracePath: string, xpath: string, outputPath: string): Promise<void> {
  const xctracePath = await requireXctrace();
  await execa(xctracePath, ['export', '--input', tracePath, '--xpath', xpath, '--output', outputPath]);
}

async function requireXctrace(): Promise<string> {
  const xctracePath = await resolveXctrace();

  if (xctracePath === null) {
    throw new Error('xctrace could not be resolved. Run `xcodeinstrumentmcp doctor` for remediation details.');
  }

  return xctracePath;
}
