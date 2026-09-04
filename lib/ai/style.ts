import type { ChatMessage } from './provider';

export type StyleTarget = 'qidian' | 'fanqie' | 'jinjiang' | 'webnovel';

export const STYLE_TARGETS: Record<StyleTarget, { label: string; instruction: string }> = {
  qidian: {
    label: '起点流',
    instruction: '起点风格：强调设定严谨与逻辑推演，信息密度高，允许微幽默；段落完整、用词克制，避免过度网络化口语。',
  },
  fanqie: {
    label: '番茄/新媒体流',
    instruction: '番茄风格：超快节奏、短句断行，情绪强反差，每段收口有力，结尾留钩子；减少长修饰与静态描写。',
  },
  jinjiang: {
    label: '晋江/纯爱流',
    instruction: '晋江风格：强化微表情、细腻心理描写与张力拉扯，重视情感羁绊；句式绵长柔韧，保留留白。',
  },
  webnovel: {
    label: '海外 Webnovel',
    instruction: 'Webnovel 风格：句式直接清楚，动作推进优先；名词符合本地化玄幻/系统流术语（System、Cultivation、Level 等），少用中文典故。',
  },
};

export function buildStyleMessages(target: StyleTarget, text: string): ChatMessage[] {
  const spec = STYLE_TARGETS[target];
  return [
    {
      role: 'system',
      content: `你是资深网文文风迁移编辑。请把给定片段重写为${spec.label}。${spec.instruction}只输出重写后的正文，不要解释。`,
    },
    { role: 'user', content: text.slice(0, 3000) },
  ];
}

const MOCK_TEXT: Record<StyleTarget, string> = {
  qidian: '【起点·模拟】他止步门前，心中已推演过三种脱身的可能。',
  fanqie: '【番茄·模拟】他停下。门内，脚步声也停了。',
  jinjiang: '【晋江·模拟】他顿了顿，指尖抚过门框，像在等一个注定不会到来的答案。',
  webnovel: '【Webnovel·Sim】He stopped at the door, and the footsteps behind it stopped too.',
};

export function mockStyleText(target: StyleTarget): string {
  return MOCK_TEXT[target];
}
