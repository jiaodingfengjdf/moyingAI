import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject, deleteProject } from './projects';
import { createSecret, deleteSecret, listSecrets, updateSecret } from './secrets';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('secrets repo', () => {
  it('创建、更新知情者并随项目级联删除', () => {
    const p = createProject({ title: '书' }, db);
    const secret = createSecret(p.id, { title: '身世', detail: '主角是前朝遗孤', knownEntityIds: ['e1'] }, db);
    expect(secret.title).toBe('身世');
    expect(secret.knownEntityIds).toEqual(['e1']);

    const updated = updateSecret(secret.id, { knownEntityIds: ['e1', 'e2'], detail: '只有师父知道全部真相' }, db);
    expect(updated?.knownEntityIds).toEqual(['e1', 'e2']);
    expect(listSecrets(p.id, db)).toHaveLength(1);

    deleteProject(p.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM "secret"').get()).toEqual({ n: 0 });
    expect(deleteSecret(secret.id, db)).toBe(false);
  });
});
