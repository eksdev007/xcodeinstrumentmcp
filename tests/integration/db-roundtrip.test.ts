import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { openDatabase } from '../../src/infrastructure/sqlite/database.js';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations.js';

describe('database roundtrip', () => {
  test('loads migrations independently of the current working directory', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xim-db-')), 'cache.db');
    const originalCwd = process.cwd();
    const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-cwd-'));

    try {
      process.chdir(unrelatedCwd);

      const db = openDatabase(databasePath);
      runMigrations(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snapshots'")
        .all() as Array<{ name: string }>;

      expect(tables).toEqual([{ name: 'snapshots' }]);
      db.close();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('loads migrations when executed from the bundled dist layout', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xim-db-')), 'cache.db');
    const originalCwd = process.cwd();
    const fakeDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-dist-'));
    const nestedDistDir = path.join(fakeDistDir, 'dist');
    fs.mkdirSync(nestedDistDir);

    try {
      process.chdir(nestedDistDir);

      const db = openDatabase(databasePath);
      runMigrations(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snapshots'")
        .all() as Array<{ name: string }>;

      expect(tables).toEqual([{ name: 'snapshots' }]);
      db.close();
    } finally {
      process.chdir(originalCwd);
    }
  });
});
