import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, deleteChapter } from './chapters';
import { createScene, deleteScene, getScene, listScenes, updateScene } from './scenes';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('scenes repo', () => {
  it('创建时自动排序并列出', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const s1 = createScene(c.id, { title: '雨夜追兵', goal: '暴露敌意' }, db);
    const s2 = createScene(c.id, { title: '客栈对峙', goal: '揭晓身份', points: '苏晚在场' }, db);
    expect(s1.order).toBe(0);
    expect(s2.order).toBe(1);
    expect(listScenes(c.id, db).map((s) => s.title)).toEqual(['雨夜追兵', '客栈对峙']);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const s = createScene(c.id, { title: '开场' }, db);
    const updated = updateScene(s.id, { goal: '让主角登场', status: 'done' }, db);
    expect(updated?.goal).toBe('让主角登场');
    expect(updated?.status).toBe('done');
    expect(deleteScene(s.id, db)).toBe(true);
  });

  it('章节删除级联清理场景卡', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    createScene(c.id, { title: '开场' }, db);
    deleteChapter(c.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM scene').get()).toEqual({ n: 0 });
  });
});
