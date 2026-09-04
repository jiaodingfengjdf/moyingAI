import { describe, it, expect } from 'vitest';
import { buildMcMessages, mockBranches, parseBranches } from './monteCarlo';

describe('monteCarlo', () => {
  it('消息含决策与数量', () => {
    const msgs = buildMcMessages('主角在雨夜被围', '是否拔刀反杀', 5);
    expect(msgs[1].content).toContain('是否拔刀反杀');
    expect(msgs[1].content).toContain('5');
  });

  it('parse 兜底与 mock 结构', () => {
    const payload = JSON.stringify([{ title: 'A', immediate: 'i', mid: 'm', risk: 'r', probability: '60%', hook: 'h' }]);
    expect(parseBranches(payload)).toHaveLength(1);
    expect(parseBranches(`{"branches":${payload}}`)).toHaveLength(1);
    expect(parseBranches('乱码')).toHaveLength(0);
    expect(mockBranches()).toHaveLength(5);
  });
});
