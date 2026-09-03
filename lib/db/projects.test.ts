import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject, deleteProject, getProject, listProjects, updateProject } from './projects';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('projects repo', () => {
  it('创建、读取与按更新时间倒序列出', () => {
    const a = createProject({ title: '甲', penName: '作者A' }, db);
    const b = createProject({ title: '乙' }, db);
    expect(a.title).toBe('甲');
    expect(a.penName).toBe('作者A');
    const list = listProjects(db);
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(list[0].volumeCount).toBe(0);
    expect(list[0].chapterCount).toBe(0);
    expect(getProject(a.id, db)?.title).toBe('甲');
  });

  it('更新与删除', () => {
    const p = createProject({ title: '旧名' }, db);
    const updated = updateProject(p.id, { title: '新名' }, db);
    expect(updated?.title).toBe('新名');
    expect(deleteProject(p.id, db)).toBe(true);
    expect(deleteProject(p.id, db)).toBe(false);
    expect(getProject(p.id, db)).toBeNull();
  });

  it('删除项目级联清理卷与章', () => {
    const p = createProject({ title: '级联' }, db);
    db.prepare(`INSERT INTO volume (id, projectId, title, "order", createdAt, updatedAt) VALUES ('v1', ?, '第一卷', 0, 't', 't')`).run(p.id);
    db.prepare(`INSERT INTO chapter (id, volumeId, title, content, outline, status, wordCount, "order", createdAt, updatedAt) VALUES ('c1', 'v1', '第一章', '', '', 'draft', 0, 0, 't', 't')`).run();
    deleteProject(p.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM volume').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM chapter').get()).toEqual({ n: 0 });
  });
});
