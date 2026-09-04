import { describe, it, expect, vi, afterEach } from 'vitest';
import { sseToDeltaStream, streamChat } from './provider';

function sseBody(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(text));
      ctrl.close();
    },
  });
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

describe('sseToDeltaStream', () => {
  it('解析 data 行并抽取增量内容', async () => {
    const raw = 'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
    expect(await collect(sseToDeltaStream(sseBody(raw)))).toBe('你好');
  });

  it('兼容 message.content 与 delta.text 字段', async () => {
    const raw =
      'data: {"choices":[{"message":{"content":"非流式"}}]}\n\n' +
      'data: {"choices":[{"delta":{"text":"片段"}}]}\n\n' +
      'data: [DONE]\n\n';
    expect(await collect(sseToDeltaStream(sseBody(raw)))).toBe('非流式片段');
  });

  it('兼容无 data 前缀的普通 JSON 响应', async () => {
    const raw = '{"choices":[{"message":{"content":"普通 JSON"}}]}';
    expect(await collect(sseToDeltaStream(sseBody(raw)))).toBe('普通 JSON');
  });
});

describe('streamChat', () => {
  const config = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' };

  afterEach(() => vi.unstubAllGlobals());

  it('发送正确的请求并返回增量流', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseBody('data: {"choices":[{"delta":{"content":"续写"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const stream = await streamChat({ messages: [{ role: 'user', content: '断点' }] }, config);
    expect(await collect(stream)).toBe('续写');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.stream).toBe(true);
  });

  it('未配置密钥时直接报 400，不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(streamChat({ messages: [] }, { ...config, apiKey: '' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接口错误映射为 AIError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    await expect(streamChat({ messages: [] }, config)).rejects.toMatchObject({ status: 401 });
  });

  it('INKPULSE_AI_MOCK=1 时返回模拟流', async () => {
    vi.stubEnv('INKPULSE_AI_MOCK', '1');
    const stream = await streamChat({ messages: [] }, { ...config, apiKey: '' });
    const text = await collect(stream);
    expect(text.length).toBeGreaterThan(10);
  });
});
