import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, updateChapter } from './chapters';
import { extractKeywords, searchHistory } from './search';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('extractKeywords', () => {
  it('提取去重的中文二元组与英文词', () => {
    expect(extractKeywords('林砚按住刀柄 雨夜 林砚按住刀柄')).toEqual(['林砚', '砚按', '按住', '住刀', '刀柄', '雨夜']);
    expect(extractKeywords('hello world hello')).toEqual(['hello', 'world']);
  });
});

describe('searchHistory', () => {
  it('经仓库同步后能检索到历史正文并出摘要', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '林砚在雨夜按住刀柄，指节发白，身后马蹄声渐近。' }, db);
    const hits = searchHistory(p.id, '林砚按住刀柄', db);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(c.id);
    expect(hits[0].snippet).toContain('林砚');
  });

  it('更新正文后旧关键词不再命中', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '旧词甲出现在这里。' }, db);
    updateChapter(c.id, { content: '完全不同的新内容。' }, db);
    expect(searchHistory(p.id, '旧词甲', db)).toHaveLength(0);
    expect(searchHistory(p.id, '新内容', db)).toHaveLength(1);
  });
});
