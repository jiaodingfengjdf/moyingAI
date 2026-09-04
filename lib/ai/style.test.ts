import { describe, it, expect } from 'vitest';
import { STYLE_TARGETS, buildStyleMessages, mockStyleText } from './style';

describe('style migration', () => {
  it('四种目标指令完整', () => {
    expect(Object.keys(STYLE_TARGETS)).toEqual(['qidian', 'fanqie', 'jinjiang', 'webnovel']);
    for (const t of Object.values(STYLE_TARGETS)) {
      expect(t.label).toBeTruthy();
      expect(t.instruction.length).toBeGreaterThan(10);
    }
  });

  it('消息包含正文与目标要求且 mock 确定性', () => {
    const msgs = buildStyleMessages('fanqie', '他慢慢走向门口，停了下来。');
    expect(msgs[1].content).toContain('他慢慢走向门口');
    expect(msgs[0].content).toContain('番茄');
    expect(mockStyleText('fanqie')).toBe(mockStyleText('fanqie'));
    expect(mockStyleText('qidian')).not.toBe(mockStyleText('fanqie'));
  });
});
