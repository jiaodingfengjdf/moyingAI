import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildPoisonMessages, mockPoisonIssues } from '@/lib/ai/poison';
import { parseConflicts } from '@/lib/ai/consistency';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'poison', model: 'mock', prompt: chapter.title });
      return NextResponse.json({ issues: mockPoisonIssues() });
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
    const text = await complete({ messages: buildPoisonMessages(chapter.title, chapter.content), temperature: 0.3 });
    createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'poison', model: config.model, prompt: chapter.title });
    return NextResponse.json({ issues: parseConflicts(text) });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '毒点审查失败' }, { status: 500 });
  }
}
