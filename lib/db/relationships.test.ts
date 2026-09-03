import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createEntity } from './entities';
import { createRelationship, deleteRelationship, listRelationships, updateRelationship } from './relationships';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('relationships repo', () => {
  it('创建并携带双方实体名列出', () => {
    const p = createProject({ title: '书' }, db);
    const a = createEntity({ projectId: p.id, type: 'character', name: '林砚' }, db);
    const b = createEntity({ projectId: p.id, type: 'character', name: '苏晚' }, db);
    const r = createRelationship({ projectId: p.id, fromEntityId: a.id, toEntityId: b.id, type: '恋人', strength: 80, note: '互生好感' }, db);
    expect(r.fromName).toBe('林砚');
    expect(r.toName).toBe('苏晚');
    expect(r.strength).toBe(80);
    expect(listRelationships(p.id, db)).toHaveLength(1);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const a = createEntity({ projectId: p.id, type: 'character', name: '甲' }, db);
    const b = createEntity({ projectId: p.id, type: 'character', name: '乙' }, db);
    const r = createRelationship({ projectId: p.id, fromEntityId: a.id, toEntityId: b.id, type: '宿敌', strength: -60 }, db);
    const updated = updateRelationship(r.id, { strength: -80, note: '仇恨加深' }, db);
    expect(updated?.strength).toBe(-80);
    expect(deleteRelationship(r.id, db)).toBe(true);
  });
});
