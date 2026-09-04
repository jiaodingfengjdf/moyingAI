import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildMcMessages, mockBranches, parseBranches } from '@/lib/ai/monteCarlo';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const decision = typeof body?.decision === 'string' ? body.decision.trim() : '';
  const contextText = typeof body?.contextText === 'string' ? body.contextText : '';
  const count = Math.max(3, Math.min(8, Number(body?.count) || 5));
  if (!projectId || !decision) return NextResponse.json({ error: 'projectId 与 decision 必填' }, { status: 400 });
  const chapter = chapterId ? getChapter(chapterId) : null;
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      createAIRequest({ projectId, chapterId: chapterId || null, kind: 'mc', model: 'mock', prompt: decision });
      return NextResponse.json({ branches: mockBranches() });
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
    const text = await complete({ messages: buildMcMessages(contextText || chapter?.outline || '', decision, count), temperature: 0.9 });
    const branches = parseBranches(text);
    if (branches.length === 0) throw new AIError('生成结果无法解析，请重试', 502);
    createAIRequest({ projectId, chapterId: chapterId || null, kind: 'mc', model: config.model, prompt: decision });
    return NextResponse.json({ branches });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '推演失败' }, { status: 500 });
  }
}
