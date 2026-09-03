import { createId } from './id';
import { getDb, type DB } from './client';
import type { Foreshadowing, ForeshadowingStatus } from '../types';

const SELECT = `
  SELECT f.*, pc.title AS plantChapterTitle, poc.title AS payoffChapterTitle
  FROM foreshadowing f
  LEFT JOIN chapter pc ON pc.id = f.plantChapterId
  LEFT JOIN chapter poc ON poc.id = f.payoffChapterId
`;

function rowToForeshadowing(row: unknown): Foreshadowing {
  const r = row as { relatedEntityIds: string } & Omit<Foreshadowing, 'relatedEntityIds'>;
  return { ...r, relatedEntityIds: JSON.parse(r.relatedEntityIds) as string[] };
}

export function isOverdue(f: Foreshadowing, totalChapters: number): boolean {
  return f.status !== 'payoff' && typeof f.simmerRangeEnd === 'number' && totalChapters > f.simmerRangeEnd;
}

export function countProjectChapters(projectId: string, db: DB = getDb()): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM chapter c JOIN volume v ON c.volumeId = v.id WHERE v.projectId = ?').get(projectId) as { n: number };
  return Number(row.n);
}

export function listForeshadowing(projectId: string, db: DB = getDb()): Foreshadowing[] {
  const total = countProjectChapters(projectId, db);
  const rows = db.prepare(`${SELECT} WHERE f.projectId = ? ORDER BY f.createdAt DESC, f.rowid DESC`).all(projectId);
  return (rows as unknown[]).map((row) => {
    const f = rowToForeshadowing(row);
    return { ...f, overdue: isOverdue(f, total) };
  });
}

export function getForeshadowing(id: string, db: DB = getDb()): Foreshadowing | null {
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id);
  if (!row) return null;
  const f = rowToForeshadowing(row);
  return { ...f, overdue: isOverdue(f, countProjectChapters(f.projectId, db)) };
}

export function createForeshadowing(
  input: {
    projectId: string; title: string; status?: ForeshadowingStatus; plantChapterId?: string | null;
    simmerRangeStart?: number | null; simmerRangeEnd?: number | null; payoffChapterId?: string | null;
    relatedEntityIds?: string[]; note?: string;
  },
  db: DB = getDb(),
): Foreshadowing {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO foreshadowing (id, projectId, title, status, plantChapterId, simmerRangeStart, simmerRangeEnd, payoffChapterId, relatedEntityIds, note, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.title, input.status ?? 'planting', input.plantChapterId ?? null,
      input.simmerRangeStart ?? null, input.simmerRangeEnd ?? null, input.payoffChapterId ?? null,
      JSON.stringify(input.relatedEntityIds ?? []), input.note ?? '', now, now);
  return getForeshadowing(id, db)!;
}

export function updateForeshadowing(
  id: string,
  patch: {
    title?: string; status?: ForeshadowingStatus; plantChapterId?: string | null;
    simmerRangeStart?: number | null; simmerRangeEnd?: number | null; payoffChapterId?: string | null;
    relatedEntityIds?: string[]; note?: string;
  },
  db: DB = getDb(),
): Foreshadowing | null {
  const current = getForeshadowing(id, db);
  if (!current) return null;
  const next = {
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    plantChapterId: patch.plantChapterId !== undefined ? patch.plantChapterId : current.plantChapterId,
    simmerRangeStart: patch.simmerRangeStart !== undefined ? patch.simmerRangeStart : current.simmerRangeStart,
    simmerRangeEnd: patch.simmerRangeEnd !== undefined ? patch.simmerRangeEnd : current.simmerRangeEnd,
    payoffChapterId: patch.payoffChapterId !== undefined ? patch.payoffChapterId : current.payoffChapterId,
    relatedEntityIds: patch.relatedEntityIds ?? current.relatedEntityIds,
    note: patch.note ?? current.note,
  };
  db.prepare(`UPDATE foreshadowing SET title = ?, status = ?, plantChapterId = ?, simmerRangeStart = ?, simmerRangeEnd = ?, payoffChapterId = ?, relatedEntityIds = ?, note = ?, updatedAt = ? WHERE id = ?`)
    .run(next.title, next.status, next.plantChapterId, next.simmerRangeStart, next.simmerRangeEnd, next.payoffChapterId,
      JSON.stringify(next.relatedEntityIds), next.note, new Date().toISOString(), id);
  return getForeshadowing(id, db)!;
}

export function deleteForeshadowing(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM foreshadowing WHERE id = ?').run(id).changes > 0;
}
