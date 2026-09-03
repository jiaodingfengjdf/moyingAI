import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume, deleteVolume, getVolume, listVolumes, updateVolume } from './volumes';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('volumes repo', () => {
  it('创建时自动递增排序并列出', () => {
    const p = createProject({ title: '书' }, db);
    const v1 = createVolume(p.id, { title: '卷一' }, db);
    const v2 = createVolume(p.id, { title: '卷二', summary: '本卷大纲' }, db);
    expect(v1.order).toBe(0);
    expect(v2.order).toBe(1);
    expect(v2.summary).toBe('本卷大纲');
    expect(listVolumes(p.id, db).map((v) => v.title)).toEqual(['卷一', '卷二']);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    expect(updateVolume(v.id, { title: '第一卷', summary: '大纲' }, db)?.title).toBe('第一卷');
    expect(getVolume(v.id, db)?.summary).toBe('大纲');
    expect(deleteVolume(v.id, db)).toBe(true);
    expect(deleteVolume(v.id, db)).toBe(false);
  });
});
