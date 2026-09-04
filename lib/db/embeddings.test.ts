import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, deleteChapter } from './chapters';
import { getEmbedding, listVectorsByProject, upsertEmbedding } from './embeddings';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('embeddings repo', () => {
  it('upsert 覆盖与读取', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    upsertEmbedding(c.id, [1, 2, 3], 'mock', db);
    expect(getEmbedding(c.id, db)?.vector).toEqual([1, 2, 3]);
    upsertEmbedding(c.id, [4], 'mock', db);
    expect(getEmbedding(c.id, db)?.vector).toEqual([4]);
  });

  it('按项目列出且章节删除级联', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    upsertEmbedding(c.id, [9], 'mock', db);
    expect(listVectorsByProject(p.id, db)).toHaveLength(1);
    deleteChapter(c.id, db);
    expect(listVectorsByProject(p.id, db)).toHaveLength(0);
  });
});
