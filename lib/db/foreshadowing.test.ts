import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter } from './chapters';
import { createForeshadowing, isOverdue, listForeshadowing, updateForeshadowing } from './foreshadowing';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('foreshadowing repo', () => {
  it('创建并携带章节标题与关联实体往返', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const f = createForeshadowing({ projectId: p.id, title: '祖传玉佩', status: 'planting', plantChapterId: c.id, simmerRangeStart: 5, simmerRangeEnd: 10, relatedEntityIds: ['e1', 'e2'], note: '暗藏血脉线索' }, db);
    expect(f.plantChapterTitle).toBe('第一章');
    expect(f.relatedEntityIds).toEqual(['e1', 'e2']);
    expect(listForeshadowing(p.id, db)).toHaveLength(1);
  });

  it('超期判定与回收', () => {
    const p = createProject({ title: '书' }, db);
    const f = createForeshadowing({ projectId: p.id, title: '旧案', status: 'simmering', simmerRangeEnd: 3 }, db);
    expect(isOverdue(f, 10)).toBe(true);
    expect(isOverdue(f, 2)).toBe(false);
    const done = updateForeshadowing(f.id, { status: 'payoff' }, db);
    expect(isOverdue(done!, 10)).toBe(false);
  });
});
