import { getDb, type DB } from './client';

export interface ChapterEmbedding {
  chapterId: string;
  vector: number[];
  model: string;
  updatedAt: string;
}

export function upsertEmbedding(chapterId: string, vector: number[], model: string, db: DB = getDb()): void {
  db.prepare(`
    INSERT INTO chapter_embeddings (chapterId, vector, model, updatedAt) VALUES (?, ?, ?, ?)
    ON CONFLICT(chapterId) DO UPDATE SET vector = excluded.vector, model = excluded.model, updatedAt = excluded.updatedAt
  `).run(chapterId, JSON.stringify(vector), model, new Date().toISOString());
}

export function getEmbedding(chapterId: string, db: DB = getDb()): ChapterEmbedding | null {
  const row = db.prepare('SELECT chapterId, vector, model, updatedAt FROM chapter_embeddings WHERE chapterId = ?').get(chapterId) as
    | { chapterId: string; vector: string; model: string; updatedAt: string }
    | undefined;
  return row ? { ...row, vector: JSON.parse(row.vector) as number[] } : null;
}

export function listVectorsByProject(projectId: string, db: DB = getDb()): Array<ChapterEmbedding & { title: string; content: string }> {
  const rows = db.prepare(`
    SELECT e.*, c.title, c.content
    FROM chapter_embeddings e
    JOIN chapter c ON c.id = e.chapterId
    JOIN volume v ON v.id = c.volumeId
    WHERE v.projectId = ?
  `).all(projectId) as unknown as Array<{ chapterId: string; vector: string; model: string; updatedAt: string; title: string; content: string }>;
  return rows.map((r) => ({ ...r, vector: JSON.parse(r.vector) as number[] }));
}
