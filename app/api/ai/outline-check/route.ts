import { NextRequest, NextResponse } from 'next/server';
import { getChapter, listChaptersByProject } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';
import { listScenes } from '@/lib/db/scenes';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildOutlineCheckMessages } from '@/lib/ai/outline';
import { parseConflicts } from '@/lib/ai/consistency';
import type { ConsistencyIssue } from '@/lib/types';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';

  let projectId = '';
  let input: { volumeOutline?: string; chapterOutline?: string; scenes?: ReturnType<typeof listScenes> } = {};
  if (chapterId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    projectId = chapter.projectId;
    input = { chapterOutline: chapter.outline, scenes: listScenes(chapterId) };
  } else if (volumeId) {
    const volume = getVolume(volumeId);
    if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
    projectId = volume.projectId;
    const outlines = listChaptersByProject(projectId).filter((c) => c.volumeId === volumeId).map((c) => `[${c.title}] ${c.outline || '（未写大纲）'}`);
    input = { volumeOutline: volume.summary, chapterOutline: outlines.join('\n') };
  } else {
    return NextResponse.json({ error: 'chapterId 或 volumeId 必填' }, { status: 400 });
  }

  let issues: ConsistencyIssue[] = [];
  let aiSkipped: string | null = null;
  let model = 'mock';
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      issues = [
        { type: '疑似机械降神', text: '高潮援军', reason: '援军此前未在卷内登场（模拟输出）', suggestion: '在早前章节埋下其出场的理由', source: 'llm' },
        { type: '因果前置不足', text: '主角反转', reason: '反转依据未前置（模拟输出）', suggestion: '前两章补充线索', source: 'llm' },
      ];
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
      model = config.model;
      const text = await complete({ messages: buildOutlineCheckMessages(input), temperature: 0.2 });
      issues = parseConflicts(text);
    }
    createAIRequest({ projectId, chapterId: chapterId || null, kind: 'outline-check', model, prompt: JSON.stringify(input).slice(0, 300) });
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = '大纲预演失败，请重试';
  }
  return NextResponse.json({ issues, aiSkipped });
}
