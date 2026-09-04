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
    expect(parseBlockIdeas('{"category":"其他","title":"x","idea":"y"}')).toHaveLength(1);
    expect(parseBlockIdeas('乱码')).toHaveLength(0);
  });

  it('兼容围栏、前后杂文与近似分类措辞', () => {
    const wrapped = '好的，以下是三个变数：\n```json\n' + JSON.stringify(mockBlockIdeas()) + '\n```\n希望对你有帮助';
    expect(parseBlockIdeas(wrapped)).toHaveLength(3);
    const fuzzy = JSON.stringify([
      { category: '灾难突降', title: '洪峰', idea: '水淹围困' },
      { category: '认知被颠覆', title: '信物是假的', idea: '来意反转' },
      { category: '金手指被克制', title: '探查失效', idea: '反被定位' },
    ]);
    expect(parseBlockIdeas(fuzzy).map((x) => x.category)).toEqual([...BREAK_CATEGORIES]);
    expect(parseBlockIdeas('前缀 [{"category":"外部灾变","title":"a","idea":"b"}] 后缀')).toHaveLength(1);
  });
});
