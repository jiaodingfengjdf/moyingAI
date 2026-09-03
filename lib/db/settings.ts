import { getDb, type DB } from './client';

export function getSetting(key: string, db: DB = getDb()): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: DB = getDb()): void {
  db.prepare(`
    INSERT INTO setting (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
