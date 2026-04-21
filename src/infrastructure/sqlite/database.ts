import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';

import { defaultCachePath } from '../../shared/version.js';

export function openDatabase(databasePath = defaultCachePath): Database.Database {
  const resolvedPath = process.env.XIM_DB_PATH || databasePath;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  return db;
}
