import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter } from './chapters';
import { getAnalysis, listAnalysesByProject, upsertAnalysis } from './analyses';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('analyses repo', () => {
  it('upsert 覆盖与读取', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    upsertAnalysis({ chapterId: c.id, buildUp: 3, anticipation: 8, release: 7, driver: 'd1', model: 'mock' }, db);
    expect(getAnalysis(c.id, db)?.release).toBe(7);
    upsertAnalysis({ chapterId: c.id, buildUp: 9, anticipation: 2, release: 1, driver: 'd2', model: 'mock' }, db);
    expect(getAnalysis(c.id, db)?.buildUp).toBe(9);
  });

  it('按项目列出并携带标题', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    upsertAnalysis({ chapterId: c.id, buildUp: 1, anticipation: 2, release: 3, driver: '', model: 'mock' }, db);
    const rows = listAnalysesByProject(p.id, db);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('第一章');
    expect(rows[0].volumeTitle).toBe('卷一');
  });
});
