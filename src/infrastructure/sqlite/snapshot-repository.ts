import fs from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';

import type { GenericComparison, GenericSummary } from '../../domain/analysis.js';
import type { TimeProfilerComparison } from '../../domain/comparison.js';
import type { TimeProfilerSummary } from '../../domain/time-profiler.js';
import { isoNow } from '../../shared/clock.js';
import { stableId, sha256Hex } from '../../shared/ids.js';
import { packageVersion } from '../../shared/version.js';

type PersistSummaryInput = {
  tracePath: string;
  family: string;
  summary: TimeProfilerSummary | GenericSummary;
  schemaVersion: number;
};

type StoredSnapshot = {
  snapshotId: string;
  sourceId: string;
  family: string;
  summary: TimeProfilerSummary | GenericSummary;
};

export class SnapshotRepository {
  constructor(private readonly db: Database.Database) {}

  persistSummary(input: PersistSummaryInput): StoredSnapshot {
    const stat = fs.statSync(input.tracePath);
    const sourceSha256 = hashSourcePath(input.tracePath);
    const sourceId = stableId('src', input.family, sourceSha256, input.tracePath);
    const selection = buildSelectionSummary(input.summary);
    const selectionJson = JSON.stringify(selection);
    const comparabilityJson = JSON.stringify({
      processName: selection.process,
      runNumber: selection.runNumber,
    });
    const snapshotId = stableId(
      'snap',
      sourceSha256,
      input.family,
      String(input.schemaVersion),
      selectionJson,
    );
    const now = isoNow();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO sources (
          source_id, source_kind, instrument_family, source_path, source_sha256, size_bytes, created_at, imported_at, tool_version
        ) VALUES (
          @source_id, @source_kind, @instrument_family, @source_path, @source_sha256, @size_bytes, @created_at, @imported_at, @tool_version
        )`,
      )
      .run({
        source_id: sourceId,
        source_kind: detectSourceKind(input.tracePath),
        instrument_family: input.family,
        source_path: input.tracePath,
        source_sha256: sourceSha256,
        size_bytes: stat.isDirectory() ? directorySizeBytes(input.tracePath) : stat.size,
        created_at: now,
        imported_at: now,
        tool_version: packageVersion,
      });

    this.db
      .prepare(
        `INSERT OR REPLACE INTO snapshots (
          snapshot_id, source_id, family, schema_version, selection_json, comparability_json, snapshot_json, created_at
        ) VALUES (
          @snapshot_id, @source_id, @family, @schema_version, @selection_json, @comparability_json, @snapshot_json, @created_at
        )`,
      )
      .run({
        snapshot_id: snapshotId,
        source_id: sourceId,
        family: input.family,
        schema_version: input.schemaVersion,
        selection_json: selectionJson,
        comparability_json: comparabilityJson,
        snapshot_json: JSON.stringify(input.summary),
        created_at: now,
      });

    this.db.prepare('DELETE FROM metrics WHERE snapshot_id = ?').run(snapshotId);
    this.db.prepare('DELETE FROM findings WHERE snapshot_id = ?').run(snapshotId);

    const metricInsert = this.db.prepare(
      `INSERT INTO metrics (
        metric_id, snapshot_id, family, metric_type, subject_type, subject_key, module, thread_key, interval_key, numeric_value, unit, rank, dimensions_json
      ) VALUES (
        @metric_id, @snapshot_id, @family, @metric_type, @subject_type, @subject_key, @module, @thread_key, @interval_key, @numeric_value, @unit, @rank, @dimensions_json
      )`,
    );

    if ('hotspots' in input.summary) {
      for (const hotspot of input.summary.hotspots) {
        metricInsert.run({
          metric_id: stableId('metric', snapshotId, hotspot.frameKey, 'hotspot_total_pct'),
          snapshot_id: snapshotId,
          family: input.family,
          metric_type: 'hotspot_total_pct',
          subject_type: 'frame',
          subject_key: hotspot.frameKey,
          module: hotspot.module,
          thread_key: hotspot.dominantThreads[0]?.thread ?? null,
          interval_key: null,
          numeric_value: hotspot.totalPct,
          unit: 'pct',
          rank: hotspot.rank,
          dimensions_json: JSON.stringify({ symbol: hotspot.symbol, selfPct: hotspot.selfPct }),
        });
      }
    } else {
      input.summary.metrics.forEach((metric, index) => {
        metricInsert.run({
          metric_id: stableId('metric', snapshotId, metric.name, metric.subject),
          snapshot_id: snapshotId,
          family: input.family,
          metric_type: metric.name,
          subject_type: 'summary',
          subject_key: metric.subject,
          module: null,
          thread_key: null,
          interval_key: null,
          numeric_value: metric.value,
          unit: metric.unit,
          rank: index + 1,
          dimensions_json: JSON.stringify({}),
        });
      });
    }

    const findingInsert = this.db.prepare(
      `INSERT INTO findings (
        finding_id, snapshot_id, family, severity, kind, title, summary, confidence, recommendations_json, tags_json
      ) VALUES (
        @finding_id, @snapshot_id, @family, @severity, @kind, @title, @summary, @confidence, @recommendations_json, @tags_json
      )`,
    );

    for (const finding of input.summary.findings) {
      findingInsert.run({
        finding_id: stableId('finding', snapshotId, finding.kind, finding.title),
        snapshot_id: snapshotId,
        family: input.family,
        severity: 'severity' in finding ? finding.severity : 'info',
        kind: finding.kind,
        title: finding.title,
        summary: finding.summary,
        confidence: numericConfidence(finding),
        recommendations_json: JSON.stringify([]),
        tags_json: JSON.stringify([]),
      });
    }

    return {
      snapshotId,
      sourceId,
      family: input.family,
      summary: input.summary,
    };
  }

  getSnapshot(snapshotId: string): StoredSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT snapshots.snapshot_id, snapshots.source_id, snapshots.family, snapshots.snapshot_json
         FROM snapshots
         WHERE snapshots.snapshot_id = ?`,
      )
      .get(snapshotId) as
      | {
          snapshot_id: string;
          source_id: string;
          family: string;
          snapshot_json: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      snapshotId: row.snapshot_id,
      sourceId: row.source_id,
      family: row.family,
      summary: JSON.parse(row.snapshot_json) as TimeProfilerSummary | GenericSummary,
    };
  }

  listSnapshots(): Array<{
    snapshotId: string;
    family: string;
    createdAt: string;
    sourcePath: string;
    processName: string;
  }> {
    return this.db
      .prepare(
        `SELECT snapshots.snapshot_id, snapshots.family, snapshots.created_at, sources.source_path, snapshots.selection_json
         FROM snapshots
         JOIN sources ON sources.source_id = snapshots.source_id
         ORDER BY snapshots.created_at DESC`,
      )
      .all()
      .map((row) => {
        const typed = row as {
          snapshot_id: string;
          family: string;
          created_at: string;
          source_path: string;
          selection_json: string;
        };
        const selection = JSON.parse(typed.selection_json) as { process: string };
        return {
          snapshotId: typed.snapshot_id,
          family: typed.family,
          createdAt: typed.created_at,
          sourcePath: typed.source_path,
          processName: selection.process,
        };
      });
  }

  stats(): {
    sources: number;
    snapshots: number;
    metrics: number;
    findings: number;
    promptPacks: number;
  } {
    const count = (table: string) =>
      Number(
        (
          this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {
            count: number;
          }
        ).count,
      );

    return {
      sources: count('sources'),
      snapshots: count('snapshots'),
      metrics: count('metrics'),
      findings: count('findings'),
      promptPacks: count('prompt_packs'),
    };
  }

  persistPromptPack(input: {
    snapshotId: string | null;
    comparisonId: string | null;
    family: string;
    purpose: string;
    promptText: string;
  }): { promptPackId: string } {
    const promptPackId = stableId(
      'prompt',
      input.snapshotId ?? 'none',
      input.comparisonId ?? 'none',
      input.family,
      input.purpose,
      input.promptText,
    );

    this.db
      .prepare(
        `INSERT OR REPLACE INTO prompt_packs (
          prompt_pack_id, snapshot_id, comparison_id, family, purpose, prompt_text, token_estimate, created_at
        ) VALUES (
          @prompt_pack_id, @snapshot_id, @comparison_id, @family, @purpose, @prompt_text, @token_estimate, @created_at
        )`,
      )
      .run({
        prompt_pack_id: promptPackId,
        snapshot_id: input.snapshotId,
        comparison_id: input.comparisonId,
        family: input.family,
        purpose: input.purpose,
        prompt_text: input.promptText,
        token_estimate: Math.ceil(input.promptText.length / 4),
        created_at: isoNow(),
      });

    return { promptPackId };
  }

  persistComparison(input: {
    baselineSnapshotId: string | null;
    candidateSnapshotId: string | null;
    family: string;
    comparison: TimeProfilerComparison | GenericComparison;
  }): { comparisonId: string } {
    const baselinePath =
      'baseline' in input.comparison ? input.comparison.baseline.metadata.tracePath : input.comparison.baselineSummary.metadata.sourcePath;
    const candidatePath =
      'candidate' in input.comparison ? input.comparison.candidate.metadata.tracePath : input.comparison.candidateSummary.metadata.sourcePath;
    const regressions =
      'deltaTotalPct' in (input.comparison.regressions[0] ?? {})
        ? input.comparison.regressions.map((value) => ('frameKey' in value ? value.frameKey : value.subject))
        : input.comparison.regressions.map((value) => ('subject' in value ? value.subject : 'unknown'));
    const improvements =
      'deltaTotalPct' in (input.comparison.improvements[0] ?? {})
        ? input.comparison.improvements.map((value) => ('frameKey' in value ? value.frameKey : value.subject))
        : input.comparison.improvements.map((value) => ('subject' in value ? value.subject : 'unknown'));
    const comparisonId = stableId(
      'cmp',
      input.baselineSnapshotId ?? baselinePath,
      input.candidateSnapshotId ?? candidatePath,
      JSON.stringify(regressions),
      JSON.stringify(improvements),
    );

    this.db
      .prepare(
        `INSERT OR REPLACE INTO comparisons (
          comparison_id, baseline_snapshot_id, candidate_snapshot_id, family, comparable, compatibility_notes_json, comparison_json, created_at
        ) VALUES (
          @comparison_id, @baseline_snapshot_id, @candidate_snapshot_id, @family, @comparable, @compatibility_notes_json, @comparison_json, @created_at
        )`,
      )
      .run({
        comparison_id: comparisonId,
        baseline_snapshot_id: input.baselineSnapshotId ?? '',
        candidate_snapshot_id: input.candidateSnapshotId ?? '',
        family: input.family,
        comparable: 'comparable' in input.comparison ? Number(input.comparison.comparable) : 1,
        compatibility_notes_json: JSON.stringify(
          'comparabilityNotes' in input.comparison ? input.comparison.comparabilityNotes : input.comparison.compatibilityNotes,
        ),
        comparison_json: JSON.stringify(input.comparison),
        created_at: isoNow(),
      });

    return { comparisonId };
  }

  getComparison(comparisonId: string): TimeProfilerComparison | GenericComparison | null {
    const row = this.db
      .prepare(`SELECT comparison_json FROM comparisons WHERE comparison_id = ?`)
      .get(comparisonId) as { comparison_json: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.comparison_json) as TimeProfilerComparison | GenericComparison;
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }
}

