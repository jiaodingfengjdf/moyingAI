import type { ChatMessage } from './provider';

export interface Branch {
  title: string;
  immediate: string;
  mid: string;
  risk: string;
  probability: string;
  hook: string;
}

export function buildMcMessages(contextText: string, decision: string, count: number): ChatMessage[] {
  return [
    {
      role: 'system',
      content: '你是剧情推演沙盒。请就一个决策点给出多个互斥的未来分支，每个分支评估即时后果、中期走向、风险与相对成功概率，并给一句话钩子。只输出 JSON 数组，元素 {"title":"分支名","immediate":"即时后果","mid":"中期走向","risk":"风险","probability":"如 60%","hook":"钩子"}。',
    },
    { role: 'user', content: `剧情上下文：\n${contextText.slice(0, 1500)}\n\n决策点：${decision}\n\n请给出 ${count} 个分支。` },
  ];
}

export function parseBranches(text: string): Branch[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { branches?: unknown }).branches) ? (parsed as { branches: unknown[] }).branches : [];
    return list
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => ({
        title: String(b.title ?? '未命名分支'),
        immediate: String(b.immediate ?? ''),
        mid: String(b.mid ?? ''),
        risk: String(b.risk ?? ''),
        probability: String(b.probability ?? ''),
        hook: String(b.hook ?? ''),
      }));
  } catch {
    return [];
  }
}

export function mockBranches(): Branch[] {
  return [
    { title: '正面强攻', immediate: '当场反杀头目，暴露行踪。', mid: '被更大势力盯上，获得通缉与声望。', risk: '中高', probability: '55%', hook: '巷口的刀光引来了真正的猎物。' },
    { title: '虚晃撤离', immediate: '诈败脱身，保住性命与信物。', mid: '暗中布局，等对手内讧时收网。', risk: '中', probability: '40%', hook: '你以为他逃了，其实他绕到了你身后。' },
    { title: '借刀杀人', immediate: '把追兵引向第三方势力，隔岸观火。', mid: '两方火并，主角坐收渔利。', risk: '高（不可控）', probability: '30%', hook: '火起的那一刻，棋局才真正开始。' },
    { title: '亮底牌谈判', immediate: '抛出信物内容换一条生路。', mid: '与对手达成脆弱同盟，真相半真半假。', risk: '低', probability: '65%', hook: '信任是最好的毒药。' },
    { title: '牺牲引子', immediate: '舍弃一件旧物/一名同伴引开追兵。', mid: '背负愧疚，代价在后续爆发。', risk: '情感高', probability: '45%', hook: '有些债，注定要用命来还。' },
  ];
}
