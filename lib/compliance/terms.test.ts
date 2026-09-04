import { describe, it, expect } from 'vitest';
import { scanText } from './terms';

describe('scanText', () => {
  it('命中分类词条并给出计数与片段', () => {
    const text = '夜里的巷口有人在分发集会示威传单，还说附近要组织游行请愿。集会示威被巡丁撞破后，众人四散。';
    const hits = scanText(text);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const hit = hits.find((h) => h.term === '集会示威');
    expect(hit?.count).toBe(2);
    expect(hit?.snippets[0]).toContain('集会示威');
    expect(hit?.category).toBe('涉政');
  });

  it('无命中返回空', () => {
    expect(scanText('雨夜追兵，主角拔刀。')).toHaveLength(0);
  });
});
