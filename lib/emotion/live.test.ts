import { describe, it, expect } from 'vitest';
import { estimateLiveEmotion } from './live';

describe('estimateLiveEmotion', () => {
  it('压抑片段给高压抑', () => {
    const e = estimateLiveEmotion('主角被反复羞辱，忍无可忍却退无可退，只能咬牙受辱，卑微至极。');
    expect(e.buildUp).toBeGreaterThanOrEqual(7);
  });

  it('反转爆发给高释放', () => {
    const e = estimateLiveEmotion('身份曝光！林砚一剑反杀，全场震惊。');
    expect(e.release).toBeGreaterThanOrEqual(6);
  });

  it('平稳文本回中性并给出驱动句', () => {
    const e = estimateLiveEmotion('阳光洒进院子，猫在墙头打盹。');
    expect(e.driver).toBe('平稳推进');
  });
});
