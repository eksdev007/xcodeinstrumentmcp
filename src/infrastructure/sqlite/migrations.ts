import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';

const migrationsPath = resolveMigrationsPath(path.dirname(fileURLToPath(import.meta.url)));

export function runMigrations(db: Database.Database): void {
  const migrationFiles = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8');
    db.exec(sql);
  }
}

function resolveMigrationsPath(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    const candidate = path.join(currentDir, 'migrations');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate migrations directory from "${startDir}".`);
    }
    currentDir = parentDir;
  }
}
