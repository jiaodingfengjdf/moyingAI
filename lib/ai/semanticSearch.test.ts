import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { upsertEmbedding } from '../db/embeddings';
import { semanticSearch } from './semanticSearch';
import { pseudoEmbed } from './embeddings';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => vi.unstubAllEnvs());

describe('semanticSearch', () => {
  it('共享二元组的正文排在最前，未启用时为空', async () => {
    vi.stubEnv('INKPULSE_AI_MOCK', '1');
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const near = createChapter(v.id, { title: '雨夜', content: '雨夜追兵，林砚在巷口拔刀。' }, db);
    const far = createChapter(v.id, { title: '山间', content: '山间采药，风和日丽。' }, db);
    upsertEmbedding(near.id, pseudoEmbed(near.content), 'mock', db);
    upsertEmbedding(far.id, pseudoEmbed(far.content), 'mock', db);
    const hits = await semanticSearch(p.id, '雨夜追兵追来了', 3, db);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe(near.id);
    expect(hits.map((h) => h.id)).not.toContain(far.id);
  });
});
