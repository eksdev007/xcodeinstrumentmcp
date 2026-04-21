import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

const PACKAGE_PATH = path.resolve('tools/xim-swiftsignpost');
const HELPER_PATH = path.join(PACKAGE_PATH, '.build', 'release', 'xim-swiftsignpost');

export async function ensureSwiftHelperBuilt(): Promise<string> {
  await execa('swift', ['build', '-c', 'release', '--package-path', PACKAGE_PATH]);
  return HELPER_PATH;
}

export async function runSwiftHelperInventory(input: {
  projectRoot?: string;
  filePath?: string;
}): Promise<{
  files: string[];
  declarations: Array<{
    id: string;
    kind: string;
    filePath: string;
    line: number;
    column: number;
    baseName: string;
    containerName: string | null;
    signpostName: string;
  }>;
}> {
  const helper = await ensureSwiftHelperBuilt();
  const args = ['inventory'];
  if (input.projectRoot) {
    args.push('--project-root', input.projectRoot);
  }
  if (input.filePath) {
    args.push('--file', input.filePath);
  }
  const result = await execa(helper, args);
  return JSON.parse(result.stdout) as {
    files: string[];
    declarations: Array<{
      id: string;
      kind: string;
      filePath: string;
      line: number;
      column: number;
      baseName: string;
      containerName: string | null;
      signpostName: string;
    }>;
  };
}

export async function runSwiftHelperApply(input: {
  filePath: string;
  subsystem: string;
  category: string;
  targets: Array<{ declarationId: string; signpostName: string }>;
}): Promise<{
  modifiedSource: string;
  appliedDeclarationIds: string[];
  skippedDeclarationIds: string[];
  diagnostics: string[];
}> {
  const helper = await ensureSwiftHelperBuilt();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xim-signpost-'));
  const targetsPath = path.join(tempDir, 'targets.json');
  await fs.writeFile(
    targetsPath,
    JSON.stringify({
      subsystem: input.subsystem,
      category: input.category,
      targets: input.targets,
    }),
    'utf8',
  );
  try {
    const result = await execa(helper, ['apply', '--file', input.filePath, '--targets-file', targetsPath]);
    return JSON.parse(result.stdout) as {
      modifiedSource: string;
      appliedDeclarationIds: string[];
      skippedDeclarationIds: string[];
      diagnostics: string[];
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
