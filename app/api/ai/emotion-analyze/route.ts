import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { upsertAnalysis } from '@/lib/db/analyses';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildAnalysisMessages, mockAnalysis, parseAnalysis } from '@/lib/ai/emotion';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      const scores = mockAnalysis(chapter.content);
      const analysis = upsertAnalysis({ chapterId, ...scores, model: 'mock' });
      createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'emotion', model: 'mock', prompt: chapter.title });
      return NextResponse.json({ analysis });
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
    const text = await complete({ messages: buildAnalysisMessages(chapter.title, chapter.content), temperature: 0.3 });
    const scores = parseAnalysis(text);
    const analysis = upsertAnalysis({ chapterId, ...scores, model: config.model });
    createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'emotion', model: config.model, prompt: chapter.title });
    return NextResponse.json({ analysis });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '情绪分析失败' }, { status: 500 });
  }
}
