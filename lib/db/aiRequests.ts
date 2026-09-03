import { createId } from './id';
import { getDb, type DB } from './client';
import type { AIRequest } from '../types';

const SELECT = 'SELECT id, projectId, chapterId, kind, model, accepted, createdAt FROM ai_request';

function rowToRequest(row: unknown): AIRequest {
  const r = row as { accepted: number } & Omit<AIRequest, 'accepted'>;
  return { ...r, accepted: r.accepted === 1 };
}

export function createAIRequest(
  input: { projectId: string; chapterId?: string | null; kind: string; model: string; prompt?: string },
  db: DB = getDb(),
): AIRequest {
  const id = createId();
  db.prepare('INSERT INTO ai_request (id, projectId, chapterId, kind, prompt, model, accepted, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(id, input.projectId, input.chapterId ?? null, input.kind, input.prompt ?? '', input.model, new Date().toISOString());
  return rowToRequest(db.prepare(`${SELECT} WHERE id = ?`).get(id));
}

export function markAccepted(id: string, accepted = true, db: DB = getDb()): boolean {
  return db.prepare('UPDATE ai_request SET accepted = ? WHERE id = ?').run(accepted ? 1 : 0, id).changes > 0;
}

export function listByChapter(chapterId: string, db: DB = getDb()): AIRequest[] {
  const rows = db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY createdAt DESC, rowid DESC LIMIT 30`).all(chapterId);
  return (rows as unknown[]).map(rowToRequest);
}
