import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter } from './chapters';
import {
  addTimelineEntry, createEntity, deleteEntity, getEntity,
  listEntities, listTimeline, updateEntity,
} from './entities';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('entities repo', () => {
  it('创建并往返序列化别名/字段/规则', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({
      projectId: p.id,
      type: 'character',
      name: '林砚',
      aliases: ['小砚', '林兄'],
      fields: { 境界: '炼气三层', 伤势: '轻伤' },
      description: '落魄刀客',
      rules: ['不可复活'],
    }, db);
    expect(e.aliases).toEqual(['小砚', '林兄']);
    expect(e.fields).toEqual({ 境界: '炼气三层', 伤势: '轻伤' });
    const list = listEntities(p.id, db);
    expect(list).toHaveLength(1);
    expect(getEntity(e.id, db)?.name).toBe('林砚');
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'location', name: '青石镇' }, db);
    const updated = updateEntity(e.id, { fields: { 人口: 3000 }, description: '边境小镇' }, db);
    expect(updated?.fields).toEqual({ 人口: 3000 });
    expect(deleteEntity(e.id, db)).toBe(true);
    expect(deleteEntity(e.id, db)).toBe(false);
  });

  it('时间线条目按章节锚点追加，实体删除级联清理', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '林砚' }, db);
    const t1 = addTimelineEntry(e.id, { chapterId: c.id, change: { 境界: '炼气三层' }, note: '入门' }, db);
    const t2 = addTimelineEntry(e.id, { chapterId: c.id, change: { 境界: '筑基' }, note: '突破' }, db);
    expect(t1.change).toEqual({ 境界: '炼气三层' });
    expect(listTimeline(e.id, db).map((t) => t.id)).toEqual([t2.id, t1.id]);
    deleteEntity(e.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM entity_timeline').get()).toEqual({ n: 0 });
  });
});
