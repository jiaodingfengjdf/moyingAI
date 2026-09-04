import type { Beat, SkeletonPayload } from '../beats/templates';
import type { ChatMessage } from './provider';
import type { ConsistencyIssue } from '../types';

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

export interface OutlineCheckInput {
  bookOutline?: string;
  volumeOutline?: string;
  chapterOutline?: string;
  scenes?: Beat[];
}

export function buildOutlineCheckMessages(input: OutlineCheckInput): ChatMessage[] {
  const lines = [
    input.bookOutline ? `全书总纲：\n${input.bookOutline}` : '',
    input.volumeOutline ? `卷大纲：\n${input.volumeOutline}` : '',
    input.chapterOutline ? `章大纲：\n${input.chapterOutline}` : '',
    input.scenes?.length ? `场景卡：\n${input.scenes.map((s) => `- ${s.title}：${s.goal}`).join('\n')}` : '',
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: [
        '你是资深网文大纲评审，检查对象可包含全书总纲、卷大纲、章大纲与场景卡。',
        '请检查以下逻辑维度：',
        '1. 因果链：关键事件是否缺乏前置伏笔/理由（因果前置不足）；是否靠机械降神解决（疑似机械降神）。',
        '2. 节拍衔接：场景/章节之间是否有情绪断裂、跳跃或重复拖沓（节拍断裂）。',
        '3. 目标聚焦：场景是否服务本章/本卷目标，是否主线失焦或支线喧宾夺主（主线失焦）。',
        '4. 动机可信：关键角色的行动是否有动机支撑，是否无故降智或转变（动机不足）。',
        '5. 悬念管理：是否该埋钩子的位置没有钩子，或悬念长期不回收（悬念缺失）。',
        '6. 进度配比：高潮/爽点/反转的铺垫与爆发比例是否失衡，是否头重脚轻（进度失衡）。',
        '只输出 JSON 数组，type 只能是：因果前置不足|疑似机械降神|节拍断裂|主线失焦|动机不足|悬念缺失|进度失衡。元素形如 {"type":"…","text":"涉及内容","reason":"问题说明","suggestion":"修改建议"}。',
        '无问题输出 []。',
      ].join('\n'),
    },
    { role: 'user', content: lines.join('\n\n').slice(0, 3000) },
  ];
}

export function runOutlineRuleChecks(input: OutlineCheckInput): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const scenes = input.scenes ?? [];
  const titleCount = new Map<string, number>();
  for (const scene of scenes) {
    const title = scene.title.trim();
    if (!title) continue;
    titleCount.set(title, (titleCount.get(title) ?? 0) + 1);
  }
  for (const [title, count] of titleCount) {
    if (count < 2) continue;
    issues.push({
      type: '节拍断裂',
      text: `重复场景「${title}」× ${count}`,
      reason: '多个场景卡标题重复，容易造成节拍原地打转或主线失焦',
      suggestion: '合并或拆分重复场景，让每张卡承担不同的推进目标',
      source: 'rule',
    });
  }
  const goalless = scenes.filter((s) => !s.goal.trim());
  if (goalless.length > 0) {
    issues.push({
      type: '主线失焦',
      text: goalless.map((s) => s.title || '（未命名场景）').join('、'),
      reason: '这些场景卡没有写明目标，无法判断其是否服务于主线',
      suggestion: '为每个场景补充一个可验证的推进目标',
      source: 'rule',
    });
  }
  if (input.chapterOutline && scenes.length === 0) {
    issues.push({
      type: '节拍断裂',
      text: '章大纲已写但没有场景卡',
      reason: '预演无法检查大纲内部的节拍衔接',
      suggestion: '先用模板/AI 生成场景卡，再做逻辑预演',
      source: 'rule',
    });
  }
  if (input.bookOutline && input.bookOutline.trim().length < 20) {
    issues.push({
      type: '悬念缺失',
      text: '全书总纲过于简略',
      reason: '总纲缺少明确的主线收束与悬念落点，卷/章容易各写各的',
      suggestion: '补写全书目标、核心冲突与最终悬念，再逐卷拆解',
      source: 'rule',
    });
  }
  return issues;
}
