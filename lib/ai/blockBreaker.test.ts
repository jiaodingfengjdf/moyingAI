import { describe, it, expect } from 'vitest';
import { BREAK_CATEGORIES, buildContinueMessages, buildIdeasMessages, mockBlockIdeas, parseBlockIdeas } from './blockBreaker';

describe('block breaker', () => {
  it('消息与 mock 结构', () => {
    const msgs = buildIdeasMessages('主角被围', '');
    expect(msgs[0].content).toContain('外部灾变');
    expect(msgs[1].content).toContain('主角被围');
    const ideas = mockBlockIdeas();
    expect(ideas).toHaveLength(3);
    expect(ideas.map((x) => x.category)).toEqual([...BREAK_CATEGORIES]);
    const cont = buildContinueMessages('前文', '后文', '认知反转', '情报是假的');
    expect(cont[0].content).toContain('认知反转');
    expect(cont[1].content).toContain('前文');
  });

  it('parse 与兜底', () => {
    const payload = JSON.stringify([{ category: '外部灾变', title: '洪水', idea: '冲散双方' }]);
    expect(parseBlockIdeas(payload)).toHaveLength(1);
    expect(parseBlockIdeas(JSON.stringify({ ideas: mockBlockIdeas() }))).toHaveLength(3);
    expect(parseBlockIdeas('{"category":"其他","title":"x","idea":"y"}')).toHaveLength(0);
    expect(parseBlockIdeas('乱码')).toHaveLength(0);
  });
});
