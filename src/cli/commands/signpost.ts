import process from 'node:process';

import {
  applySignpostPlan,
  createSignpostPlan,
  revertSignpostPatch,
  scanSwiftProject,
  signpostStatus,
} from '../../application/signposts.js';

type ScanOptions = {
  projectRoot?: string;
};

type PlanOptions = {
  projectRoot?: string;
  snapshot?: string;
  strategy?: 'top-hot-functions' | 'top-app-functions' | 'explicit-symbols' | 'file-scope';
  symbol?: string[];
  maxInsertions?: number;
  maxFilesTouched?: number;
};

type ApplyOptions = {
  plan?: string;
  subsystem?: string;
  category?: string;
  allowLowConfidence?: boolean;
  bestEffort?: boolean;
};

type RevertOptions = {
  patch?: string;
};

type StatusOptions = {
  projectRoot?: string;
};

export async function executeSignpostScanCommand(options: ScanOptions): Promise<void> {
  if (!options.projectRoot) {
    throw new Error('signpost scan requires --project-root <path>.');
  }
  const result = await scanSwiftProject(options.projectRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function executeSignpostPlanCommand(options: PlanOptions): Promise<void> {
  if (!options.projectRoot) {
    throw new Error('signpost plan requires --project-root <path>.');
  }
  if (!options.strategy) {
    throw new Error('signpost plan requires --strategy <top-hot-functions|top-app-functions|explicit-symbols|file-scope>.');
  }
  const result = await createSignpostPlan({
    projectRoot: options.projectRoot,
    sourceSnapshotId: options.snapshot,
    strategy: options.strategy,
    explicitSymbols: options.symbol,
    maxInsertions: options.maxInsertions,
    maxFilesTouched: options.maxFilesTouched,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function executeSignpostApplyCommand(options: ApplyOptions): Promise<void> {
  if (!options.plan) {
    throw new Error('signpost apply requires --plan <id>.');
  }
  const result = await applySignpostPlan({
    planId: options.plan,
    subsystem: options.subsystem,
    category: options.category,
    allowLowConfidence: options.allowLowConfidence,
    bestEffort: options.bestEffort,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function executeSignpostRevertCommand(options: RevertOptions): Promise<void> {
  if (!options.patch) {
    throw new Error('signpost revert requires --patch <id>.');
  }
  const result = await revertSignpostPatch(options.patch);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function executeSignpostStatusCommand(options: StatusOptions): Promise<void> {
  if (!options.projectRoot) {
    throw new Error('signpost status requires --project-root <path>.');
  }
  const result = signpostStatus(options.projectRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
