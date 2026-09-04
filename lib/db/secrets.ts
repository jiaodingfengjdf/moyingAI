import { createId } from './id';
import { getDb, type DB } from './client';
import type { Secret } from '../types';

const SELECT = 'SELECT "id", projectId, title, detail, knownEntityIds, note, createdAt, updatedAt';

function parse(row: unknown): Secret {
  const r = row as { knownEntityIds: string } & Omit<Secret, 'knownEntityIds'>;
  return { ...r, knownEntityIds: JSON.parse(r.knownEntityIds) as string[] };
}

export function listSecrets(projectId: string, db: DB = getDb()): Secret[] {
  const rows = db.prepare(`${SELECT} FROM "secret" WHERE projectId = ? ORDER BY updatedAt DESC, createdAt DESC`).all(projectId);
  return (rows as unknown[]).map(parse);
}

export function createSecret(
  projectId: string,
  input: { title: string; detail?: string; knownEntityIds?: string[]; note?: string },
  db: DB = getDb(),
): Secret {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO "secret" ("id", projectId, title, detail, knownEntityIds, note, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, input.title, input.detail ?? '', JSON.stringify(input.knownEntityIds ?? []), input.note ?? '', now, now);
  return getSecret(id, db)!;
}

export function getSecret(id: string, db: DB = getDb()): Secret | null {
  const row = db.prepare(`${SELECT} FROM "secret" WHERE "id" = ?`).get(id);
  return row ? parse(row) : null;
}

export function updateSecret(
  id: string,
  patch: { title?: string; detail?: string; knownEntityIds?: string[]; note?: string },
  db: DB = getDb(),
): Secret | null {
  const current = getSecret(id, db);
  if (!current) return null;
  const next = {
    title: typeof patch.title === 'string' ? patch.title : current.title,
    detail: typeof patch.detail === 'string' ? patch.detail : current.detail,
    knownEntityIds: Array.isArray(patch.knownEntityIds) ? patch.knownEntityIds : current.knownEntityIds,
    note: typeof patch.note === 'string' ? patch.note : current.note,
  };
  db.prepare('UPDATE "secret" SET title = ?, detail = ?, knownEntityIds = ?, note = ?, updatedAt = ? WHERE "id" = ?')
    .run(next.title, next.detail, JSON.stringify(next.knownEntityIds), next.note, new Date().toISOString(), id);
  return getSecret(id, db)!;
}

export function deleteSecret(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM "secret" WHERE "id" = ?').run(id).changes > 0;
}
