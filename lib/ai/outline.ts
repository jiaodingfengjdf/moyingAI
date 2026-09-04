import type { Beat, SkeletonPayload } from '../beats/templates';
import type { ChatMessage } from './provider';

export type OutlineLevel = 'chapter' | 'volume';

export interface GenerateResult {
  kind: OutlineLevel;
  payload: SkeletonPayload | { chapterOutline: string; beats: Beat[] };
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
}

export function parseSkeletonPayload(text: string): SkeletonPayload {
  try {
    const parsed = JSON.parse(stripFences(text)) as { volumeOutline?: unknown; chapters?: unknown };
    const chapters = Array.isArray(parsed.chapters)
      ? parsed.chapters
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map((c) => ({
            title: String(c.title ?? '未命名章节'),
            outline: String(c.outline ?? ''),
            beats: Array.isArray(c.beats)
              ? c.beats
                  .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
                  .map((b) => ({ title: String(b.title ?? ''), goal: String(b.goal ?? ''), points: b.points ? String(b.points) : '' }))
              : [],
          }))
      : [];
    return { volumeOutline: typeof parsed.volumeOutline === 'string' ? parsed.volumeOutline : '', chapters };
  } catch {
    return { volumeOutline: '', chapters: [] };
  }
}

export function parseBeats(text: string): Beat[] {
  try {
    const parsed = JSON.parse(stripFences(text)) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { beats?: unknown }).beats) ? (parsed as { beats: unknown[] }).beats : [];
    return list
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => ({
        title: String(b.title ?? ''),
        goal: String(b.goal ?? ''),
        points: b.points ? String(b.points) : '',
      }));
  } catch {
    return [];
  }
}

const GENERATE_SYSTEM = [
  '你是资深网文大纲架构师，负责按爆款叙事力学生成结构骨架。',
  '只输出 JSON，不要输出任何其他文字。',
].join('\n');

export function buildGenerateMessages(level: OutlineLevel, prompt: string): ChatMessage[] {
  const shape = level === 'volume'
    ? '{"volumeOutline":"本卷主线概述","chapters":[{"title":"章节名","outline":"本章大纲","beats":[{"title":"场景名","goal":"场景目标","points":"要点(可选)"}]}]}，共 3~6 章，每章 2~4 个场景。'
    : '{"chapterOutline":"本章大纲","beats":[{"title":"场景名","goal":"场景目标","points":"要点(可选)"}]}，共 3~5 个场景。';
  return [
    { role: 'system', content: GENERATE_SYSTEM },
    { role: 'user', content: `请为以下需求生成 ${level === 'volume' ? '卷级骨架' : '章节级骨架'}，只输出 JSON，不要解释。输出格式：${shape}\n\n需求：${prompt.slice(0, 800)}` },
  ];
}

export function mockGenerate(level: OutlineLevel): GenerateResult {
  if (level === 'chapter') {
    return {
      kind: 'chapter',
      payload: {
        chapterOutline: '模拟章大纲：主角被迫面对两难选择。',
        beats: [
          { title: '压力逼近', goal: '外部威胁迫近，主角时间所剩无几。' },
          { title: '内部动摇', goal: '同伴质疑或内心挣扎。' },
          { title: '做出抉择', goal: '主角下决心，代价明确。' },
          { title: '行动钩子', goal: '第一步行动并抛出新变数。' },
        ],
      },
    };
  }
  return {
    kind: 'volume',
    payload: {
      volumeOutline: '模拟卷大纲：主角在小城站稳脚跟后卷入宗门考核。',
      chapters: [
        { title: '宗门考核', outline: '考核规则公布，主角被迫参赛。', beats: [{ title: '报名风波', goal: '被轻视的报名场面。' }, { title: '规则漏洞', goal: '发现可利用的规则。' }] },
        { title: '初赛立威', outline: '初赛碾压对手，引出更强对手。', beats: [{ title: '首轮获胜', goal: '展现实力。' }, { title: '种子选手', goal: '下一轮对手登场。' }] },
        { title: '决赛反转', outline: '决赛揭晓幕后黑手。', beats: [{ title: '绝境', goal: '陷入陷阱。' }, { title: '反转取胜', goal: '揭底并获胜。' }] },
      ],
    },
  };
}

export function buildOutlineCheckMessages(input: { volumeOutline?: string; chapterOutline?: string; scenes?: Beat[] }): ChatMessage[] {
  const lines = [
    input.volumeOutline ? `卷大纲：\n${input.volumeOutline}` : '',
    input.chapterOutline ? `章大纲：\n${input.chapterOutline}` : '',
    input.scenes?.length ? `场景卡：\n${input.scenes.map((s) => `- ${s.title}：${s.goal}`).join('\n')}` : '',
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: [
        '你是资深网文大纲评审。请检查结构逻辑：因果前置是否充分、是否有机械降神（Deus ex Machina）、节拍之间是否断裂。',
        '只输出 JSON 数组，元素形如 {"type":"因果前置不足|疑似机械降神|节拍断裂","text":"涉及内容","reason":"问题说明","suggestion":"修改建议"}。',
        '无问题输出 []。',
      ].join('\n'),
    },
    { role: 'user', content: lines.join('\n\n').slice(0, 3000) },
  ];
}
