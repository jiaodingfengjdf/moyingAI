import { getDb, type DB } from '../db/client';
import { getSetting } from '../db/settings';
import { listVectorsByProject, upsertEmbedding } from '../db/embeddings';
import { cosine, embed, embeddingEnabled } from './embeddings';

export interface SemanticHit {
  id: string;
  title: string;
  snippet: string;
}

export async function semanticSearch(projectId: string, text: string, limit = 3, db: DB = getDb()): Promise<SemanticHit[]> {
  if (!embeddingEnabled()) return [];
  const vec = await embed(text).catch(() => null);
  if (!vec) return [];
  const scored = listVectorsByProject(projectId, db)
    .map((r) => ({ id: r.chapterId, title: r.title, score: cosine(vec, r.vector), content: r.content }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => ({ id: s.id, title: s.title, snippet: s.content.replace(/\s+/g, ' ').slice(0, 80) + (s.content.length > 80 ? '…' : '') }));
}

export async function ensureChapterEmbedding(chapterId: string, db: DB = getDb()): Promise<void> {
  if (!embeddingEnabled()) return;
  const row = db.prepare('SELECT content FROM chapter WHERE id = ?').get(chapterId) as { content: string } | undefined;
  if (!row || !row.content.trim()) return;
  const vec = await embed(row.content).catch(() => null);
  if (!vec) return;
  upsertEmbedding(chapterId, vec, process.env.INKPULSE_AI_MOCK === '1' ? 'mock' : (getSetting('ai.embedModel') || process.env.INKPULSE_AI_EMBED_MODEL || ''), db);
}
