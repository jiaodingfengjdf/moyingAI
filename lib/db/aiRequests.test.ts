import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createAIRequest, listByChapter, markAccepted } from './aiRequests';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('aiRequests repo', () => {
  it('创建、按章节倒序列出、标记采纳', () => {
    const p = createProject({ title: '书' }, db);
    const a = createAIRequest({ projectId: p.id, chapterId: 'c1', kind: 'ghostwrite', model: 'deepseek-chat', prompt: 'test' }, db);
    const b = createAIRequest({ projectId: p.id, chapterId: 'c1', kind: 'rewrite', model: 'deepseek-chat' }, db);
    expect(a.accepted).toBe(false);
    expect(listByChapter('c1', db).map((r) => r.id)).toEqual([b.id, a.id]);
    expect(markAccepted(a.id, true, db)).toBe(true);
    expect(listByChapter('c1', db).find((r) => r.id === a.id)?.accepted).toBe(true);
  });
});
