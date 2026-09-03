import { createId } from './id';
import { getDb, type DB } from './client';
import type { Relationship } from '../types';

const SELECT = `
  SELECT r.id, r.projectId, r.fromEntityId, r.toEntityId, r.type, r.strength, r.chapterAnchorId, r.note,
    ef.name AS fromName, et.name AS toName
  FROM relationship r
  JOIN entity ef ON ef.id = r.fromEntityId
  JOIN entity et ON et.id = r.toEntityId
`;

export function listRelationships(projectId: string, db: DB = getDb()): Relationship[] {
  return db.prepare(`${SELECT} WHERE r.projectId = ? ORDER BY r.type, ef.name, et.name`).all(projectId) as unknown as Relationship[];
}

export function getRelationship(id: string, db: DB = getDb()): Relationship | null {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
  return (row as unknown as Relationship | undefined) ?? null;
}

export function createRelationship(
  input: { projectId: string; fromEntityId: string; toEntityId: string; type: string; strength: number; chapterAnchorId?: string | null; note?: string },
  db: DB = getDb(),
): Relationship {
  if (input.fromEntityId === input.toEntityId) throw new Error('不能与自身建立关系');
  const id = createId();
  db.prepare(`INSERT INTO relationship (id, projectId, fromEntityId, toEntityId, type, strength, chapterAnchorId, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.fromEntityId, input.toEntityId, input.type, input.strength, input.chapterAnchorId ?? null, input.note ?? '');
  return getRelationship(id, db)!;
}

export function updateRelationship(
  id: string,
  patch: { type?: string; strength?: number; chapterAnchorId?: string | null; note?: string },
  db: DB = getDb(),
): Relationship | null {
  const current = getRelationship(id, db);
  if (!current) return null;
  db.prepare('UPDATE relationship SET type = ?, strength = ?, chapterAnchorId = ?, note = ? WHERE id = ?')
    .run(patch.type ?? current.type, patch.strength ?? current.strength, patch.chapterAnchorId ?? current.chapterAnchorId, patch.note ?? current.note, id);
  return getRelationship(id, db)!;
}

export function deleteRelationship(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM relationship WHERE id = ?').run(id).changes > 0;
}
