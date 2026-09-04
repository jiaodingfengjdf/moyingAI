import { describe, it, expect } from 'vitest';
import { buildNerMessages, parseNerMentions, resolveMentionEntity } from './ner';
import type { Entity } from '../types';

describe('ner parsing', () => {
  it('解析 JSON 数组并忽略无状态变化的实体', () => {
    const mentions = parseNerMentions(JSON.stringify([
      { name: '林砚', change: { 伤势: '轻伤' }, note: '被剑风扫中' },
      { name: '苏晚', change: {}, note: '仅出场' },
    ]));
    expect(mentions).toHaveLength(1);
    expect(mentions[0].change['伤势']).toBe('轻伤');
  });

  it('接受 mentions 包装与代码围栏', () => {
    const text = '```json\n{"mentions":[{"name":"林砚","change":{"境界":"炼气三层"},"note":""}]}\n```';
    expect(parseNerMentions(text)).toHaveLength(1);
    expect(parseNerMentions('垃圾')).toHaveLength(0);
  });

  it('按标准名/别名解析实体', () => {
    const entity = { name: '林砚', aliases: ['小砚'], type: 'character' } as unknown as Entity;
    expect(resolveMentionEntity('小砚', [entity])?.name).toBe('林砚');
    expect(resolveMentionEntity('路人甲', [entity])).toBeNull();
  });

  it('消息包含已知实体与正文', () => {
    const entity = { name: '林砚', aliases: ['小砚'], type: 'character' } as unknown as Entity;
    const messages = buildNerMessages('林砚受伤了', [entity]);
    expect(messages[0].content).toContain('状态变化');
    expect(messages[1].content).toContain('林砚');
    expect(messages[1].content).toContain('受伤了');
  });
});
