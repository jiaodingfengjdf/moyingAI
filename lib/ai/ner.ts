import type { ChatMessage } from './provider';
import type { Entity } from '../types';

export interface NerMention {
  name: string;
  change: Record<string, unknown>;
  note: string;
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
}

export function buildNerMessages(content: string, entities: Entity[]): ChatMessage[] {
  const knownNames = entities.map((e) => [e.name, ...e.aliases]).flat().filter(Boolean).join('、');
  return [
    {
      role: 'system',
      content: [
        '你是长篇网文的实体识别与状态抽取器。',
        '从给定正文中识别明确出场并发生可记录状态变化的实体（人物/阵营/地点/功法/道具）。',
        '只输出 JSON 数组，元素形如 {"name":"实体名","change":{"伤势":"轻伤","位置":"城外"},"note":"一句话依据"}。',
        'change 只收录正文明确改变或新增的状态，不要把既有设定重复写入；没有新状态就不要输出该实体。',
        'name 优先使用已知列表中的标准名或别名；正文中的新名字可原样输出，但不得猜测。',
        '无状态变化时输出 []。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `已知实体：${knownNames || '（暂无，可识别新名字）'}\n\n正文：\n\n${content.slice(-2500)}`,
    },
  ];
}

export function parseNerMentions(text: string): NerMention[] {
  try {
    const parsed = JSON.parse(stripFences(text)) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { mentions?: unknown }).mentions) ? (parsed as { mentions: unknown[] }).mentions : [];
    return list
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        name: String(item.name ?? '').trim(),
        change: typeof item.change === 'object' && item.change !== null
          ? Object.fromEntries(Object.entries(item.change as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
          : {},
        note: String(item.note ?? '').trim(),
      }))
      .filter((m) => m.name && Object.keys(m.change).length > 0);
  } catch {
    return [];
  }
}

export function resolveMentionEntity(mentionName: string, entities: Entity[]): Entity | null {
  const normalized = mentionName.trim();
  if (!normalized) return null;
  return entities.find((e) => e.name === normalized || e.aliases.includes(normalized)) ?? null;
}
