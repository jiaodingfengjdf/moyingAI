import { createId } from './id';
import { getDb, type DB } from './client';
import { countWords } from '../wordCount';
import { getChapter } from './chapters';
import type { ChapterSnapshot } from '../types';

const SELECT = 'SELECT id, chapterId, version, content, label, branchId, createdAt FROM chapter_snapshot';

export function listSnapshots(chapterId: string, db: DB = getDb()): ChapterSnapshot[] {
  return db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY version DESC`).all(chapterId) as unknown as ChapterSnapshot[];
}

export function getSnapshot(id: string, db: DB = getDb()): ChapterSnapshot | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as ChapterSnapshot | undefined) ?? null;
}

export function createSnapshot(chapterId: string, input: { label?: string; branchId?: string }, db: DB = getDb()): ChapterSnapshot {
  const chapter = db.prepare('SELECT content FROM chapter WHERE id = ?').get(chapterId) as { content: string } | undefined;
  if (!chapter) throw new Error('章节不存在');
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM chapter_snapshot WHERE chapterId = ?').get(chapterId) as { next: number };
  const id = createId();
  db.prepare('INSERT INTO chapter_snapshot (id, chapterId, version, content, label, branchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, chapterId, Number(row.next), chapter.content, input.label ?? null, input.branchId ?? null, new Date().toISOString());
  return getSnapshot(id, db)!;
}

export function deleteSnapshot(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM chapter_snapshot WHERE id = ?').run(id).changes > 0;
}

export function restoreSnapshot(id: string, db: DB = getDb()) {
  const snap = getSnapshot(id, db);
  if (!snap) throw new Error('快照不存在');
  const chapter = db.prepare('SELECT content FROM chapter WHERE id = ?').get(snap.chapterId) as { content: string } | undefined;
  if (!chapter) throw new Error('章节不存在');
  // 回滚前保存当前状态，防止误操作无法恢复
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM chapter_snapshot WHERE chapterId = ?').get(snap.chapterId) as { next: number };
  db.prepare('INSERT INTO chapter_snapshot (id, chapterId, version, content, label, branchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(createId(), snap.chapterId, Number(row.next), chapter.content, '回滚前自动快照', null, new Date().toISOString());
  db.prepare('UPDATE chapter SET content = ?, wordCount = ?, updatedAt = ? WHERE id = ?')
    .run(snap.content, countWords(snap.content), new Date().toISOString(), snap.chapterId);
  return getChapter(snap.chapterId, db);
}
