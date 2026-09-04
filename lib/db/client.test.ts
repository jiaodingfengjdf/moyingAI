import { describe, it, expect } from 'vitest';
import { openDatabase } from './client';

const TABLES = [
  'project', 'volume', 'chapter', 'chapter_snapshot', 'entity',
  'entity_timeline', 'relationship', 'foreshadowing', 'ai_request', 'setting', 'scene', 'chapter_analysis',
];

describe('migrations', () => {
  it('创建全部表并把 user_version 设为 5', () => {
    const db = openDatabase(':memory:');
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const names = new Set(rows.map((r) => r.name));
    for (const table of TABLES) {
      expect(names.has(table), `缺少表 ${table}`).toBe(true);
    }
    const uv = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(uv.user_version).toBe(5);
    db.close();
  });

  it('对文件路径创建父目录', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('SELECT 1 AS ok').get()).toEqual({ ok: 1 });
    db.close();
  });
});
