import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildGenerateMessages, mockGenerate, parseBeats, parseSkeletonPayload, type OutlineLevel } from '@/lib/ai/outline';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const level = body?.level as OutlineLevel;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  if (level !== 'chapter' && level !== 'volume') return NextResponse.json({ error: 'level 必填（chapter/volume）' }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: 'prompt 不能为空' }, { status: 400 });

  const chapter = level === 'chapter' ? getChapter(chapterId) : null;
  const volume = level === 'volume' ? getVolume(volumeId) : null;
  if (level === 'chapter' && !chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  if (level === 'volume' && !volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  const projectId = chapter?.projectId ?? volume?.projectId ?? '';

  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      const result = mockGenerate(level);
      createAIRequest({ projectId, chapterId: level === 'chapter' ? chapterId : null, kind: 'outline', model: 'mock', prompt });
      return NextResponse.json(result);
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请在右上角「设置」填写', 400);
    const text = await complete({ messages: buildGenerateMessages(level, prompt), temperature: 0.7 });
    createAIRequest({ projectId, chapterId: level === 'chapter' ? chapterId : null, kind: 'outline', model: config.model, prompt });
    if (level === 'volume') {
      const payload = parseSkeletonPayload(text);
      if (payload.chapters.length === 0) throw new AIError('生成结果无法解析，请重试或缩短需求', 502);
      return NextResponse.json({ kind: 'volume', payload });
    }
    const beats = parseBeats(text);
    if (beats.length === 0) throw new AIError('生成结果无法解析，请重试或缩短需求', 502);
    return NextResponse.json({ kind: 'chapter', payload: { chapterOutline: '', beats } });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
