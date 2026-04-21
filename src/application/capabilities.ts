import fs from 'node:fs/promises';

import { resolveXctrace, runXctrace } from '../infrastructure/xctrace.js';
import type { CapabilityCheck, CapabilityReport } from '../domain/models.js';
import { defaultCachePath } from '../shared/version.js';

export async function inspectCapabilities(): Promise<CapabilityReport> {
  const checks: CapabilityCheck[] = [];

  checks.push({
    name: 'node',
    ok: Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 22,
    details: process.version,
  });

  checks.push({
    name: 'platform',
    ok: process.platform === 'darwin',
    details: process.platform,
  });

  const xctracePath = await resolveXctrace();

  checks.push({
    name: 'xctrace',
    ok: xctracePath !== null,
    details: xctracePath ?? 'xctrace not found via xcrun',
  });

  let xctraceVersionRaw: string | null = null;
  let templates: string[] = [];

  if (xctracePath !== null) {
    xctraceVersionRaw = (await runXctrace(['version'])).trim();
    templates = parseListOutput(await runXctrace(['list', 'templates']));
  }

  checks.push({
    name: 'timeProfilerTemplate',
    ok: templates.includes('Time Profiler'),
    details: templates.includes('Time Profiler') ? 'Time Profiler available' : 'Time Profiler missing',
  });

  const swiftHelperPresent = false;
  checks.push({
    name: 'swiftHelper',
    ok: swiftHelperPresent,
    details: 'xim-swiftsignpost has not been built yet',
  });

  const databasePathWritable = await canTouch(defaultCachePath);
  checks.push({
    name: 'database',
    ok: databasePathWritable,
    details: defaultCachePath,
  });

  return {
    ok: checks.every((check) => check.ok),
    nodeVersion: process.version,
    platform: process.platform,
    xctracePath,
    xctraceVersionRaw,
    checks,
    templates,
    swiftHelperPresent,
    databasePathWritable,
  };
}

function parseListOutput(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('=='));
}

async function canTouch(path: string): Promise<boolean> {
  try {
    const url = new URL(`file://${path}`);
    const directoryUrl = new URL('.', url);
    await fs.mkdir(directoryUrl, { recursive: true });
    await fs.access(directoryUrl);
    return true;
  } catch {
    return false;
  }
}
