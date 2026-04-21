import type Database from 'better-sqlite3';

import { SnapshotRepository } from '../infrastructure/sqlite/snapshot-repository.js';

export function createRepositories(db: Database.Database): {
  snapshots: SnapshotRepository;
} {
  return {
    snapshots: new SnapshotRepository(db),
  };
}
