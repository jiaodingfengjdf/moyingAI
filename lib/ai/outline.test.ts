import { describe, it, expect } from 'vitest';
import { buildGenerateMessages, buildOutlineCheckMessages, mockGenerate, parseBeats, parseSkeletonPayload } from './outline';

describe('parseSkeletonPayload', () => {
  it('解析纯 JSON 与围栏 JSON 并做字段兜底', () => {
    const payload = { volumeOutline: '卷纲', chapters: [{ title: '章一', outline: '纲一', beats: [{ title: '场一', goal: '目标' }] }] };
    expect(parseSkeletonPayload(JSON.stringify(payload)).chapters).toHaveLength(1);
    expect(parseSkeletonPayload('```json\n' + JSON.stringify(payload) + '\n```').volumeOutline).toBe('卷纲');
    expect(parseSkeletonPayload('不是 JSON').chapters).toHaveLength(0);
  });

  it('解析章节级节拍', () => {
    expect(parseBeats(JSON.stringify({ beats: [{ title: 'A', goal: 'g' }] }))).toHaveLength(1);
    expect(parseBeats(JSON.stringify([{ title: 'B', goal: 'g' }]))).toHaveLength(1);
    expect(parseBeats('垃圾')).toHaveLength(0);
  });
});

describe('生成消息与 mock', () => {
  it('消息要求 JSON 输出且 mock 有确定性结构', () => {
    const msgs = buildGenerateMessages('volume', '写一卷宗门考核');
    expect(msgs[1].content).toContain('写一卷宗门考核');
    expect(msgs[1].content).toContain('JSON');
    const vol = mockGenerate('volume');
    expect(vol.kind).toBe('volume');
    expect((vol.payload as { chapters: unknown[] }).chapters.length).toBeGreaterThanOrEqual(3);
    const chap = mockGenerate('chapter');
    expect(chap.kind).toBe('chapter');
    expect((chap.payload as { beats: unknown[] }).beats.length).toBeGreaterThanOrEqual(3);
  });
});

it('逻辑预演消息包含卷/章大纲与场景目标', () => {
  const msgs = buildOutlineCheckMessages({ volumeOutline: '卷纲', chapterOutline: '章纲', scenes: [{ title: 'A', goal: '目标' }] });
  expect(msgs[1].content).toContain('卷纲');
  expect(msgs[1].content).toContain('章纲');
  expect(msgs[1].content).toContain('目标');
  expect(msgs[0].content).toContain('机械降神');
});
