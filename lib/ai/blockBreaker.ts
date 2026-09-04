import type { ChatMessage } from './provider';

export const BREAK_CATEGORIES = ['外部灾变', '认知反转', '底牌失效'] as const;

export interface BlockIdea {
  category: string;
  title: string;
  idea: string;
}

export function buildIdeasMessages(before: string, after: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是网文破局策划。请基于当前困局分别从三个方向给出一个非常规变数：${BREAK_CATEGORIES.join('、')}。
只输出 JSON 数组，元素 {"category":"方向","title":"变数名","idea":"一句话变数设计"}，共 3 个，category 取自三个方向。`,
    },
    { role: 'user', content: `当前断点前文：\n${before.slice(-1500)}\n\n后续衔接：\n${after.slice(0, 300)}` },
  ];
}

export function parseBlockIdeas(text: string): BlockIdea[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { ideas?: unknown }).ideas) ? (parsed as { ideas: unknown[] }).ideas : [];
    return list
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .filter((x) => BREAK_CATEGORIES.includes(String(x.category ?? '') as (typeof BREAK_CATEGORIES)[number]))
      .map((x) => ({
        category: String(x.category),
        title: String(x.title ?? '变数'),
        idea: String(x.idea ?? ''),
      }));
  } catch {
    return [];
  }
}

export function mockBlockIdeas(): BlockIdea[] {
  return [
    { category: '外部灾变', title: '暴雨倒灌', idea: '山洪或天象突变冲散对峙双方，把主角推向失控战场。' },
    { category: '认知反转', title: '情报造假', idea: '原本笃定的“追兵”其实是另一方假扮，来意完全相反。' },
    { category: '底牌失效', title: '反制先手', idea: '主角惯用的解法被对手精准预判，首次失效逼出真本事。' },
  ];
}

export function buildContinueMessages(before: string, after: string, category: string, idea: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是资深网文作者。请把给定变故自然融入续写：变数方向「${category}」，变数设计「${idea}」。只输出正文续写 150~300 字，不要解释。`,
    },
    { role: 'user', content: `断点前文：\n${before.slice(-1500)}\n\n续写：\n${after.slice(0, 300)}` },
  ];
}
