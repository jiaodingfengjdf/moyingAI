import { describe, it, expect } from 'vitest';
import { countWords } from './wordCount';

describe('countWords', () => {
  it('去掉空白后按字符计数', () => {
    expect(countWords('你好 world')).toBe(7);
  });

  it('空字符串为 0', () => {
    expect(countWords('')).toBe(0);
  });

  it('多行与全角标点按字符计入', () => {
    expect(countWords('第一段。\n\n第二段！')).toBe(8);
  });
});
