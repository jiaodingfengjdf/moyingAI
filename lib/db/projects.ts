import { createId } from './id';
import { getDb, type DB } from './client';
import type { Project, ProjectWithCounts } from '../types';

const BASE = 'id, title, penName, description, createdAt, updatedAt';

export function listProjects(db: DB = getDb()): ProjectWithCounts[] {
  const rows = db.prepare(`
    SELECT p.id, p.title, p.penName, p.description, p.createdAt, p.updatedAt,
      (SELECT COUNT(*) FROM volume v WHERE v.projectId = p.id) AS volumeCount,
      (SELECT COUNT(*) FROM chapter c JOIN volume v ON c.volumeId = v.id WHERE v.projectId = p.id) AS chapterCount
    FROM project p ORDER BY p.updatedAt DESC
  `).all();
  return rows as unknown as ProjectWithCounts[];
}

export function getProject(id: string, db: DB = getDb()): Project | null {
  const row = db.prepare(`SELECT ${BASE} FROM project WHERE id = ?`).get(id);
  return (row as unknown as Project | undefined) ?? null;
}

export function createProject(
  input: { title: string; penName?: string; description?: string },
  db: DB = getDb(),
): Project {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO project (id, title, penName, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, input.title, input.penName ?? '', input.description ?? '', now, now);
  return getProject(id, db)!;
}

export function updateProject(
  id: string,
  patch: { title?: string; penName?: string; description?: string },
  db: DB = getDb(),
): Project | null {
  const current = getProject(id, db);
  if (!current) return null;
  db.prepare('UPDATE project SET title = ?, penName = ?, description = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.penName ?? current.penName, patch.description ?? current.description, new Date().toISOString(), id);
  return getProject(id, db)!;
}

export function deleteProject(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM project WHERE id = ?').run(id).changes > 0;
}
