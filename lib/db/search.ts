import { getDb, type DB } from './client';

export interface SearchHit {
  id: string;
  title: string;
  volumeTitle: string;
  snippet: string;
}

export function extractKeywords(text: string, max = 6): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  const push = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      results.push(k);
    }
  };
  for (const m of text.matchAll(/[A-Za-z0-9_]{2,}/g)) push(m[0]);
  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) {
      push(run.slice(i, i + 2));
    }
  }
  return results.slice(0, max);
}

export function searchHistory(projectId: string, queryText: string, db: DB = getDb(), limit = 3): SearchHit[] {
  const keywords = extractKeywords(queryText);
  if (keywords.length === 0) return [];
  const clauses = keywords.map(() => 'c.content LIKE ?').join(' OR ');
  const params = keywords.map((k) => `%${k}%`);
  const rows = db.prepare(`
    SELECT c.id, c.title, v.title AS volumeTitle, c.content
    FROM chapter c
    JOIN volume v ON c.volumeId = v.id
    WHERE v.projectId = ? AND (${clauses})
    ORDER BY c.updatedAt DESC LIMIT ?
  `).all(projectId, ...params, limit);
  return (rows as unknown as Array<{ id: string; title: string; volumeTitle: string; content: string }>).map((r) => ({
    id: r.id,
    title: r.title,
    volumeTitle: r.volumeTitle,
    snippet: makeSnippet(r.content, keywords),
  }));
}

function makeSnippet(content: string, keywords: string[]): string {
  const positions = keywords.map((k) => content.indexOf(k)).filter((i) => i >= 0);
  const index = positions.length > 0 ? Math.min(...positions) : 0;
  const start = Math.max(0, index - 10);
  const end = Math.min(content.length, index + 40);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}
