import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createEntity, addTimelineEntry } from '../db/entities';
import { buildConsistencyMessages, parseConflicts, runRuleChecks } from './consistency';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('runRuleChecks', () => {
  it('检测死者复生', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '林砚', fields: { 状态: '死亡' } }, db);
    const issue = runRuleChecks({ projectId: p.id, content: '林砚按住刀柄站了起来。', db });
    expect(issue).toHaveLength(1);
    expect(issue[0].source).toBe('rule');
    expect(runRuleChecks({ projectId: p.id, content: '林砚被复活后按住刀柄。', db })).toHaveLength(0);
    expect(runRuleChecks({ projectId: p.id, content: '林砚按住刀柄复活。', db })).toHaveLength(0);
  });

  it('时间线最新状态覆盖初始字段', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '苏晚', fields: { 状态: '死亡' } }, db);
    addTimelineEntry(e.id, { change: { 状态: '存活' }, note: '假死归来' }, db);
    expect(runRuleChecks({ projectId: p.id, content: '苏晚微微一笑。', db })).toHaveLength(0);
  });
});

describe('LLM 审查解析', () => {
  it('解析纯 JSON 与带围栏的 JSON', () => {
    const payload = JSON.stringify([{ type: '设定冲突', text: '境界不符', reason: '上章为筑基', suggestion: '改为炼气' }]);
    expect(parseConflicts(payload)).toHaveLength(1);
    expect(parseConflicts('```json\n' + payload + '\n```')[0].source).toBe('llm');
    expect(parseConflicts('不是 JSON')).toHaveLength(0);
  });

  it('构建审查消息包含原文与要求', () => {
    const msgs = buildConsistencyMessages({ volumeTitle: '卷一', chapterTitle: '第一章', outline: '', entities: [], history: [] }, '待检正文');
    expect(msgs[0].content).toContain('第一章');
    expect(msgs[1].content).toContain('待检正文');
    expect(msgs[1].content).toContain('JSON');
  });
});
