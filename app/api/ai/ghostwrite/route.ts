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
    let closed = false;
    let readers: Array<ReadableStreamDefaultReader<string>> = [];
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        readers = streams.map((s) => s.getReader());
        const send = (event: unknown) => {
          if (!closed) ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        const closeOnce = () => {
          if (!closed) {
            closed = true;
            ctrl.close();
          }
        };
        send({ type: 'meta', requestId: request.id });
        readers.forEach((reader, branch) => {
          void (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                send({ type: 'delta', branch, text: value });
              }
            } catch (err) {
              send({ type: 'error', branch, message: String((err as Error).message) });
            } finally {
              finished += 1;
              send({ type: 'done', branch });
              if (finished === readers.length) closeOnce();
            }
          })();
        });
      },
      cancel() {
        closed = true;
        for (const reader of readers) {
          try {
            void reader.cancel();
          } catch {
            // 读取器可能已释放，忽略
          }
        }
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
