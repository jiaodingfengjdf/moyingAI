import { createId } from './id';
import { getDb, type DB } from './client';
import type { Entity, EntityTimelineEntry, EntityType } from '../types';

const SELECT = 'SELECT id, projectId, type, name, aliases, fields, description, rules, createdAt, updatedAt FROM entity';

function rowToEntity(row: unknown): Entity {
  const r = row as { aliases: string; fields: string; rules: string } & Omit<Entity, 'aliases' | 'fields' | 'rules'>;
  return {
    ...r,
    aliases: JSON.parse(r.aliases) as string[],
    fields: JSON.parse(r.fields) as Record<string, unknown>,
    rules: JSON.parse(r.rules) as string[],
  };
}

export function listEntities(projectId: string, db: DB = getDb()): Entity[] {
  const rows = db.prepare(`${SELECT} WHERE projectId = ? ORDER BY type, name`).all(projectId);
  return (rows as unknown[]).map(rowToEntity);
}

export function getEntity(id: string, db: DB = getDb()): Entity | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return row ? rowToEntity(row) : null;
}

export function createEntity(
  input: {
    projectId: string; type: EntityType; name: string; aliases?: string[];
    fields?: Record<string, unknown>; description?: string; rules?: string[];
  },
  db: DB = getDb(),
): Entity {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO entity (id, projectId, type, name, aliases, fields, description, rules, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.type, input.name,
      JSON.stringify(input.aliases ?? []), JSON.stringify(input.fields ?? {}),
      input.description ?? '', JSON.stringify(input.rules ?? []), now, now);
  return getEntity(id, db)!;
}

export function updateEntity(
  id: string,
  patch: { type?: EntityType; name?: string; aliases?: string[]; fields?: Record<string, unknown>; description?: string; rules?: string[] },
  db: DB = getDb(),
): Entity | null {
  const current = getEntity(id, db);
  if (!current) return null;
  const next = {
    type: patch.type ?? current.type,
    name: patch.name ?? current.name,
    aliases: patch.aliases ?? current.aliases,
    fields: patch.fields ?? current.fields,
    description: patch.description ?? current.description,
    rules: patch.rules ?? current.rules,
  };
  db.prepare('UPDATE entity SET type = ?, name = ?, aliases = ?, fields = ?, description = ?, rules = ?, updatedAt = ? WHERE id = ?')
    .run(next.type, next.name, JSON.stringify(next.aliases), JSON.stringify(next.fields), next.description, JSON.stringify(next.rules), new Date().toISOString(), id);
  return getEntity(id, db)!;
}

export function deleteEntity(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM entity WHERE id = ?').run(id).changes > 0;
}

export function listTimeline(entityId: string, db: DB = getDb()): EntityTimelineEntry[] {
  const rows = db.prepare('SELECT id, entityId, chapterId, change, note, createdAt FROM entity_timeline WHERE entityId = ? ORDER BY createdAt DESC').all(entityId);
  return (rows as unknown as Array<{ change: string } & Omit<EntityTimelineEntry, 'change'>>).map((r) => ({
    ...r,
    change: JSON.parse(r.change) as Record<string, unknown>,
  }));
}

export function addTimelineEntry(
  entityId: string,
  input: { chapterId?: string | null; change?: Record<string, unknown>; note?: string },
  db: DB = getDb(),
): EntityTimelineEntry {
  if (!getEntity(entityId, db)) throw new Error('实体不存在');
  const id = createId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO entity_timeline (id, entityId, chapterId, change, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, entityId, input.chapterId ?? null, JSON.stringify(input.change ?? {}), input.note ?? '', now);
  const row = db.prepare('SELECT id, entityId, chapterId, change, note, createdAt FROM entity_timeline WHERE id = ?').get(id) as { change: string } & Omit<EntityTimelineEntry, 'change'>;
  return { ...row, change: JSON.parse(row.change) as Record<string, unknown> };
}
