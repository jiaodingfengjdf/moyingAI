import { getSetting } from '../db/settings';

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
  }
}

export async function getAIConfig(): Promise<AIConfig> {
  return {
    baseUrl: getSetting('ai.baseUrl') || process.env.INKPULSE_AI_BASE_URL || 'https://api.deepseek.com',
    apiKey: getSetting('ai.apiKey') || process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    model: getSetting('ai.model') || process.env.INKPULSE_AI_MODEL || 'deepseek-chat',
  };
}

export function sseToDeltaStream(body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return new ReadableStream<string>({
    async start(ctrl) {
      try {
        const handleLine = (line: string) => {
          const trimmed = line.trim();
          const rawData = trimmed.startsWith('data:') ? trimmed.slice(5) : trimmed.startsWith('{') ? trimmed : '';
          if (!rawData) return;
          const data = rawData.trim();
          if (data === '[DONE]') return;
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string; text?: string };
                message?: { content?: string };
              }>;
            };
            const choice = json.choices?.[0];
            const content = choice?.delta?.content ?? choice?.delta?.text ?? choice?.message?.content;
            if (typeof content === 'string' && content) ctrl.enqueue(content);
          } catch {
            // 忽略无法解析的行
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            handleLine(line);
          }
        }
        if (buffer.trim()) handleLine(buffer);
      } finally {
        ctrl.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export function mockDeltaStream(text: string): ReadableStream<string> {
  const chunks = text.match(/[\s\S]{1,6}/g) ?? [text];
  let index = 0;
  return new ReadableStream<string>({
    pull(ctrl) {
      if (index >= chunks.length) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(chunks[index++]);
    },
  });
}

const MOCK_TEXT = '【模拟生成】林砚按住刀柄，指节泛白，雨声中马蹄声由远及近。他缓缓吐出一口浊气，知道今夜再无退路，只能拔刀。';

export async function streamChat(options: StreamChatOptions, configOverride?: AIConfig): Promise<ReadableStream<string>> {
  const config = configOverride ?? (await getAIConfig());
  if (process.env.INKPULSE_AI_MOCK === '1') return mockDeltaStream(MOCK_TEXT);
  if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请点击右上角「设置」填写', 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        stream: true,
        temperature: options.temperature ?? 0.8,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
      signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === 'AbortError') throw new AIError('模型响应超时，请重试', 504);
    throw new AIError(`无法连接模型服务：${(err as Error).message}`, 502);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const text = await res.text().catch(() => '');
    throw new AIError(`模型接口错误（${res.status}）：${text.slice(0, 200)}`, res.status >= 500 ? 502 : res.status);
  }

  const parsed = sseToDeltaStream(res.body);
  return new ReadableStream<string>({
    async start(ctrl) {
      const reader = parsed.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          ctrl.enqueue(value);
        }
        ctrl.close();
      } catch (err) {
        ctrl.error(err);
      } finally {
        clearTimeout(timeout);
      }
    },
    cancel() {
      clearTimeout(timeout);
      void parsed.cancel();
    },
  });
}

export async function complete(options: StreamChatOptions, configOverride?: AIConfig): Promise<string> {
  const stream = await streamChat(options, configOverride);
  const reader = stream.getReader();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}
