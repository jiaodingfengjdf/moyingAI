import type { ChatMessage } from './provider';

export const POISON_TYPES = ['无逻辑圣母', '战力无端贬值', '憋屈不反击', '核心配角突兀背刺', '无脑降智'] as const;

export function buildPoisonMessages(title: string, content: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是网文毒点审查编辑。对照类型清单审查本章是否出现毒点：${POISON_TYPES.join('、')}。
只输出 JSON 数组，元素 {"type":"毒点类型","text":"涉及文本","reason":"为什么是毒点","suggestion":"修改建议"}，type 必须取自清单。无毒点输出 []。`,
    },
    { role: 'user', content: `审查本章：${title}\n\n正文：\n${content.slice(-3000)}` },
  ];
}

export function mockPoisonIssues() {
  return [
    { type: '憋屈不反击', text: '主角被反复羞辱却无反应', reason: '连续多章无反抗出口，读者积压情绪（模拟输出）', suggestion: '安排一次小规模反击或心理转折点', source: 'llm' },
    { type: '无脑降智', text: '反派主动交代全部计划', reason: '信息单方面倾倒削弱张力（模拟输出）', suggestion: '改为只透露一两个线索，其余留白', source: 'llm' },
  ];
}
