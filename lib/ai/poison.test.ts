import { describe, it, expect } from 'vitest';
import { POISON_TYPES, buildPoisonMessages, mockPoisonIssues } from './poison';

describe('poison review', () => {
  it('消息包含类型清单与正文', () => {
    const msgs = buildPoisonMessages('第一章', '主角隐忍不发。');
    expect(msgs[0].content).toContain('憋屈不反击');
    expect(msgs[0].content).toContain('JSON');
    expect(msgs[1].content).toContain('主角隐忍不发');
  });

  it('类型清单与 mock 完整', () => {
    expect(POISON_TYPES.length).toBe(5);
    const m = mockPoisonIssues();
    expect(m).toHaveLength(2);
    expect(m.every((x) => POISON_TYPES.includes(x.type as (typeof POISON_TYPES)[number]))).toBe(true);
  });
});
