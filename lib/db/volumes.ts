import { createId } from './id';
import { getDb, type DB } from './client';
import type { Volume } from '../types';

const SELECT = 'SELECT id, projectId, title, summary, "order", createdAt, updatedAt FROM volume';

export function listVolumes(projectId: string, db: DB = getDb()): Volume[] {
  return db.prepare(`${SELECT} WHERE projectId = ? ORDER BY "order" ASC`).all(projectId) as unknown as Volume[];
}

export function getVolume(id: string, db: DB = getDb()): Volume | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as Volume | undefined) ?? null;
}

export function createVolume(projectId: string, input: { title: string; summary?: string }, db: DB = getDb()): Volume {
  const id = createId();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM volume WHERE projectId = ?').get(projectId) as { next: number };
  db.prepare('INSERT INTO volume (id, projectId, title, summary, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, input.title, input.summary ?? '', Number(row.next), now, now);
  return getVolume(id, db)!;
}

export function updateVolume(id: string, patch: { title?: string; summary?: string }, db: DB = getDb()): Volume | null {
  const current = getVolume(id, db);
  if (!current) return null;
  db.prepare('UPDATE volume SET title = ?, summary = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.summary ?? current.summary, new Date().toISOString(), id);
  return getVolume(id, db)!;
}

export function deleteVolume(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM volume WHERE id = ?').run(id).changes > 0;
}
