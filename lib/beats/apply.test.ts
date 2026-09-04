import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { listScenes } from '../db/scenes';
import { insertBeats, insertSkeleton } from './apply';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('insertSkeleton', () => {
  it('批量建章与场景卡并回填卷大纲', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const result = insertSkeleton(p.id, v.id, {
      volumeOutline: '新卷大纲',
      chapters: [
        { title: '章一', outline: '大纲一', beats: [{ title: '场景1', goal: '目标1' }] },
        { title: '章二', outline: '大纲二', beats: [
          { title: '场景2', goal: '目标2' },
          { title: '场景3', goal: '目标3', points: '要点' },
        ] },
      ],
    }, db);
    expect(result).toEqual({ chapterCount: 2, sceneCount: 3 });
    expect(db.prepare('SELECT summary FROM volume WHERE id = ?').get(v.id)).toEqual({ summary: '新卷大纲' });
  });

  it('校验卷归属并抛出错误', () => {
    const p1 = createProject({ title: '甲' }, db);
    const p2 = createProject({ title: '乙' }, db);
    const v = createVolume(p1.id, { title: '卷一' }, db);
    expect(() => insertSkeleton(p2.id, v.id, { volumeOutline: '', chapters: [] }, db)).toThrow();
  });
});

describe('insertBeats', () => {
  it('为章节批量生成场景卡', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const count = insertBeats(c.id, [
      { title: 'A', goal: 'g1' },
      { title: 'B', goal: 'g2', points: 'p2' },
    ], db);
    expect(count).toBe(2);
    expect(listScenes(c.id, db).map((s) => s.title)).toEqual(['A', 'B']);
  });
});
