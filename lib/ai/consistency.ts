import { listEntities, listTimeline } from '../db/entities';
import type { DB } from '../db/client';
import type { ConsistencyIssue, Entity, EntityTimelineEntry } from '../types';
import { renderContextBlock, type AssembledContext } from './context';
import { SYSTEM_PROMPT } from './prompts';
import type { ChatMessage } from './provider';

const DEAD_VALUES = ['死亡', '已死', '阵亡', '身亡', '战死'];
const REVIVE_HINTS = ['复活', '重生', '诈死', '未死', '假死'];

export function latestStatus(entity: Entity, timeline: EntityTimelineEntry[]): Record<string, unknown> {
  return { ...entity.fields, ...(timeline[0]?.change ?? {}) };
}

export function runRuleChecks(opts: { projectId: string; content: string; db?: DB }): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  for (const entity of listEntities(opts.projectId, opts.db)) {
    const names = [entity.name, ...entity.aliases];
    if (!names.some((n) => n && opts.content.includes(n))) continue;
    const timeline = listTimeline(entity.id, opts.db);
    const status = latestStatus(entity, timeline);
    const dead = Object.entries(status).some(([key, value]) => /状态|生死|存活/.test(key) && DEAD_VALUES.includes(String(value).trim()));
    if (dead && !REVIVE_HINTS.some((h) => opts.content.includes(h))) {
      issues.push({
        type: '疑似死者复生',
        text: entity.name,
        reason: `设定卡或时间线中「${entity.name}」处于死亡状态，但正文中再次出场`,
        suggestion: '请补上复活/重生依据，或先更新其时间线状态再让其出场',
        source: 'rule',
      });
    }
  }
  return issues;
}

const CONSISTENCY_INSTRUCTION = [
  '请对照世界观设定卡与本章新增正文，做一致性审查。',
  '只输出 JSON 数组，不要输出任何其他文字。每个元素形如：',
  '{"type":"冲突类型","text":"涉及文本","reason":"与哪条设定矛盾","suggestion":"修改建议"}',
  '无冲突时输出 []。',
].join('\n');

export function buildConsistencyMessages(ctx: AssembledContext, content: string): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `${CONSISTENCY_INSTRUCTION}\n\n待审正文：\n\n${content.slice(-2000)}` },
  ];
}

export function parseConflicts(text: string): ConsistencyIssue[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        type: String(item.type ?? '设定冲突'),
        text: String(item.text ?? ''),
        reason: String(item.reason ?? ''),
        suggestion: String(item.suggestion ?? ''),
        source: 'llm' as const,
      }));
  } catch {
    return [];
  }
}
