import { describe, it, expect } from 'vitest';
import { parseDoc, serializeDoc } from './markdown';

describe('markdown roundtrip', () => {
  const cases = [
    '',
    '正文段落',
    '第一行\n第二行',
    '# 一级标题\n\n正文',
    '## 二级标题',
    '**加粗** 与 *斜体* 及 `代码`',
    '- 甲\n- 乙',
    '1. 甲\n2. 乙',
    '---',
    '> 引用内容',
    '```\nconst a = 1;\n```',
  ];

  it.each(cases)('roundtrip: %j', (md) => {
    expect(serializeDoc(parseDoc(md))).toBe(md);
  });

  it('解析出正确的节点类型与标记', () => {
    const doc = parseDoc('# 标题\n\n**粗** 正文\n\n- 项目');
    const blocks = doc.content ?? [];
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('heading');
    expect((blocks[0] as { attrs?: Record<string, unknown> }).attrs).toEqual({ level: 1 });
    expect((blocks[1] as { content?: unknown[] }).content?.[0]).toMatchObject({ type: 'text', marks: [{ type: 'bold' }] });
    expect(blocks[2].type).toBe('bulletList');
  });

  it('空内容得到空文档', () => {
    expect(parseDoc('')).toEqual({ type: 'doc', content: [] });
  });
});
