import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext, buildGhostwriteMessages } from '@/lib/ai/context';
import { GHOST_BRANCHES } from '@/lib/ai/prompts';
import { AIError, getAIConfig, streamChat } from '@/lib/ai/provider';
import { createAIRequest } from '@/lib/db/aiRequests';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });

  try {
    const config = await getAIConfig();
    const ctx = await assembleContext({ projectId: chapter.projectId, chapterId, before, after });
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'ghostwrite', model: config.model, prompt: before.slice(-500) });
    const streams = await Promise.all(GHOST_BRANCHES.map((b) => streamChat({ messages: buildGhostwriteMessages(ctx, b, before, after) })));

    const encoder = new TextEncoder();
    let finished = 0;
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', requestId: request.id })}\n\n`));
        streams.forEach((s, branch) => {
          void (async () => {
            const reader = s.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', branch, text: value })}\n\n`));
              }
            } catch (err) {
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', branch, message: String((err as Error).message) })}\n\n`));
            } finally {
              finished += 1;
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', branch })}\n\n`));
              if (finished === streams.length) ctrl.close();
            }
          })();
        });
      },
      cancel() {
        streams.forEach((s) => void s.cancel());
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
