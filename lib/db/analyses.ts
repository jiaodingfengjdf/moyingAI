import { getDb, type DB } from './client';

export interface ChapterAnalysis {
  chapterId: string;
  buildUp: number;
  anticipation: number;
  release: number;
  driver: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function upsertAnalysis(input: Omit<ChapterAnalysis, 'createdAt' | 'updatedAt'>, db: DB = getDb()): ChapterAnalysis {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chapter_analysis (chapterId, buildUp, anticipation, release, driver, model, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chapterId) DO UPDATE SET buildUp = excluded.buildUp, anticipation = excluded.anticipation,
      release = excluded.release, driver = excluded.driver, model = excluded.model, updatedAt = excluded.updatedAt
  `).run(input.chapterId, input.buildUp, input.anticipation, input.release, input.driver, input.model, now, now);
  return getAnalysis(input.chapterId, db)!;
}

export function getAnalysis(chapterId: string, db: DB = getDb()): ChapterAnalysis | null {
  const row = db.prepare('SELECT chapterId, buildUp, anticipation, release, driver, model, createdAt, updatedAt FROM chapter_analysis WHERE chapterId = ?').get(chapterId);
  return (row as unknown as ChapterAnalysis | undefined) ?? null;
}

export function listAnalysesByProject(projectId: string, db: DB = getDb()): (ChapterAnalysis & { title: string; volumeTitle: string })[] {
  return db.prepare(`
    SELECT a.*, c.title, v.title AS volumeTitle
    FROM chapter_analysis a
    JOIN chapter c ON c.id = a.chapterId
    JOIN volume v ON v.id = c.volumeId
    WHERE v.projectId = ?
    ORDER BY v."order" ASC, c."order" ASC
  `).all(projectId) as unknown as (ChapterAnalysis & { title: string; volumeTitle: string })[];
}
