import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject, deleteProject } from './projects';
import { ensureProjectOutline, updateProjectOutline } from './bookOutline';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('book outline repo', () => {
  it('空项目自动补默认总纲行', () => {
    const p = createProject({ title: '书' }, db);
    const outline = ensureProjectOutline(p.id, db);
    expect(outline.projectId).toBe(p.id);
    expect(outline.synopsis).toBe('');
    expect(outline.arcs).toEqual([]);
  });

  it('保存主线、主题与卷弧并随项目级联删除', () => {
    const p = createProject({ title: '书' }, db);
    const saved = updateProjectOutline(
      p.id,
      {
        synopsis: '底层少年逆袭',
        theme: '心性决定上限',
        arcs: [{ id: 'a1', title: '第一卷·觉醒', goal: '获得金手指', summary: '立身小城' }],
      },
      db,
    );
    expect(saved.synopsis).toBe('底层少年逆袭');
    expect(saved.arcs).toHaveLength(1);
    expect(saved.arcs[0].goal).toBe('获得金手指');

    deleteProject(p.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_outline').get()).toEqual({ n: 0 });
  });
});
