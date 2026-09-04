import type { ChatMessage } from './provider';

export interface EmotionScores { buildUp: number; anticipation: number; release: number; driver: string }

function clamp(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : fallback;
}

export function parseAnalysis(text: string): EmotionScores {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const j = JSON.parse(stripped) as Record<string, unknown>;
    return {
      buildUp: clamp(j.buildUp),
      anticipation: clamp(j.anticipation),
      release: clamp(j.release),
      driver: typeof j.driver === 'string' ? j.driver.slice(0, 120) : '',
    };
  } catch {
    return { buildUp: 0, anticipation: 0, release: 0, driver: '' };
  }
}

export function buildAnalysisMessages(title: string, content: string): ChatMessage[] {
  return [
    { role: 'system', content: '你是网文情绪分析师。只输出 JSON：{"buildUp":0~10 压抑值,"anticipation":0~10 期待值,"release":0~10 释放度,"driver":"不超过 20 字的一句话情绪驱动说明"}。' },
    { role: 'user', content: `分析本章：${title}\n\n正文节选：\n${content.slice(-3000)}` },
  ];
}

export function mockAnalysis(content: string): EmotionScores {
  const base = content.length % 4;
  return { buildUp: 7 - base, anticipation: 6 + base, release: 5 + base, driver: '模拟驱动：危险逼近，主角必须抉择' };
}

export function emotionWarnings(rows: Array<{ release: number; buildUp: number }>): string[] {
  const warnings: string[] = [];
  for (let i = 0; i + 2 < rows.length; i++) {
    if (rows.slice(i, i + 3).every((r) => r.release <= 3)) {
      warnings.push(`第 ${i + 1}~${i + 3} 章连续低迷（release ≤ 3），存在劝退风险`);
      i += 2;
    }
  }
  rows.forEach((r, i) => {
    if (r.release >= 8 && r.buildUp <= 2) warnings.push(`第 ${i + 1} 章无铺垫高释放，疑似无效爽感`);
  });
  return warnings;
}
