import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext, buildRewriteMessages } from '@/lib/ai/context';
import { REWRITE_MODES, type RewriteMode } from '@/lib/ai/prompts';
import { AIError, getAIConfig, streamChat } from '@/lib/ai/provider';
import { createAIRequest } from '@/lib/db/aiRequests';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const mode = body?.mode as RewriteMode;
  const selected = typeof body?.selected === 'string' ? body.selected : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  if (!(mode in REWRITE_MODES)) return NextResponse.json({ error: '不支持的润色模式' }, { status: 400 });
  if (!selected.trim()) return NextResponse.json({ error: '请先选中要处理的文本' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });

  try {
    const config = await getAIConfig();
    const ctx = await assembleContext({ projectId: chapter.projectId, chapterId, before: before || selected, after });
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'rewrite', model: config.model, prompt: selected.slice(0, 500) });
    const stream = await streamChat({ messages: buildRewriteMessages(ctx, mode, selected) });

    const encoder = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', requestId: request.id })}\n\n`));
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', branch: 0, text: value })}\n\n`));
          }
        } catch (err) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', branch: 0, message: String((err as Error).message) })}\n\n`));
        } finally {
          ctrl.enqueue(encoder.encode('data: {"type":"done","branch":0}\n\n'));
          ctrl.close();
        }
      },
      cancel() {
        void stream.cancel();
      },
    });
    return new Response(out, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
