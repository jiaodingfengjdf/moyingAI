import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildIdeasMessages, mockBlockIdeas, parseBlockIdeas } from '@/lib/ai/blockBreaker';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'blockbreaker', model: 'mock', prompt: '破局点子' });
      return NextResponse.json({ ideas: mockBlockIdeas() });
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
    const text = await complete({ messages: buildIdeasMessages(before, after), temperature: 0.9 });
    const ideas = parseBlockIdeas(text);
    if (ideas.length === 0) throw new AIError('生成结果无法解析，请重试', 502);
    createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'blockbreaker', model: config.model, prompt: '破局点子' });
    return NextResponse.json({ ideas });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '破局点子生成失败' }, { status: 500 });
  }
}
