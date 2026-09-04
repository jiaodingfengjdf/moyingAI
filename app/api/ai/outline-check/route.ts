import { NextRequest, NextResponse } from 'next/server';
import { getChapter, listChaptersByProject } from '@/lib/db/chapters';
import { getVolume, listVolumes } from '@/lib/db/volumes';
import { listScenes } from '@/lib/db/scenes';
import { getProjectOutline } from '@/lib/db/bookOutline';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildOutlineCheckMessages, runOutlineRuleChecks, type OutlineCheckInput } from '@/lib/ai/outline';
import { parseConflicts } from '@/lib/ai/consistency';
import type { ConsistencyIssue } from '@/lib/types';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

function renderBookOutline(projectId: string): string {
  const outline = getProjectOutline(projectId);
  const parts = [
    outline.synopsis ? `全书主线：${outline.synopsis}` : '',
    outline.theme ? `主题：${outline.theme}` : '',
    outline.arcs.length
      ? '卷弧：\n' + outline.arcs.map((a) => `- ${a.title}：${a.goal}${a.summary ? `（${a.summary}）` : ''}`).join('\n')
      : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  const projectIdOnly = typeof body?.projectId === 'string' ? body.projectId : '';

  let projectId = '';
  let input: OutlineCheckInput = {};
  if (chapterId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    projectId = chapter.projectId;
    input = { bookOutline: renderBookOutline(projectId), chapterOutline: chapter.outline, scenes: listScenes(chapterId) };
  } else if (volumeId) {
    const volume = getVolume(volumeId);
    if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
    projectId = volume.projectId;
    const outlines = listChaptersByProject(projectId).filter((c) => c.volumeId === volumeId).map((c) => `[${c.title}] ${c.outline || '（未写大纲）'}`);
    input = { bookOutline: renderBookOutline(projectId), volumeOutline: volume.summary, chapterOutline: outlines.join('\n') };
  } else if (projectIdOnly) {
    const volumes = listVolumes(projectIdOnly);
    if (volumes.length === 0 && !getProjectOutline(projectIdOnly).synopsis) {
      return NextResponse.json({ error: '请先写全书总纲或创建卷' }, { status: 400 });
    }
    projectId = projectIdOnly;
    input = {
      bookOutline: renderBookOutline(projectId),
      volumeOutline: volumes.map((v) => `[${v.title}] ${v.summary || '（未写卷大纲）'}`).join('\n'),
      chapterOutline: listChaptersByProject(projectId).map((c) => `[${c.title}] ${c.outline || '（未写大纲）'}`).join('\n'),
    };
  } else {
    return NextResponse.json({ error: 'chapterId、volumeId 或 projectId 必填' }, { status: 400 });
  }

  const ruleIssues = runOutlineRuleChecks(input);
  let issues: ConsistencyIssue[] = ruleIssues;
  let aiSkipped: string | null = null;
  let model = 'mock';
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      issues = [...ruleIssues,
        { type: '疑似机械降神', text: '高潮援军', reason: '援军此前未在卷内登场（模拟输出）', suggestion: '在早前章节埋下其出场的理由', source: 'llm' },
        { type: '因果前置不足', text: '主角反转', reason: '反转依据未前置（模拟输出）', suggestion: '前两章补充线索', source: 'llm' },
        { type: '节拍断裂', text: '第二章过渡段', reason: '从日常直接切到大战，缺少情绪过渡（模拟输出）', suggestion: '补一个压力升级的小场景', source: 'llm' },
        { type: '主线失焦', text: '配角支线过长', reason: '配角回忆超过本章主线篇幅（模拟输出）', suggestion: '压缩支线或并入主线目标', source: 'llm' },
      ];
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
      model = config.model;
      const text = await complete({ messages: buildOutlineCheckMessages(input), temperature: 0.2 });
      issues = [...ruleIssues, ...parseConflicts(text)];
    }
    createAIRequest({ projectId, chapterId: chapterId || null, kind: 'outline-check', model, prompt: JSON.stringify(input).slice(0, 300) });
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = '大纲预演失败，请重试';
  }
  return NextResponse.json({ issues, aiSkipped });
}
