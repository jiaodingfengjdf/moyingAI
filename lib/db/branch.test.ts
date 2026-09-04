import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, updateChapter, listChaptersByProject } from './chapters';
import { createSnapshot } from './snapshots';
import { forkSnapshotToChapter } from './branch';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('forkSnapshotToChapter', () => {
  it('从快照复制出新章节草稿且原章不变', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'V1', outline: '大纲' }, db);
    const snap = createSnapshot(c.id, { label: '分支A', branchId: '分支A' }, db);
    updateChapter(c.id, { content: 'V2' }, db);
    const result = forkSnapshotToChapter(snap.id, db);
    expect(result.chapter.content).toBe('V1');
    expect(result.chapter.outline).toBe('大纲');
    expect(result.chapter.volumeId).toBe(v.id);
    expect(result.chapter.title).toContain('分支A');
    const chapters = listChaptersByProject(p.id, db);
    expect(chapters).toHaveLength(2);
    expect(chapters.find((x) => x.id === c.id)?.content).toBe('V2');
  });
});
