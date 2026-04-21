import { execa } from 'execa';

export async function resolveXctrace(): Promise<string | null> {
  try {
    const result = await execa('xcrun', ['--find', 'xctrace']);
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function runXctrace(args: string[]): Promise<string> {
  const xctracePath = await resolveXctrace();

  if (xctracePath === null) {
    throw new Error('xctrace could not be resolved. Run `xcodeinstrumentmcp doctor` for remediation details.');
  }

  const result = await execa(xctracePath, args);
  return result.stdout;
}
