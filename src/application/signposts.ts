import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import { createRepositories } from './db.js';
import { openDatabase } from '../infrastructure/sqlite/database.js';
import { runMigrations } from '../infrastructure/sqlite/migrations.js';
import { runSwiftHelperApply, runSwiftHelperInventory } from '../infrastructure/swifthelper.js';
import { isoNow } from '../shared/clock.js';
import { stableId } from '../shared/ids.js';

type SignpostCandidate = {
  declarationId: string;
  filePath: string;
  line: number;
  column: number;
  confidence: 'high' | 'medium' | 'low';
  signpostName: string;
  rationale: string;
  symbolEvidence: string;
};

type StoredPlan = {
  planId: string;
  projectId: string;
  sourceSnapshotId: string | null;
  strategy: string;
  candidates: SignpostCandidate[];
  createdAt: string;
};

export async function scanSwiftProject(projectRoot: string): Promise<{
  projectRoot: string;
  files: string[];
  declarations: Array<{
    id: string;
    filePath: string;
    line: number;
    column: number;
    kind: string;
    signpostName: string;
    baseName: string;
    containerName: string | null;
  }>;
}> {
  const inventory = await runSwiftHelperInventory({ projectRoot });
  return {
    projectRoot,
    files: inventory.files,
    declarations: inventory.declarations,
  };
}

