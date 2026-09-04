import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildContinueMessages } from '@/lib/ai/blockBreaker';
import { AIError, getAIConfig, streamChat } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  const category = typeof body?.category === 'string' ? body.category : '';
  const idea = typeof body?.idea === 'string' ? body.idea : '';
  if (!chapterId || !category || !idea) return NextResponse.json({ error: 'chapterId/category/idea 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  try {
    const config = await getAIConfig();
    if (!config.apiKey && process.env.INKPULSE_AI_MOCK !== '1') {
      throw new AIError('尚未配置 AI 密钥，请在右上角「设置」填写', 400);
    }
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'blockbreaker', model: config.model, prompt: `${category}：${idea}` });
    const mock = process.env.INKPULSE_AI_MOCK === '1';
    const stream = mock
      ? mockStream(`${category}突然降临：${idea}\n主角在电光石火间做出取舍，一步踏错便万劫不复。`)
      : await streamChat({ messages: buildContinueMessages(before, after, category, idea), temperature: 0.9 }, config);
    const encoder = new TextEncoder();
    let closed = false;
    let reader: ReadableStreamDefaultReader<string> | null = null;
    const out = new ReadableStream<Uint8Array>({
      async start(ctrl) {
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
        reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            send({ type: 'delta', branch: 0, text: value });
          }
        } catch (err) {
          send({ type: 'error', branch: 0, message: String((err as Error).message) });
        } finally {
          send({ type: 'done', branch: 0 });
          closeOnce();
        }
      },
      cancel() {
        closed = true;
        try {
          void reader?.cancel();
        } catch {
          // ignore
        }
      },
    });
    return new Response(out, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '破局续写失败' }, { status: 500 });
  }
}

function mockStream(text: string): ReadableStream<string> {
  const chunks = text.match(/[\s\S]{1,12}/g) ?? [text];
  let i = 0;
  return new ReadableStream<string>({
    pull(ctrl) {
      if (i >= chunks.length) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(chunks[i++]);
    },
  });
}
