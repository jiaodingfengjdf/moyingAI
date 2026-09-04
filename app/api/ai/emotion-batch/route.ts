import { NextRequest, NextResponse } from 'next/server';
import { getVolume } from '@/lib/db/volumes';
import { listChaptersByProject } from '@/lib/db/chapters';
import { upsertAnalysis } from '@/lib/db/analyses';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildAnalysisMessages, mockAnalysis, parseAnalysis } from '@/lib/ai/emotion';
import { complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  if (!volumeId) return NextResponse.json({ error: 'volumeId 必填' }, { status: 400 });
  const volume = getVolume(volumeId);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  const chapters = listChaptersByProject(volume.projectId).filter((c) => c.volumeId === volumeId).slice(0, 20);
  const config = await getAIConfig().catch(() => null);
  const mock = process.env.INKPULSE_AI_MOCK === '1';
  if (!mock && !config?.apiKey) {
    return NextResponse.json({ error: '尚未配置 AI 密钥，请先在设置中填写' }, { status: 400 });
  }
  const model = mock ? 'mock' : config?.model ?? '';
  const results = [];
  for (const chapter of chapters) {
    try {
      const scores = mock ? mockAnalysis(chapter.content) : parseAnalysis(await complete({ messages: buildAnalysisMessages(chapter.title, chapter.content), temperature: 0.3 }, config ?? undefined));
      const analysis = upsertAnalysis({ chapterId: chapter.id, ...scores, model });
      createAIRequest({ projectId: volume.projectId, chapterId: chapter.id, kind: 'emotion', model, prompt: chapter.title });
      results.push(analysis);
    } catch {
      // 单章失败不中断整卷
    }
  }
  return NextResponse.json({ count: results.length, results });
}
