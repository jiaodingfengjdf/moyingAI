import { createId } from './id';
import { getDb, type DB } from './client';
import { countWords } from '../wordCount';
import type { ChapterStatus, ChapterWithVolume } from '../types';

const SELECT = `
  SELECT c.id, c.volumeId, c.title, c.content, c.outline, c.status, c.wordCount, c."order", c.createdAt, c.updatedAt,
    v.title AS volumeTitle, v.projectId
  FROM chapter c JOIN volume v ON c.volumeId = v.id
`;

export function listChaptersByProject(projectId: string, db: DB = getDb()): ChapterWithVolume[] {
  return db.prepare(`${SELECT} WHERE v.projectId = ? ORDER BY v."order" ASC, c."order" ASC`).all(projectId) as unknown as ChapterWithVolume[];
}

export function getChapter(id: string, db: DB = getDb()): ChapterWithVolume | null {
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  return (row as unknown as ChapterWithVolume | undefined) ?? null;
}

export function createChapter(
  volumeId: string,
  input: { title: string; content?: string; outline?: string },
  db: DB = getDb(),
) {
  const id = createId();
  const now = new Date().toISOString();
  const content = input.content ?? '';
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM chapter WHERE volumeId = ?').get(volumeId) as { next: number };
  db.prepare(`INSERT INTO chapter (id, volumeId, title, content, outline, status, wordCount, "order", createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, volumeId, input.title, content, input.outline ?? '', 'draft', countWords(content), Number(row.next), now, now);
  return getChapter(id, db)!;
}

export function updateChapter(
  id: string,
  patch: { title?: string; content?: string; outline?: string; status?: ChapterStatus },
  db: DB = getDb(),
): ChapterWithVolume | null {
  const current = getChapter(id, db);
  if (!current) return null;
  const content = patch.content ?? current.content;
  db.prepare('UPDATE chapter SET title = ?, content = ?, outline = ?, status = ?, wordCount = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, content, patch.outline ?? current.outline, patch.status ?? current.status, countWords(content), new Date().toISOString(), id);
  return getChapter(id, db)!;
}

export function deleteChapter(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM chapter WHERE id = ?').run(id).changes > 0;
}
