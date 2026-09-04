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
  const hint = typeof body?.hint === 'string' ? body.hint : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  if (!(mode in REWRITE_MODES)) return NextResponse.json({ error: '不支持的润色模式' }, { status: 400 });
  if (!selected.trim()) return NextResponse.json({ error: '请先选中要处理的文本' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });

  try {
    const config = await getAIConfig();
    const ctx = await assembleContext({ projectId: chapter.projectId, chapterId, before: before || selected, after });
    const prompt = [selected.slice(0, 350), hint.slice(0, 150)].filter(Boolean).join('\n');
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'rewrite', model: config.model, prompt });
    const stream = await streamChat({ messages: buildRewriteMessages(ctx, mode, selected, hint) });

    const encoder = new TextEncoder();
    let closed = false;
    let reader: ReadableStreamDefaultReader<string> | null = null;
    const out = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const send = (event: unknown) => {
          if (!closed) ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        let receivedText = false;
        const closeOnce = () => {
          if (!closed) {
            closed = true;
            ctrl.close();
          }
        };
        send({ type: 'meta', requestId: request.id });
        reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.trim()) receivedText = true;
            send({ type: 'delta', branch: 0, text: value });
          }
        } catch (err) {
          send({ type: 'error', branch: 0, message: String((err as Error).message) });
        } finally {
          if (!receivedText) send({ type: 'error', branch: 0, message: '模型未返回正文内容，请重试' });
          send({ type: 'done', branch: 0 });
          closeOnce();
        }
      },
      cancel() {
        closed = true;
        try {
          void reader?.cancel();
        } catch {
          // 读取器可能已释放，忽略
        }
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
