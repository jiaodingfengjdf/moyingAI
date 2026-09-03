import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, deleteChapter, getChapter, listChaptersByProject, updateChapter } from './chapters';
import { countWords } from '../wordCount';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('chapters repo', () => {
  it('创建时计算字数、携带卷信息列出', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '第一段\n\n第二段' }, db);
    expect(c.wordCount).toBe(countWords('第一段\n\n第二段'));
    expect(c.status).toBe('draft');
    const list = listChaptersByProject(p.id, db);
    expect(list).toHaveLength(1);
    expect(list[0].projectId).toBe(p.id);
    expect(list[0].volumeTitle).toBe('卷一');
  });

  it('章内排序递增', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c1 = createChapter(v.id, { title: '第一章' }, db);
    const c2 = createChapter(v.id, { title: '第二章' }, db);
    expect(c1.order).toBe(0);
    expect(c2.order).toBe(1);
  });

  it('更新内容重算字数、更新状态', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '旧' }, db);
    const updated = updateChapter(c.id, { content: '新内容', status: 'final' }, db);
    expect(updated?.wordCount).toBe(3);
    expect(updated?.status).toBe('final');
  });

  it('删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    expect(deleteChapter(c.id, db)).toBe(true);
    expect(getChapter(c.id, db)).toBeNull();
  });
});
