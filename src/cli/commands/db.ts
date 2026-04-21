import process from 'node:process';

import { createRepositories } from '../../application/db.js';
import { openDatabase } from '../../infrastructure/sqlite/database.js';
import { runMigrations } from '../../infrastructure/sqlite/migrations.js';

export async function executeDbStatsCommand(): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  process.stdout.write(`${JSON.stringify(repositories.snapshots.stats(), null, 2)}\n`);
  db.close();
}

export async function executeDbListSnapshotsCommand(): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  process.stdout.write(`${JSON.stringify({ snapshots: repositories.snapshots.listSnapshots() }, null, 2)}\n`);
  db.close();
}

export async function executeDbShowSnapshotCommand(snapshotId: string): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const snapshot = repositories.snapshots.getSnapshot(snapshotId);
  if (!snapshot) {
    db.close();
    throw new Error(`Snapshot "${snapshotId}" was not found.`);
  }
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  db.close();
}

export async function executeDbShowComparisonCommand(comparisonId: string): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  const repositories = createRepositories(db);
  const comparison = repositories.snapshots.getComparison(comparisonId);
  if (!comparison) {
    db.close();
    throw new Error(`Comparison "${comparisonId}" was not found.`);
  }
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  db.close();
}

export async function executeDbVacuumCommand(): Promise<void> {
  const db = openDatabase();
  runMigrations(db);
  createRepositories(db).snapshots.vacuum();
  process.stdout.write('vacuum complete\n');
  db.close();
}
