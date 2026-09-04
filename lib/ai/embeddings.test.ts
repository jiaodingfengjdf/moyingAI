import { describe, it, expect } from 'vitest';
import { cosine, embeddingEnabled, pseudoEmbed } from './embeddings';

describe('embeddings', () => {
  it('cosine 与伪嵌入', () => {
    const a = pseudoEmbed('雨夜追兵 林砚拔刀');
    const b = pseudoEmbed('雨夜追兵 林砚拔刀');
    const c = pseudoEmbed('山间采药 风和日丽');
    expect(cosine(a, b)).toBeCloseTo(1, 5);
    expect(cosine(a, c)).toBeLessThan(0.5);
    expect(a).toHaveLength(96);
  });

  it('mock 环境下 enabled', () => {
    process.env.INKPULSE_AI_MOCK = '1';
    expect(embeddingEnabled()).toBe(true);
    delete process.env.INKPULSE_AI_MOCK;
  });
});
