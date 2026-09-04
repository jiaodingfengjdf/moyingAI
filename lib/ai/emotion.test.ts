import { describe, it, expect } from 'vitest';
import { buildAnalysisMessages, emotionWarnings, mockAnalysis, parseAnalysis } from './emotion';

describe('parseAnalysis', () => {
  it('解析并夹取 0~10，driver 截断', () => {
    const r = parseAnalysis(JSON.stringify({ buildUp: 12, anticipation: -1, release: 7.5, driver: 'x'.repeat(200) }));
    expect(r.buildUp).toBe(10);
    expect(r.anticipation).toBe(0);
    expect(r.release).toBe(7.5);
    expect(r.driver.length).toBeLessThanOrEqual(120);
    expect(parseAnalysis('```json\n{"buildUp":1,"anticipation":2,"release":3,"driver":"d"}\n```').release).toBe(3);
    expect(parseAnalysis('垃圾')).toEqual({ buildUp: 0, anticipation: 0, release: 0, driver: '' });
  });

  it('mock 确定性且消息含正文', () => {
    const a = mockAnalysis('一段正文');
    const b = mockAnalysis('一段正文');
    expect(a).toEqual(b);
    const msgs = buildAnalysisMessages('第一章', '正文内容');
    expect(msgs[0].content).toContain('JSON');
    expect(msgs[1].content).toContain('正文内容');
  });
});

describe('emotionWarnings', () => {
  it('连续三章低迷与无效爽感', () => {
    const rows = [
      { release: 2, buildUp: 7 }, { release: 3, buildUp: 8 }, { release: 1, buildUp: 9 },
      { release: 9, buildUp: 1 }, { release: 5, buildUp: 5 },
    ];
    const w = emotionWarnings(rows);
    expect(w.some((x) => x.includes('连续低迷'))).toBe(true);
    expect(w.some((x) => x.includes('无效爽感'))).toBe(true);
  });

  it('健康曲线无预警', () => {
    expect(emotionWarnings([{ release: 5, buildUp: 5 }, { release: 6, buildUp: 5 }, { release: 7, buildUp: 6 }])).toHaveLength(0);
  });
});