export async function createSignpostPlan(input: {
  projectRoot: string;
  sourceSnapshotId?: string;
  strategy: 'top-hot-functions' | 'top-app-functions' | 'explicit-symbols' | 'file-scope';
  explicitSymbols?: string[];
  maxInsertions?: number;
  maxFilesTouched?: number;
}): Promise<StoredPlan> {
  const inventory = await scanSwiftProject(input.projectRoot);
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const snapshot = input.sourceSnapshotId ? repositories.snapshots.getSnapshot(input.sourceSnapshotId) : null;
  const projectId = stableId('sgproj', input.projectRoot);
  const createdAt = isoNow();

  db.prepare(`INSERT OR REPLACE INTO signpost_projects (project_id, root_path, fingerprint, created_at) VALUES (?, ?, ?, ?)`).run(
    projectId,
    input.projectRoot,
    stableId('sgfp', ...inventory.files),
    createdAt,
  );

  const symbols =
    input.strategy === 'explicit-symbols'
      ? input.explicitSymbols ?? []
      : input.strategy === 'file-scope'
        ? inventory.declarations.map((declaration) => declaration.signpostName)
        : symbolsFromSnapshot(snapshot?.summary).slice(0, input.maxInsertions ?? 10);

  const candidates = matchCandidates({
    symbols,
    declarations: inventory.declarations,
    maxInsertions: input.maxInsertions ?? 10,
    maxFilesTouched: input.maxFilesTouched ?? 8,
  });

  const planId = stableId('plan', projectId, input.sourceSnapshotId ?? 'none', input.strategy, JSON.stringify(candidates));
  const plan: StoredPlan = {
    planId,
    projectId,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
    strategy: input.strategy,
    candidates,
    createdAt,
  };

  db.prepare(`INSERT OR REPLACE INTO signpost_plans (plan_id, project_id, source_snapshot_id, plan_json, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    planId,
    projectId,
    input.sourceSnapshotId ?? '',
    JSON.stringify(plan),
    createdAt,
  );
  db.close();
  return plan;
}

export async function applySignpostPlan(input: {
  planId: string;
  subsystem?: string;
  category?: string;
  allowLowConfidence?: boolean;
  bestEffort?: boolean;
}): Promise<{
  patchId: string;
  appliedFiles: string[];
  skippedCandidates: string[];
}> {
  const db = openDatabase();
  runMigrations(db);
  const row = db.prepare(`SELECT patch_json, plan_json FROM signpost_patches JOIN signpost_plans USING (plan_id) WHERE signpost_plans.plan_id = ?`).get(input.planId) as
    | { patch_json?: string; plan_json: string }
    | undefined;
  const directPlan = row?.plan_json
    ? (JSON.parse(row.plan_json) as StoredPlan)
    : ((db.prepare(`SELECT plan_json FROM signpost_plans WHERE plan_id = ?`).get(input.planId) as { plan_json: string } | undefined)?.plan_json
        ? JSON.parse((db.prepare(`SELECT plan_json FROM signpost_plans WHERE plan_id = ?`).get(input.planId) as { plan_json: string }).plan_json)
        : null);
  if (!directPlan) {
    db.close();
    throw new Error(`Plan "${input.planId}" was not found.`);
  }

  const grouped = new Map<string, SignpostCandidate[]>();
  const skippedCandidates: string[] = [];
  for (const candidate of directPlan.candidates) {
    if (candidate.confidence === 'low' && !input.allowLowConfidence) {
      skippedCandidates.push(candidate.declarationId);
      continue;
    }
    const existing = grouped.get(candidate.filePath) ?? [];
    existing.push(candidate);
    grouped.set(candidate.filePath, existing);
  }

  const patchFiles: Array<{
    filePath: string;
    originalHash: string;
    modifiedHash: string;
    originalText: string;
    modifiedText: string;
    candidateIds: string[];
  }> = [];

  for (const [filePath, candidates] of grouped) {
    const originalText = await fs.readFile(filePath, 'utf8');
    const response = await runSwiftHelperApply({
      filePath,
      subsystem: input.subsystem ?? 'xcodeinstrumentmcp',
      category: input.category ?? 'Performance',
      targets: candidates.map((candidate) => ({
        declarationId: candidate.declarationId,
        signpostName: candidate.signpostName,
      })),
    });

    if (response.diagnostics.length > 0 && !input.bestEffort) {
      db.close();
      throw new Error(`Swift helper validation failed for ${filePath}: ${response.diagnostics.join('; ')}`);
    }

    await fs.writeFile(filePath, response.modifiedSource, 'utf8');
    patchFiles.push({
      filePath,
      originalHash: sha256(originalText),
      modifiedHash: sha256(response.modifiedSource),
      originalText,
      modifiedText: response.modifiedSource,
      candidateIds: response.appliedDeclarationIds,
    });
  }

  const patchId = stableId('patch', input.planId, JSON.stringify(patchFiles.map((file) => file.filePath)));
  db.prepare(`INSERT OR REPLACE INTO signpost_patches (patch_id, plan_id, status, patch_json, applied_at, reverted_at) VALUES (?, ?, ?, ?, ?, NULL)`).run(
    patchId,
    input.planId,
    'applied',
    JSON.stringify({
      patchId,
      planId: input.planId,
      files: patchFiles,
    }),
    isoNow(),
  );
  db.close();
  return {
    patchId,
    appliedFiles: patchFiles.map((file) => file.filePath),
    skippedCandidates,
  };
}

export async function revertSignpostPatch(patchId: string): Promise<{ patchId: string; revertedFiles: string[] }> {
  const db = openDatabase();
  runMigrations(db);
  const row = db.prepare(`SELECT patch_json, status FROM signpost_patches WHERE patch_id = ?`).get(patchId) as
    | { patch_json: string; status: string }
    | undefined;
  if (!row) {
    db.close();
    throw new Error(`Patch "${patchId}" was not found.`);
  }
  const patch = JSON.parse(row.patch_json) as {
    files: Array<{ filePath: string; originalHash: string; modifiedHash: string; originalText: string }>;
  };
  const revertedFiles: string[] = [];
  for (const file of patch.files) {
    const currentText = await fs.readFile(file.filePath, 'utf8');
    if (sha256(currentText) !== file.modifiedHash) {
      db.close();
      throw new Error(`Cannot revert ${file.filePath}: file contents changed after apply.`);
    }
    await fs.writeFile(file.filePath, file.originalText, 'utf8');
    revertedFiles.push(file.filePath);
  }
  db.prepare(`UPDATE signpost_patches SET status = ?, reverted_at = ? WHERE patch_id = ?`).run('reverted', isoNow(), patchId);
  db.close();
  return { patchId, revertedFiles };
}

export function signpostStatus(projectRoot: string): {
  projectRoot: string;
  plans: Array<{ planId: string; createdAt: string; sourceSnapshotId: string | null }>;
  patches: Array<{ patchId: string; status: string; appliedAt: string | null; revertedAt: string | null }>;
} {
  const db = openDatabase();
  runMigrations(db);
  const projectId = stableId('sgproj', projectRoot);
  const plans = db
    .prepare(`SELECT plan_id, created_at, source_snapshot_id FROM signpost_plans WHERE project_id = ? ORDER BY created_at DESC`)
    .all(projectId)
    .map((row) => {
      const typed = row as { plan_id: string; created_at: string; source_snapshot_id: string };
      return {
        planId: typed.plan_id,
        createdAt: typed.created_at,
        sourceSnapshotId: typed.source_snapshot_id || null,
      };
    });
  const patches = db
    .prepare(`SELECT patch_id, status, applied_at, reverted_at FROM signpost_patches WHERE plan_id IN (SELECT plan_id FROM signpost_plans WHERE project_id = ?) ORDER BY applied_at DESC`)
    .all(projectId)
    .map((row) => {
      const typed = row as { patch_id: string; status: string; applied_at: string | null; reverted_at: string | null };
      return {
        patchId: typed.patch_id,
        status: typed.status,
        appliedAt: typed.applied_at,
        revertedAt: typed.reverted_at,
      };
    });
  db.close();
  return { projectRoot, plans, patches };
}

function matchCandidates(input: {
  symbols: string[];
  declarations: Array<{
    id: string;
    filePath: string;
    line: number;
    column: number;
    signpostName: string;
    baseName: string;
    containerName: string | null;
  }>;
  maxInsertions: number;
  maxFilesTouched: number;
}): SignpostCandidate[] {
  const results: SignpostCandidate[] = [];
  const touchedFiles = new Set<string>();

  for (const symbol of input.symbols) {
    const normalized = normalizeSymbol(symbol);
    const exact = input.declarations.find((declaration) => declaration.signpostName === normalized.full);
    const byBase = input.declarations.filter((declaration) => declaration.baseName === normalized.baseName);
    const chosen =
      exact ??
      (byBase.length === 1 ? byBase[0] : byBase.find((declaration) => declaration.containerName === normalized.containerName)) ??
      null;
    if (!chosen) {
      continue;
    }
    if (!touchedFiles.has(chosen.filePath) && touchedFiles.size >= input.maxFilesTouched) {
      continue;
    }
    touchedFiles.add(chosen.filePath);
    results.push({
      declarationId: chosen.id,
      filePath: chosen.filePath,
      line: chosen.line,
      column: chosen.column,
      confidence: exact ? 'high' : byBase.length === 1 ? 'medium' : 'low',
      signpostName: chosen.signpostName,
      rationale: exact ? 'Exact signpost-name match from source inventory.' : 'Matched hotspot base name to a unique or likely declaration.',
      symbolEvidence: symbol,
    });
    if (results.length >= input.maxInsertions) {
      break;
    }
  }

  return results;
}

function symbolsFromSnapshot(summary: unknown): string[] {
  if (!summary) {
    return [];
  }
  if (typeof summary === 'object' && summary !== null && 'hotspots' in summary) {
    return ((summary as { hotspots: Array<{ symbol: string; isSystem: boolean }> }).hotspots)
      .filter((hotspot) => !hotspot.isSystem)
      .map((hotspot) => hotspot.symbol);
  }
  if (typeof summary === 'object' && summary !== null && 'metrics' in summary) {
    return (summary as { metrics: Array<{ subject: string }> }).metrics.map((metric) => metric.subject);
  }
  return [];
}

function normalizeSymbol(symbol: string): { full: string; containerName: string | null; baseName: string } {
  const withoutParams = symbol.replace(/\(.*/, '').trim();
  const parts = withoutParams.split(/[.:]/).filter(Boolean);
  return {
    full: withoutParams,
    containerName: parts.length > 1 ? parts.at(-2) ?? null : null,
    baseName: parts.at(-1) ?? withoutParams,
  };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
