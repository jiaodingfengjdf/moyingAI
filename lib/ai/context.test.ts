import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { createEntity } from '../db/entities';
import { assembleContext, buildGhostwriteMessages, buildRewriteMessages, entityMatch } from './context';
import { GHOST_BRANCHES } from './prompts';
import type { Entity } from '../types';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('entityMatch', () => {
  it('命中名字或别名', () => {
    const entities = [
      { name: '林砚', aliases: ['小砚'] },
      { name: '苏晚', aliases: [] },
    ] as unknown as Entity[];
    expect(entityMatch('小砚按住刀柄', entities).map((e) => e.name)).toEqual(['林砚']);
  });
});

describe('assembleContext', () => {
  it('装配 L2/L3/L4 三层', async () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一', summary: '雨夜逃亡' }, db);
    const c = createChapter(v.id, { title: '第一章', outline: '主角突围', content: '林砚在雨夜按住刀柄，指节发白。' }, db);
    createEntity({ projectId: p.id, type: 'character', name: '林砚', description: '落魄刀客', fields: { 境界: '炼气' } }, db);
    const ctx = await assembleContext({ projectId: p.id, chapterId: c.id, before: '林砚在雨夜按住刀柄', after: '' }, db);
    expect(ctx.volumeTitle).toBe('卷一');
    expect(ctx.outline).toBe('主角突围');
    expect(ctx.entities.map((e) => e.name)).toContain('林砚');
    expect(ctx.history.length).toBeGreaterThan(0);
  });

  it('构建伴写与重写消息包含设定与断点', async () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const ctx = await assembleContext({ projectId: p.id, chapterId: c.id, before: '断点前文', after: '后文' }, db);
    const ghost = buildGhostwriteMessages(ctx, GHOST_BRANCHES[0], '断点前文', '后文');
    expect(ghost[0].content).toContain('卷一');
    expect(ghost[1].content).toContain('断点前文');
    expect(ghost[1].content).toContain('⟦光标⟧');
    const rewrite = buildRewriteMessages(ctx, 'pace', '选中片段');
    expect(rewrite[1].content).toContain('选中片段');
    expect(rewrite[1].content).toContain('节奏加速');
  });

  it('通过历史片段召回当前未直接提名的实体', async () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    createChapter(v.id, { title: '第二章', outline: '', content: '林砚带着宗门令牌进入禁地。' }, db);
    const current = createChapter(v.id, { title: '第三章', outline: '', content: '' }, db);
    createEntity({ projectId: p.id, type: 'character', name: '林砚', description: '刀客', fields: {} }, db);
    const ctx = await assembleContext({ projectId: p.id, chapterId: current.id, before: '宗门令牌为何会出现在这里', after: '' }, db);
    expect(ctx.entities.map((e) => e.name)).toContain('林砚');
  });
});
