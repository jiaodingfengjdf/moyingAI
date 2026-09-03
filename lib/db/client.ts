import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';

export type DB = DatabaseSync;

let sharedDb: DB | null = null;

export function resolveDbPath(): string {
  const dir = process.env.INKPULSE_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, 'app.db');
}

export function applyMigrations(db: DB): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = Number(row?.user_version ?? 0);
  for (; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDatabase(dbPath: string = resolveDbPath()): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(db);
  return db;
}

export function getDb(): DB {
  if (!sharedDb) sharedDb = openDatabase();
  return sharedDb;
}
