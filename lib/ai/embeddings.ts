import { getSetting } from '../db/settings';
import { AIError } from './provider';

export const EMBED_DIM = 96;

export function embeddingEnabled(): boolean {
  if (process.env.INKPULSE_AI_MOCK === '1') return true;
  const model = getSetting('ai.embedModel') || process.env.INKPULSE_AI_EMBED_MODEL || '';
  const key = getSetting('ai.apiKey') || process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  return Boolean(model && key);
}

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pseudoEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const push = (token: string) => {
    if (!token) return;
    vec[hash(token) % EMBED_DIM] += 1;
  };
  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) push(run.slice(i, i + 2));
  }
  for (const w of text.match(/[A-Za-z0-9_]{2,}/g) ?? []) push(w.toLowerCase());
  return vec;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function callEmbed(text: string): Promise<number[]> {
  if (process.env.INKPULSE_AI_MOCK === '1') return pseudoEmbed(text);
  const baseUrl = getSetting('ai.baseUrl') || process.env.INKPULSE_AI_BASE_URL || 'https://api.deepseek.com';
  const model = getSetting('ai.embedModel') || process.env.INKPULSE_AI_EMBED_MODEL || '';
  const apiKey = getSetting('ai.apiKey') || process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  if (!model || !apiKey) throw new AIError('未配置嵌入模型或密钥', 400);
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text.slice(0, 2000) }),
  });
  if (!res.ok) throw new AIError(`嵌入接口错误（${res.status}）`, res.status >= 500 ? 502 : res.status);
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new AIError('嵌入返回格式异常', 502);
  return vec;
}

export async function embed(text: string): Promise<number[]> {
  return callEmbed(text);
}