function buildSelectionSummary(summary: TimeProfilerSummary | GenericSummary): { process: string; runNumber: number | null } {
  if ('processSelection' in summary) {
    return {
      process: summary.processSelection.name,
      runNumber: summary.metadata.runNumber,
    };
  }

  return {
    process: summary.metadata.processName ?? summary.family,
    runNumber: summary.metadata.runNumber,
  };
}

function detectSourceKind(sourcePath: string): string {
  if (sourcePath.endsWith('.har')) {
    return 'har';
  }
  if (sourcePath.endsWith('.memgraph')) {
    return 'memgraph';
  }
  if (sourcePath.endsWith('.xml')) {
    return 'xml';
  }
  return 'trace';
}

function numericConfidence(finding: { confidence?: unknown }): number {
  if (typeof finding.confidence === 'number') {
    return finding.confidence;
  }

  switch (finding.confidence) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.7;
    case 'low':
      return 0.4;
    default:
      return 0.8;
  }
}

function hashSourcePath(sourcePath: string): string {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    const parts = walkDirectory(sourcePath).map((entryPath) => {
      const relativePath = path.relative(sourcePath, entryPath);
      const entryStat = fs.statSync(entryPath);
      if (entryStat.isDirectory()) {
        return `dir:${relativePath}`;
      }
      return `file:${relativePath}:${sha256Hex(fs.readFileSync(entryPath))}`;
    });
    return sha256Hex(parts.join('\n'));
  }
  return sha256Hex(fs.readFileSync(sourcePath));
}

function walkDirectory(rootPath: string): string[] {
  const entries: string[] = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = path.join(rootPath, entry.name);
    entries.push(fullPath);
    if (entry.isDirectory()) {
      entries.push(...walkDirectory(fullPath));
    }
  }
  return entries.sort();
}

function directorySizeBytes(rootPath: string): number {
  return walkDirectory(rootPath).reduce((sum, entryPath) => {
    const stat = fs.statSync(entryPath);
    return stat.isFile() ? sum + stat.size : sum;
  }, 0);
}
