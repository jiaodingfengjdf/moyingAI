import { getDb, type DB } from './client';
import type { BookArc, ProjectOutline } from '../types';

const SELECT = 'projectId, synopsis, theme, arcs, updatedAt';

function parse(row: Record<string, unknown>): ProjectOutline {
  return {
    projectId: String(row.projectId),
    synopsis: String(row.synopsis ?? ''),
    theme: String(row.theme ?? ''),
    arcs: JSON.parse(String(row.arcs ?? '[]')) as BookArc[],
    updatedAt: String(row.updatedAt),
  };
}

export function ensureProjectOutline(projectId: string, db: DB = getDb()): ProjectOutline {
  const row = db.prepare(`SELECT ${SELECT} FROM project_outline WHERE projectId = ?`).get(projectId) as Record<string, unknown> | undefined;
  if (row) return parse(row);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO project_outline (projectId, synopsis, theme, arcs, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, '', '', '[]', now);
  return { projectId, synopsis: '', theme: '', arcs: [], updatedAt: now };
}

export function getProjectOutline(projectId: string, db: DB = getDb()): ProjectOutline {
  return ensureProjectOutline(projectId, db);
}

export function updateProjectOutline(
  projectId: string,
  patch: { synopsis?: string; theme?: string; arcs?: BookArc[] },
  db: DB = getDb(),
): ProjectOutline {
  const current = ensureProjectOutline(projectId, db);
  const next = {
    synopsis: typeof patch.synopsis === 'string' ? patch.synopsis : current.synopsis,
    theme: typeof patch.theme === 'string' ? patch.theme : current.theme,
    arcs: Array.isArray(patch.arcs) ? patch.arcs : current.arcs,
  };
  const now = new Date().toISOString();
  db.prepare('UPDATE project_outline SET synopsis = ?, theme = ?, arcs = ?, updatedAt = ? WHERE projectId = ?')
    .run(next.synopsis, next.theme, JSON.stringify(next.arcs), now, projectId);
  return getProjectOutline(projectId, db);
}
