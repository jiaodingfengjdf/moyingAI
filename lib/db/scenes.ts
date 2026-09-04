import { createId } from './id';
import { getDb, type DB } from './client';
import type { Scene, SceneStatus } from '../types';

const SELECT = 'SELECT id, chapterId, title, goal, points, status, "order", createdAt, updatedAt FROM scene';

export function listScenes(chapterId: string, db: DB = getDb()): Scene[] {
  return db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY "order" ASC, createdAt ASC`).all(chapterId) as unknown as Scene[];
}

export function getScene(id: string, db: DB = getDb()): Scene | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as Scene | undefined) ?? null;
}

export function createScene(
  chapterId: string,
  input: { title: string; goal?: string; points?: string; status?: SceneStatus },
  db: DB = getDb(),
): Scene {
  const chapter = db.prepare('SELECT id FROM chapter WHERE id = ?').get(chapterId);
  if (!chapter) throw new Error('章节不存在');
  const id = createId();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM scene WHERE chapterId = ?').get(chapterId) as { next: number };
  db.prepare(`INSERT INTO scene (id, chapterId, title, goal, points, status, "order", createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, chapterId, input.title, input.goal ?? '', input.points ?? '', input.status ?? 'draft', Number(row.next), now, now);
  return getScene(id, db)!;
}

export function updateScene(
  id: string,
  patch: { title?: string; goal?: string; points?: string; status?: SceneStatus; order?: number },
  db: DB = getDb(),
): Scene | null {
  const current = getScene(id, db);
  if (!current) return null;
  db.prepare('UPDATE scene SET title = ?, goal = ?, points = ?, status = ?, "order" = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.goal ?? current.goal, patch.points ?? current.points, patch.status ?? current.status,
      patch.order ?? current.order, new Date().toISOString(), id);
  return getScene(id, db)!;
}

export function deleteScene(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM scene WHERE id = ?').run(id).changes > 0;
}
