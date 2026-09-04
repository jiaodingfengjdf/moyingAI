import { describe, it, expect } from 'vitest';
import { emotionPhase, hormoneIndex } from './emotion';

describe('hormone curve helpers', () => {
  it('压抑/期待/释放按 30/35/35 合成荷尔蒙指数', () => {
    expect(hormoneIndex({ buildUp: 0, anticipation: 0, release: 0 })).toBe(0);
    expect(hormoneIndex({ buildUp: 10, anticipation: 10, release: 10 })).toBe(10);
    expect(hormoneIndex({ buildUp: 8, anticipation: 5, release: 2 })).toBe(5);
  });

  it('划分压抑/期待/释放相位', () => {
    expect(emotionPhase({ buildUp: 8, anticipation: 4, release: 2 })).toBe('压抑蓄力');
    expect(emotionPhase({ buildUp: 5, anticipation: 8, release: 3 })).toBe('期待推高');
    expect(emotionPhase({ buildUp: 4, anticipation: 5, release: 9 })).toBe('释放高潮');
    expect(emotionPhase({ buildUp: 3, anticipation: 3, release: 3 })).toBe('过渡');
  });
});
