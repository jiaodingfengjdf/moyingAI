import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, updateChapter } from './chapters';
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshots';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('snapshots repo', () => {
  it('创建快照并递增版本号', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s1 = createSnapshot(c.id, { label: '第一版' }, db);
    expect(s1.version).toBe(1);
    expect(s1.content).toBe('v1');
    updateChapter(c.id, { content: 'v2' }, db);
    const s2 = createSnapshot(c.id, {}, db);
    expect(s2.version).toBe(2);
    expect(s2.content).toBe('v2');
    expect(listSnapshots(c.id, db).map((s) => s.version)).toEqual([2, 1]);
  });

  it('回滚前自动快照当前状态并恢复目标版本', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s1 = createSnapshot(c.id, {}, db);
    updateChapter(c.id, { content: 'v2' }, db);
    const restored = restoreSnapshot(s1.id, db);
    expect(restored?.content).toBe('v1');
    expect(restored?.wordCount).toBe(2);
    const list = listSnapshots(c.id, db);
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('回滚前自动快照');
    expect(list[0].content).toBe('v2');
  });

  it('删除快照', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s = createSnapshot(c.id, {}, db);
    expect(deleteSnapshot(s.id, db)).toBe(true);
    expect(deleteSnapshot(s.id, db)).toBe(false);
  });
});
