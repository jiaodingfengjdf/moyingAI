import type { ChatMessage } from './provider';

export const BREAK_CATEGORIES = ['外部灾变', '认知反转', '底牌失效'] as const;

export interface BlockIdea {
  category: string;
  title: string;
  idea: string;
}

const CATEGORY_SYNONYMS: Array<{ category: string; words: string[] }> = [
  { category: '外部灾变', words: ['灾变', '天灾', '外部', '意外', '突袭', '环境', '山洪', '地震', '世界', '大势'] },
  { category: '认知反转', words: ['认知', '反转', '真相', '身份', '谎言', '情报', '视角', '假象', '误会', '揭露', '隐藏'] },
  { category: '底牌失效', words: ['底牌', '失效', '反制', '预判', '克制', '手段', '金手指', '后手', '王牌'] },
];

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
  const stripped = text.trim();
  const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenceMatch?.[1] ?? stripped];
  if (!fenceMatch) {
    const first = stripped.indexOf('[');
    const last = stripped.lastIndexOf(']');
    if (first >= 0 && last > first) candidates.push(stripped.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const rawList = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { ideas?: unknown }).ideas)
          ? (parsed as { ideas: unknown[] }).ideas
          : typeof parsed === 'object' && parsed !== null && !Array.isArray((parsed as { ideas?: unknown }).ideas)
            ? [(parsed as Record<string, unknown>)]
            : [];
      const list = rawList.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
      const ideas = list
        .map((x, i) => ({
          category: normalizeCategory(String(x.category ?? ''), i),
          title: String(x.title ?? '').trim(),
          idea: String(x.idea ?? '').trim(),
        }))
        .filter((x) => x.idea || x.title);
      if (ideas.length > 0) return ideas;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return [];
}

function normalizeCategory(raw: string, index: number): string {
  const category = raw.trim();
  if (BREAK_CATEGORIES.includes(category as (typeof BREAK_CATEGORIES)[number])) return category;
  for (const syn of CATEGORY_SYNONYMS) {
    if (syn.words.some((w) => category.includes(w))) return syn.category;
  }
  return BREAK_CATEGORIES[index % BREAK_CATEGORIES.length];
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
