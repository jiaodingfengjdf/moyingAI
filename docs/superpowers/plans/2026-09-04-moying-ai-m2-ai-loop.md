# M2 AI 闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1 基础工作台上接入 DeepSeek（OpenAI 兼容）并落地 AI 闭环：四层上下文装配、行内伴写三分支（光标浮层 + 右栏历史）、选中文本扩写/润色（扩写/五感/节奏/意境）、采纳与请求日志，同时开放基础实体卡录入以保证实体层（L3）有数据可用。

**Architecture:** 服务端新增 `lib/ai/`（统一 OpenAI 兼容流式 Provider、四层上下文装配、中文提示词模板）与 `lib/db/` 仓库（实体/时间线、设置、AI 请求日志、FTS5 检索）；新增 SSE 流式 API 路由（伴写/重写）与设置、实体、日志路由。客户端用 fetch + ReadableStream 消费 SSE，在 TipTap 编辑器内接入 `Alt+/` 触发、`Tab` 采纳与选中悬浮菜单动作，三支结果渲染为光标浮层并写入右栏历史。

**Tech Stack:** 沿用 M1（Next.js 15 + React 19 + TypeScript + Tailwind + node:sqlite + TipTap 3 + SWR 2 + Vitest），零新增运行时依赖；服务端用原生 `fetch` 与 `ReadableStream` 实现 SSE。

---

## 前置事实与关键决策

- M1 已交付并通过验收（34 测试 / lint / build 全绿）；本计划在其代码基础上增量开发。
- 模型默认 `deepseek-chat`、接口默认 `https://api.deepseek.com`，均可在设置页修改；密钥存本机 `setting` 表，同时支持环境变量 `INKPULSE_AI_API_KEY` / `INKPULSE_AI_BASE_URL` / `INKPULSE_AI_MODEL` 兜底。
- 光标前后文由客户端提供（L1 是编辑器视角的信息），服务端负责 L2（卷/章大纲）、L3（实体卡匹配）、L4（FTS5 历史检索）。
- 为了在没有真实密钥时也能全链路验收，Provider 支持 `INKPULSE_AI_MOCK=1` 环境变量返回确定性模拟流；正式使用不受影响。
- FTS5 用 `content=chapter` 外部内容表 + 触发器同步（`node:sqlite` 已验证支持 FTS5）。
- 一致性校验、关系图谱、伏笔看板仍在 M3，本里程碑不做（诊断按钮保持置灰）。

## 文件结构（本计划将创建/修改的全部文件）

```
lib/ai/
├─ provider.ts                 (Create) OpenAI 兼容流式客户端 + SSE 解析 + mock
├─ context.ts                  (Create) 四层上下文装配 + 实体匹配
└─ prompts.ts                  (Create) 系统提示词与三分支/四模式模板
lib/db/
├─ schema.ts                   (Modify) 迁移 2：chapter_fts 虚拟表 + 触发器 + 回填
├─ settings.ts                 (Create) 本机设置仓库
├─ entities.ts                 (Create) 实体卡 + 时间线仓库
├─ aiRequests.ts               (Create) AI 请求日志仓库
├─ search.ts                   (Create) FTS5 检索 + 关键词提取
└─ *.test.ts                   (Create) 对应测试
app/api/
├─ settings/route.ts           (Create) GET / PUT
├─ ai/ghostwrite/route.ts      (Create) POST 三分支 SSE
├─ ai/rewrite/route.ts         (Create) POST 重写 SSE
├─ ai-requests/[id]/accept/route.ts (Create) POST 采纳标记
├─ projects/[id]/entities/route.ts  (Create) GET / POST
├─ entities/[id]/route.ts      (Create) GET / PATCH / DELETE
├─ entities/[id]/timeline/route.ts  (Create) GET / POST
└─ chapters/[id]/ai-requests/route.ts (Create) GET 日志
components/workspace/
├─ SettingsModal.tsx           (Create) 模型设置弹窗
├─ EntityPanel.tsx             (Create) 左栏实体档案馆
├─ EntityForm.tsx              (Create) 实体卡表单 + 时间线
├─ AIOverlay.tsx               (Create) 光标三分支浮层
├─ ChapterEditor.tsx           (Modify) 接线 Alt+/、Tab、悬浮菜单与 AI 状态
├─ InspectorPanel.tsx          (Modify) 新增 AI 建议历史
└─ WorkspaceShell.tsx          (Modify) 设置入口与实体面板接入
lib/useAIStream.ts             (Create) 客户端 SSE 消费 hook
lib/types.ts                   (Modify) 实体/设置/AI 日志类型
```

## 任务分解

### Task 1: 数据库迁移 2（FTS5 历史检索基建）

**Files:**
- Modify: `lib/db/schema.ts`
- Test: `lib/db/client.test.ts`（更新 user_version 断言）、`lib/db/search.test.ts`（Task 5 补）

- [ ] **Step 1: 更新迁移与测试**

在 `lib/db/schema.ts` 的 `MIGRATIONS` 数组追加第二个迁移：

```ts
  `
  CREATE VIRTUAL TABLE IF NOT EXISTS chapter_fts USING fts5(
    content,
    content='chapter',
    content_rowid='id'
  );
  CREATE TRIGGER IF NOT EXISTS chapter_fts_ai AFTER INSERT ON chapter BEGIN
    INSERT INTO chapter_fts(rowid, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chapter_fts_ad AFTER DELETE ON chapter BEGIN
    INSERT INTO chapter_fts(chapter_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chapter_fts_au AFTER UPDATE ON chapter BEGIN
    INSERT INTO chapter_fts(chapter_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO chapter_fts(rowid, content) VALUES (new.id, new.content);
  END;
  INSERT INTO chapter_fts(rowid, content)
    SELECT id, content FROM chapter
    WHERE id NOT IN (SELECT rowid FROM chapter_fts);
  `,
```

把 `lib/db/client.test.ts` 的 user_version 断言改为 2：

```ts
    expect(uv.user_version).toBe(2);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/client.test.ts`

Expected: FAIL（user_version 实际为 1，与新的 2 不符）。

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run lib/db/client.test.ts`

Expected: PASS（迁移已加，2 个用例）。

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts lib/db/client.test.ts
git commit -m "feat: FTS5 历史检索迁移"
```

### Task 2: 本机设置仓库

**Files:**
- Create: `lib/db/settings.ts`
- Test: `lib/db/settings.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { getSetting, setSetting } from './settings';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('settings repo', () => {
  it('读写与覆盖', () => {
    expect(getSetting('ai.model', db)).toBeNull();
    setSetting('ai.model', 'deepseek-chat', db);
    expect(getSetting('ai.model', db)).toBe('deepseek-chat');
    setSetting('ai.model', 'deepseek-reasoner', db);
    expect(getSetting('ai.model', db)).toBe('deepseek-reasoner');
  });

  it('不同键互不影响', () => {
    setSetting('ai.apiKey', 'sk-123', db);
    setSetting('ai.baseUrl', 'https://api.deepseek.com', db);
    expect(getSetting('ai.apiKey', db)).toBe('sk-123');
    expect(getSetting('ai.baseUrl', db)).toBe('https://api.deepseek.com');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/settings.test.ts`

Expected: FAIL（`Cannot find module './settings'`）。

- [ ] **Step 3: 实现设置仓库**

Create `lib/db/settings.ts`:

```ts
import { getDb, type DB } from './client';

export function getSetting(key: string, db: DB = getDb()): string | null {
  const row = db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: DB = getDb()): void {
  db.prepare(`
    INSERT INTO setting (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/settings.test.ts`

Expected: PASS（2 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/settings.ts lib/db/settings.test.ts
git commit -m "feat: 本机设置仓库"
```

### Task 3: 实体卡与时间线仓库

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/db/entities.ts`
- Test: `lib/db/entities.test.ts`

- [ ] **Step 1: 补充共享类型**

在 `lib/types.ts` 末尾追加：

```ts
export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  fields: Record<string, unknown>;
  description: string;
  rules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EntityTimelineEntry {
  id: string;
  entityId: string;
  chapterId: string | null;
  change: Record<string, unknown>;
  note: string;
  createdAt: string;
}

export interface AISettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
}

export interface AIRequest {
  id: string;
  projectId: string;
  chapterId: string | null;
  kind: string;
  model: string;
  accepted: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: 写失败测试**

Create `lib/db/entities.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter } from './chapters';
import {
  addTimelineEntry, createEntity, deleteEntity, getEntity,
  listEntities, listTimeline, updateEntity,
} from './entities';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('entities repo', () => {
  it('创建并往返序列化别名/字段/规则', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({
      projectId: p.id,
      type: 'character',
      name: '林砚',
      aliases: ['小砚', '林兄'],
      fields: { 境界: '炼气三层', 伤势: '轻伤' },
      description: '落魄刀客',
      rules: ['不可复活'],
    }, db);
    expect(e.aliases).toEqual(['小砚', '林兄']);
    expect(e.fields).toEqual({ 境界: '炼气三层', 伤势: '轻伤' });
    const list = listEntities(p.id, db);
    expect(list).toHaveLength(1);
    expect(getEntity(e.id, db)?.name).toBe('林砚');
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'location', name: '青石镇' }, db);
    const updated = updateEntity(e.id, { fields: { 人口: 3000 }, description: '边境小镇' }, db);
    expect(updated?.fields).toEqual({ 人口: 3000 });
    expect(deleteEntity(e.id, db)).toBe(true);
    expect(deleteEntity(e.id, db)).toBe(false);
  });

  it('时间线条目按章节锚点追加，实体删除级联清理', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '林砚' }, db);
    const t1 = addTimelineEntry(e.id, { chapterId: c.id, change: { 境界: '炼气三层' }, note: '入门' }, db);
    const t2 = addTimelineEntry(e.id, { chapterId: c.id, change: { 境界: '筑基' }, note: '突破' }, db);
    expect(t1.change).toEqual({ 境界: '炼气三层' });
    expect(listTimeline(e.id, db).map((t) => t.id)).toEqual([t2.id, t1.id]);
    deleteEntity(e.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM entity_timeline').get()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run lib/db/entities.test.ts`

Expected: FAIL（`Cannot find module './entities'`）。

- [ ] **Step 4: 实现实体仓库**

Create `lib/db/entities.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Entity, EntityTimelineEntry, EntityType } from '../types';

const SELECT = 'SELECT id, projectId, type, name, aliases, fields, description, rules, createdAt, updatedAt FROM entity';

function rowToEntity(row: unknown): Entity {
  const r = row as { aliases: string; fields: string; rules: string } & Omit<Entity, 'aliases' | 'fields' | 'rules'>;
  return {
    ...r,
    aliases: JSON.parse(r.aliases) as string[],
    fields: JSON.parse(r.fields) as Record<string, unknown>,
    rules: JSON.parse(r.rules) as string[],
  };
}

export function listEntities(projectId: string, db: DB = getDb()): Entity[] {
  const rows = db.prepare(`${SELECT} WHERE projectId = ? ORDER BY type, name`).all(projectId);
  return (rows as unknown[]).map(rowToEntity);
}

export function getEntity(id: string, db: DB = getDb()): Entity | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return row ? rowToEntity(row) : null;
}

export function createEntity(
  input: {
    projectId: string; type: EntityType; name: string; aliases?: string[];
    fields?: Record<string, unknown>; description?: string; rules?: string[];
  },
  db: DB = getDb(),
): Entity {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO entity (id, projectId, type, name, aliases, fields, description, rules, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.type, input.name,
      JSON.stringify(input.aliases ?? []), JSON.stringify(input.fields ?? {}),
      input.description ?? '', JSON.stringify(input.rules ?? []), now, now);
  return getEntity(id, db)!;
}

export function updateEntity(
  id: string,
  patch: { type?: EntityType; name?: string; aliases?: string[]; fields?: Record<string, unknown>; description?: string; rules?: string[] },
  db: DB = getDb(),
): Entity | null {
  const current = getEntity(id, db);
  if (!current) return null;
  const next = {
    type: patch.type ?? current.type,
    name: patch.name ?? current.name,
    aliases: patch.aliases ?? current.aliases,
    fields: patch.fields ?? current.fields,
    description: patch.description ?? current.description,
    rules: patch.rules ?? current.rules,
  };
  db.prepare('UPDATE entity SET type = ?, name = ?, aliases = ?, fields = ?, description = ?, rules = ?, updatedAt = ? WHERE id = ?')
    .run(next.type, next.name, JSON.stringify(next.aliases), JSON.stringify(next.fields), next.description, JSON.stringify(next.rules), new Date().toISOString(), id);
  return getEntity(id, db)!;
}

export function deleteEntity(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM entity WHERE id = ?').run(id).changes > 0;
}

export function listTimeline(entityId: string, db: DB = getDb()): EntityTimelineEntry[] {
  const rows = db.prepare('SELECT id, entityId, chapterId, change, note, createdAt FROM entity_timeline WHERE entityId = ? ORDER BY createdAt DESC').all(entityId);
  return (rows as unknown as Array<{ change: string } & Omit<EntityTimelineEntry, 'change'>>).map((r) => ({
    ...r,
    change: JSON.parse(r.change) as Record<string, unknown>,
  }));
}

export function addTimelineEntry(
  entityId: string,
  input: { chapterId?: string | null; change?: Record<string, unknown>; note?: string },
  db: DB = getDb(),
): EntityTimelineEntry {
  if (!getEntity(entityId, db)) throw new Error('实体不存在');
  const id = createId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO entity_timeline (id, entityId, chapterId, change, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, entityId, input.chapterId ?? null, JSON.stringify(input.change ?? {}), input.note ?? '', now);
  const row = db.prepare('SELECT id, entityId, chapterId, change, note, createdAt FROM entity_timeline WHERE id = ?').get(id) as { change: string } & Omit<EntityTimelineEntry, 'change'>;
  return { ...row, change: JSON.parse(row.change) as Record<string, unknown> };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run lib/db/entities.test.ts`

Expected: PASS（3 个用例）。

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db/entities.ts lib/db/entities.test.ts
git commit -m "feat: 实体卡与时间线仓库"
```

### Task 4: AI 请求日志仓库

**Files:**
- Create: `lib/db/aiRequests.ts`
- Test: `lib/db/aiRequests.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/aiRequests.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/aiRequests.test.ts`

Expected: FAIL（`Cannot find module './aiRequests'`）。

- [ ] **Step 3: 实现日志仓库**

Create `lib/db/aiRequests.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { AIRequest } from '../types';

const SELECT = 'SELECT id, projectId, chapterId, kind, model, accepted, createdAt FROM ai_request';

function rowToRequest(row: unknown): AIRequest {
  const r = row as { accepted: number } & Omit<AIRequest, 'accepted'>;
  return { ...r, accepted: r.accepted === 1 };
}

export function createAIRequest(
  input: { projectId: string; chapterId?: string | null; kind: string; model: string; prompt?: string },
  db: DB = getDb(),
): AIRequest {
  const id = createId();
  db.prepare('INSERT INTO ai_request (id, projectId, chapterId, kind, prompt, model, accepted, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
    .run(id, input.projectId, input.chapterId ?? null, input.kind, input.prompt ?? '', input.model, new Date().toISOString());
  return rowToRequest(db.prepare(`${SELECT} WHERE id = ?`).get(id));
}

export function markAccepted(id: string, accepted = true, db: DB = getDb()): boolean {
  return db.prepare('UPDATE ai_request SET accepted = ? WHERE id = ?').run(accepted ? 1 : 0, id).changes > 0;
}

export function listByChapter(chapterId: string, db: DB = getDb()): AIRequest[] {
  const rows = db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY createdAt DESC LIMIT 30`).all(chapterId);
  return (rows as unknown[]).map(rowToRequest);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/aiRequests.test.ts`

Expected: PASS（1 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/aiRequests.ts lib/db/aiRequests.test.ts
git commit -m "feat: AI 请求日志仓库"
```

### Task 5: FTS5 检索与关键词提取

**Files:**
- Create: `lib/db/search.ts`
- Test: `lib/db/search.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/search.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, updateChapter } from './chapters';
import { buildFtsQuery, extractKeywords, searchHistory } from './search';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('extractKeywords', () => {
  it('提取最长且去重的中英文片段', () => {
    expect(extractKeywords('林砚按住刀柄 雨夜 林砚按住刀柄')).toEqual(['林砚按住刀柄', '雨夜']);
    expect(extractKeywords('hello world hello')).toEqual(['hello', 'world']);
  });

  it('构造带引号与转义的 FTS 查询', () => {
    expect(buildFtsQuery(['林砚', 'a"b'])).toBe('"林砚" OR "a""b"');
    expect(buildFtsQuery([])).toBeNull();
  });
});

describe('searchHistory', () => {
  it('经触发器同步后能检索到历史正文并出摘要', () => {
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/search.test.ts`

Expected: FAIL（`Cannot find module './search'`）。

- [ ] **Step 3: 实现检索**

Create `lib/db/search.ts`:

```ts
import { getDb, type DB } from './client';

export interface SearchHit {
  id: string;
  title: string;
  volumeTitle: string;
  snippet: string;
}

export function extractKeywords(text: string, max = 3): string[] {
  const matches = text.match(/[A-Za-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      unique.push(m);
    }
  }
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, max);
}

export function buildFtsQuery(keywords: string[]): string | null {
  if (keywords.length === 0) return null;
  return keywords.map((k) => `"${k.replace(/"/g, '""')}"`).join(' OR ');
}

export function searchHistory(projectId: string, queryText: string, db: DB = getDb(), limit = 3): SearchHit[] {
  const query = buildFtsQuery(extractKeywords(queryText));
  if (!query) return [];
  const rows = db.prepare(`
    SELECT c.id, c.title, v.title AS volumeTitle, snippet(chapter_fts, 1, '…', '…', '…', 18) AS snippet
    FROM chapter_fts f
    JOIN chapter c ON c.id = f.rowid
    JOIN volume v ON c.volumeId = v.id
    WHERE v.projectId = ? AND chapter_fts MATCH ?
    ORDER BY rank LIMIT ?
  `).all(projectId, query, limit);
  return rows as unknown as SearchHit[];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/search.test.ts`

Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/search.ts lib/db/search.test.ts
git commit -m "feat: FTS5 检索与关键词提取"
```

### Task 6: AI Provider（流式客户端 + SSE 解析）

**Files:**
- Create: `lib/ai/provider.ts`
- Test: `lib/ai/provider.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/ai/provider.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIError, sseToDeltaStream, streamChat } from './provider';

function sseBody(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode(text));
      ctrl.close();
    },
  });
}

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}

describe('sseToDeltaStream', () => {
  it('解析 data 行并抽取增量内容', async () => {
    const raw = 'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
    expect(await collect(sseToDeltaStream(sseBody(raw)))).toBe('你好');
  });
});

describe('streamChat', () => {
  const config = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' };

  afterEach(() => vi.unstubAllGlobals());

  it('发送正确的请求并返回增量流', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseBody('data: {"choices":[{"delta":{"content":"续写"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const stream = await streamChat({ messages: [{ role: 'user', content: '断点' }] }, config);
    expect(await collect(stream)).toBe('续写');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.stream).toBe(true);
  });

  it('未配置密钥时直接报 400，不发起请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(streamChat({ messages: [] }, { ...config, apiKey: '' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接口错误映射为 AIError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    await expect(streamChat({ messages: [] }, config)).rejects.toMatchObject({ status: 401 });
  });

  it('INKPULSE_AI_MOCK=1 时返回模拟流', async () => {
    vi.stubEnv('INKPULSE_AI_MOCK', '1');
    const stream = await streamChat({ messages: [] }, { ...config, apiKey: '' });
    const text = await collect(stream);
    expect(text.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/ai/provider.test.ts`

Expected: FAIL（`Cannot find module './provider'`）。

- [ ] **Step 3: 实现 Provider**

Create `lib/ai/provider.ts`:

```ts
import { getSetting } from '../db/settings';

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class AIError extends Error {
  constructor(message: string, public readonly status = 500) {
    super(message);
  }
}

export async function getAIConfig(): Promise<AIConfig> {
  return {
    baseUrl: getSetting('ai.baseUrl') || process.env.INKPULSE_AI_BASE_URL || 'https://api.deepseek.com',
    apiKey: getSetting('ai.apiKey') || process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    model: getSetting('ai.model') || process.env.INKPULSE_AI_MODEL || 'deepseek-chat',
  };
}

export function sseToDeltaStream(body: ReadableStream<Uint8Array>): ReadableStream<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return new ReadableStream<string>({
    async start(ctrl) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') return;
            try {
              const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta) ctrl.enqueue(delta);
            } catch {
              // 忽略无法解析的行
            }
          }
        }
      } finally {
        ctrl.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export function mockDeltaStream(text: string): ReadableStream<string> {
  const chunks = text.match(/.{1,6}/gs) ?? [text];
  let index = 0;
  return new ReadableStream<string>({
    pull(ctrl) {
      if (index >= chunks.length) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(chunks[index++]);
    },
  });
}

const MOCK_TEXT = '【模拟生成】林砚按住刀柄，指节泛白，雨声中马蹄声由远及近。他缓缓吐出一口浊气，知道今夜再无退路，只能拔刀。';

export async function streamChat(options: StreamChatOptions, configOverride?: AIConfig): Promise<ReadableStream<string>> {
  const config = configOverride ?? (await getAIConfig());
  if (process.env.INKPULSE_AI_MOCK === '1') return mockDeltaStream(MOCK_TEXT);
  if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请点击右上角「设置」填写', 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        stream: true,
        temperature: options.temperature ?? 0.8,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
      signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === 'AbortError') throw new AIError('模型响应超时，请重试', 504);
    throw new AIError(`无法连接模型服务：${(err as Error).message}`, 502);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    const text = await res.text().catch(() => '');
    throw new AIError(`模型接口错误（${res.status}）：${text.slice(0, 200)}`, res.status >= 500 ? 502 : res.status);
  }

  const parsed = sseToDeltaStream(res.body);
  return new ReadableStream<string>({
    async start(ctrl) {
      const reader = parsed.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          ctrl.enqueue(value);
        }
        ctrl.close();
      } catch (err) {
        ctrl.error(err);
      } finally {
        clearTimeout(timeout);
      }
    },
    cancel() {
      clearTimeout(timeout);
      void parsed.cancel();
    },
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/ai/provider.test.ts`

Expected: PASS（5 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/ai/provider.ts lib/ai/provider.test.ts
git commit -m "feat: AI Provider 流式客户端与 SSE 解析"
```

### Task 7: 上下文装配与提示词模板

**Files:**
- Create: `lib/ai/prompts.ts`、`lib/ai/context.ts`
- Test: `lib/ai/context.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/ai/context.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { createEntity } from '../db/entities';
import { assembleContext, buildGhostwriteMessages, buildRewriteMessages, entityMatch } from './context';
import { GHOST_BRANCHES } from './prompts';
import type { Entity } from '../types';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('entityMatch', () => {
  it('命中名字或别名', () => {
    const entities = [
      { name: '林砚', aliases: ['小砚'] },
      { name: '苏晚', aliases: [] },
    ] as unknown as Entity[];
    expect(entityMatch('小砚按住刀柄', entities).map((e) => e.name)).toEqual(['林砚']);
  });
});

describe('assembleContext', () => {
  it('装配 L2/L3/L4 三层', async () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一', summary: '雨夜逃亡' }, db);
    const c = createChapter(v.id, { title: '第一章', outline: '主角突围', content: '林砚在雨夜按住刀柄，指节发白。' }, db);
    createEntity({ projectId: p.id, type: 'character', name: '林砚', description: '落魄刀客', fields: { 境界: '炼气' } }, db);
    const ctx = await assembleContext({ projectId: p.id, chapterId: c.id, before: '林砚在雨夜按住刀柄', after: '' }, db);
    expect(ctx.volumeTitle).toBe('卷一');
    expect(ctx.outline).toBe('主角突围');
    expect(ctx.entities.map((e) => e.name)).toContain('林砚');
    expect(ctx.history.length).toBeGreaterThan(0);
  });

  it('构建伴写与重写消息包含设定与断点', async () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const ctx = await assembleContext({ projectId: p.id, chapterId: c.id, before: '断点前文', after: '后文' }, db);
    const ghost = buildGhostwriteMessages(ctx, GHOST_BRANCHES[0], '断点前文', '后文');
    expect(ghost[0].content).toContain('卷一');
    expect(ghost[1].content).toContain('断点前文');
    expect(ghost[1].content).toContain('⟦光标⟧');
    const rewrite = buildRewriteMessages(ctx, 'pace', '选中片段');
    expect(rewrite[1].content).toContain('选中片段');
    expect(rewrite[1].content).toContain('节奏加速');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/ai/context.test.ts`

Expected: FAIL（`Cannot find module './context'`）。

- [ ] **Step 3: 实现提示词模板**

Create `lib/ai/prompts.ts`:

```ts
export const SYSTEM_PROMPT = [
  '你是资深网络文学作者助理，负责在长篇连载中协助续写与润色。',
  '铁律：',
  '1. 严格遵循世界观设定与人物当前状态，绝不与设定冲突；',
  '2. 不重复已有原文内容，从断点自然衔接；',
  '3. 只输出正文，不输出解释、标注或引导语；',
  '4. 保持与原文一致的叙述视角、文风与语气；',
  '5. 不引入未经设定的新角色、新设定或越级战力。',
].join('\n');

export interface GhostBranchSpec {
  id: string;
  label: string;
  instruction: string;
}

export const GHOST_BRANCHES: GhostBranchSpec[] = [
  { id: 'action', label: '推进动作', instruction: '续写 100~300 字：推动剧情动作向前发展，落到具体行为与冲突升级，结尾留一个小钩子。' },
  { id: 'psyche', label: '心理剖析', instruction: '续写 100~300 字：聚焦当前视角人物的内心活动、欲望与恐惧，强化代入感。' },
  { id: 'environment', label: '环境渲染/变故突生', instruction: '续写 100~300 字：用环境、氛围或一个突发变数推进场景，制造张力。' },
];

export type RewriteMode = 'expand' | 'senses' | 'pace' | 'mood';

export const REWRITE_MODES: Record<RewriteMode, { label: string; instruction: string }> = {
  expand: { label: '扩写', instruction: '在不改变情节与设定的前提下扩写给定片段，篇幅扩充约 1.5~2 倍，补充动作细节、对话反应与场景信息。' },
  senses: { label: '五感强化', instruction: '重写给定片段，强化视觉光影、声音质感、气味、触觉与痛觉等五感描写，保持情节不变。' },
  pace: { label: '节奏加速', instruction: '重写给定片段，剔除冗余修饰、压缩长句、强化动作动词，使节奏更快更利落。' },
  mood: { label: '意境沉浸', instruction: '重写给定片段，增加隐喻与场景氛围烘托，营造更浓的意境与情绪。' },
};
```

- [ ] **Step 4: 实现上下文装配**

Create `lib/ai/context.ts`:

```ts
import { getVolume } from '../db/volumes';
import { getChapter } from '../db/chapters';
import { listEntities } from '../db/entities';
import { searchHistory } from '../db/search';
import type { DB } from '../db/client';
import type { Entity } from '../types';
import { GHOST_BRANCHES, REWRITE_MODES, SYSTEM_PROMPT, type GhostBranchSpec, type RewriteMode } from './prompts';
import type { ChatMessage } from './provider';

export interface EntityLite {
  name: string;
  type: string;
  description: string;
  fields: string;
}

export interface AssembledContext {
  volumeTitle: string;
  chapterTitle: string;
  outline: string;
  entities: EntityLite[];
  history: { title: string; volumeTitle: string; snippet: string }[];
}

export function entityMatch(text: string, entities: Entity[]): Entity[] {
  const haystack = text.toLowerCase();
  return entities.filter((e) => [e.name, ...e.aliases].some((n) => n && haystack.includes(n.toLowerCase())));
}

export function trimEntity(e: Entity): EntityLite {
  const picked = Object.entries(e.fields).slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`).join('；');
  return {
    name: e.name,
    type: e.type,
    description: e.description.slice(0, 300),
    fields: picked,
  };
}

export async function assembleContext(
  opts: { projectId: string; chapterId: string; before: string; after: string },
  db?: DB,
): Promise<AssembledContext> {
  const chapter = getChapter(opts.chapterId, db);
  if (!chapter) throw new Error('章节不存在');
  const volume = getVolume(chapter.volumeId, db);
  const entities = entityMatch(opts.before + opts.after, listEntities(opts.projectId, db));
  const history = searchHistory(opts.projectId, opts.before.slice(-2000), db);
  return {
    volumeTitle: volume?.title ?? '',
    chapterTitle: chapter.title,
    outline: chapter.outline,
    entities: entities.slice(0, 8).map(trimEntity),
    history,
  };
}

export function renderContextBlock(ctx: AssembledContext): string {
  const parts = [
    `当前卷：${ctx.volumeTitle}`,
    `当前章：${ctx.chapterTitle}`,
    ctx.outline ? `本章大纲：${ctx.outline}` : '',
    ctx.entities.length
      ? '相关设定卡：\n' + ctx.entities.map((e) => `- ${e.name}（${e.type}）：${e.description}${e.fields ? '；' + e.fields : ''}`).join('\n')
      : '',
    ctx.history.length
      ? '历史相关片段（仅参考，勿照抄）：\n' + ctx.history.map((h) => `- [${h.volumeTitle}·${h.title}] ${h.snippet}`).join('\n')
      : '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

export function buildGhostwriteMessages(ctx: AssembledContext, branch: GhostBranchSpec, before: string, after: string): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `【任务：${branch.label}】${branch.instruction}\n\n请从下面断点处直接续写：\n\n${before.slice(-2000)}\n⟦光标⟧${after.slice(0, 300)}` },
  ];
}

export function buildRewriteMessages(ctx: AssembledContext, mode: RewriteMode, selected: string): ChatMessage[] {
  const spec = REWRITE_MODES[mode];
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `【任务：${spec.label}】${spec.instruction}\n\n待处理片段：\n\n${selected.slice(0, 2000)}` },
  ];
}

export { GHOST_BRANCHES, REWRITE_MODES };
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run lib/ai/context.test.ts`

Expected: PASS（3 个用例）。

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompts.ts lib/ai/context.ts lib/ai/context.test.ts
git commit -m "feat: 四层上下文装配与提示词模板"
```

### Task 8: 设置 API 与设置弹窗

**Files:**
- Create: `app/api/settings/route.ts`、`components/workspace/SettingsModal.tsx`
- Modify: `components/workspace/WorkspaceShell.tsx`（顶栏「设置」入口）

- [ ] **Step 1: 创建设置 API**

Create `app/api/settings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/settings';

function envApiKey(): string {
  return process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
}

function snapshot() {
  return {
    baseUrl: getSetting('ai.baseUrl') || 'https://api.deepseek.com',
    model: getSetting('ai.model') || 'deepseek-chat',
    hasApiKey: Boolean(getSetting('ai.apiKey') || envApiKey()),
  };
}

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.baseUrl === 'string' && body.baseUrl.trim()) {
    setSetting('ai.baseUrl', body.baseUrl.trim());
  }
  if (typeof body?.model === 'string' && body.model.trim()) {
    setSetting('ai.model', body.model.trim());
  }
  if (typeof body?.apiKey === 'string' && body.apiKey.trim()) {
    setSetting('ai.apiKey', body.apiKey.trim());
  }
  return NextResponse.json(snapshot());
}
```

- [ ] **Step 2: 创建设置弹窗**

Create `components/workspace/SettingsModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void fetch('/api/settings')
      .then((r) => r.json())
      .then((d: { baseUrl: string; model: string; hasApiKey: boolean }) => {
        setBaseUrl(d.baseUrl);
        setModel(d.model);
        setHasKey(d.hasApiKey);
      });
  }, []);

  async function save() {
    setBusy(true);
    setMessage('');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, model, apiKey }),
    });
    setBusy(false);
    if (res.ok) {
      setHasKey(true);
      setApiKey('');
      setMessage('已保存');
    } else {
      setMessage('保存失败');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">AI 模型设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            接口地址
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="https://api.deepseek.com" />
          </label>
          <label className="flex flex-col gap-1">
            模型
            <input value={model} onChange={(e) => setModel(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="deepseek-chat" />
          </label>
          <label className="flex flex-col gap-1">
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
              placeholder={hasKey ? '已配置，留空则保持不变' : 'sk-…'}
            />
          </label>
          <p className="text-xs text-gray-400">密钥仅保存在本机数据目录，不会上传到除所选模型服务以外的任何地方。</p>
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
          <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在顶栏接入设置入口**

Modify `components/workspace/WorkspaceShell.tsx`：新增 import 与状态，顶栏加「设置」按钮，底部渲染弹窗：

```tsx
import SettingsModal from './SettingsModal';
```

```tsx
  const [showSettings, setShowSettings] = useState(false);
```

顶栏右侧 `SaveBadge` 后追加：

```tsx
          <button onClick={() => setShowSettings(true)} className="text-gray-500 hover:text-blue-600">设置</button>
```

组件最外层 `</div>` 前追加：

```tsx
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
```

- [ ] **Step 4: 验证**

Run: `npm run lint`

Expected: 通过。`npm run dev` 后 curl：

```powershell
curl.exe -s http://localhost:3000/api/settings
curl.exe -s -X PUT http://localhost:3000/api/settings -H "Content-Type: application/json" -d "{\"model\":\"deepseek-chat\",\"baseUrl\":\"https://api.deepseek.com\"}"
```

Expected: GET 返回 `{"baseUrl":"https://api.deepseek.com","model":"deepseek-chat","hasApiKey":false}`；PUT 后再次 GET 保持一致（不覆盖密钥）。

- [ ] **Step 5: Commit**

```bash
git add app/api/settings components/workspace/SettingsModal.tsx components/workspace/WorkspaceShell.tsx
git commit -m "feat: 模型设置 API 与设置弹窗"
```

### Task 9: 实体 API 与实体档案馆 UI

**Files:**
- Create: `app/api/projects/[id]/entities/route.ts`、`app/api/entities/[id]/route.ts`、`app/api/entities/[id]/timeline/route.ts`、`components/workspace/EntityPanel.tsx`、`components/workspace/EntityForm.tsx`
- Modify: `components/workspace/Sidebar.tsx`（用 EntityPanel 替换占位）

- [ ] **Step 1: 创建实体 API**

Create `app/api/projects/[id]/entities/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { createEntity, listEntities } from '@/lib/db/entities';
import type { EntityType } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const TYPES: EntityType[] = ['character', 'faction', 'location', 'system', 'artifact'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ entities: listEntities(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body?.type as EntityType;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!TYPES.includes(type)) return NextResponse.json({ error: '实体类型不合法' }, { status: 400 });
  if (!name) return NextResponse.json({ error: '实体名称不能为空' }, { status: 400 });
  const entity = createEntity({
    projectId: id,
    type,
    name,
    aliases: Array.isArray(body?.aliases) ? body.aliases.filter((a): a is string => typeof a === 'string') : [],
    fields: body?.fields && typeof body.fields === 'object' ? body.fields as Record<string, unknown> : {},
    description: typeof body?.description === 'string' ? body.description : '',
    rules: Array.isArray(body?.rules) ? body.rules.filter((r): r is string => typeof r === 'string') : [],
  });
  return NextResponse.json({ entity }, { status: 201 });
}
```

Create `app/api/entities/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteEntity, getEntity, updateEntity } from '@/lib/db/entities';
import type { EntityType } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const TYPES: EntityType[] = ['character', 'faction', 'location', 'system', 'artifact'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const entity = getEntity(id);
  if (!entity) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ entity });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateEntity>[1] = {};
  if (typeof body?.type === 'string' && TYPES.includes(body.type as EntityType)) patch.type = body.type as EntityType;
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body?.aliases)) patch.aliases = body.aliases.filter((a): a is string => typeof a === 'string');
  if (body?.fields && typeof body.fields === 'object') patch.fields = body.fields as Record<string, unknown>;
  if (typeof body?.description === 'string') patch.description = body.description;
  if (Array.isArray(body?.rules)) patch.rules = body.rules.filter((r): r is string => typeof r === 'string');
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const entity = updateEntity(id, patch);
  if (!entity) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ entity });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

Create `app/api/entities/[id]/timeline/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { addTimelineEntry, getEntity, listTimeline } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  return NextResponse.json({ timeline: listTimeline(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getEntity(id)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const entry = addTimelineEntry(id, {
    chapterId: typeof body?.chapterId === 'string' ? body.chapterId : null,
    change: body?.change && typeof body.change === 'object' ? body.change as Record<string, unknown> : {},
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ entry }, { status: 201 });
}
```

- [ ] **Step 2: 实现实体表单弹窗**

Create `components/workspace/EntityForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Entity, EntityTimelineEntry, EntityType } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const TYPES: { value: EntityType; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'faction', label: '阵营势力' },
  { value: 'location', label: '地点' },
  { value: 'system', label: '功法/体系' },
  { value: 'artifact', label: '道具/宝物' },
];

interface Props {
  projectId: string;
  entity: Entity | null;
  onClose: () => void;
  onSaved: () => void;
}

function parseChange(text: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const part of text.split(/[,，]/)) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key && value) obj[key] = value;
  }
  return obj;
}

function formatChange(change: Record<string, unknown>): string {
  return Object.entries(change).map(([k, v]) => `${k}=${String(v)}`).join(', ');
}

export default function EntityForm({ projectId, entity, onClose, onSaved }: Props) {
  const [type, setType] = useState<EntityType>(entity?.type ?? 'character');
  const [name, setName] = useState(entity?.name ?? '');
  const [aliasesText, setAliasesText] = useState((entity?.aliases ?? []).join('，'));
  const [description, setDescription] = useState(entity?.description ?? '');
  const [fieldRows, setFieldRows] = useState<{ key: string; value: string }[]>(
    Object.entries(entity?.fields ?? {}).map(([k, v]) => ({ key: k, value: String(v) })),
  );
  const [rulesText, setRulesText] = useState((entity?.rules ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: timelineData, mutate: mutateTimeline } = useSWR<{ timeline: EntityTimelineEntry[] }>(
    entity ? `/api/entities/${entity.id}/timeline` : null,
    fetcher,
  );
  const [changeText, setChangeText] = useState('');
  const [note, setNote] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('名称不能为空');
      return;
    }
    const fields: Record<string, unknown> = {};
    for (const row of fieldRows) {
      if (row.key.trim()) fields[row.key.trim()] = row.value;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(entity ? `/api/entities/${entity.id}` : `/api/projects/${projectId}/entities`, {
        method: entity ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: name.trim(),
          aliases: aliasesText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          description,
          fields,
          rules: rulesText.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entity || !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await fetch(`/api/entities/${entity.id}`, { method: 'DELETE' });
    onSaved();
  }

  async function addTimeline() {
    if (!entity) return;
    const change = parseChange(changeText);
    if (Object.keys(change).length === 0) return;
    setBusy(true);
    try {
      await fetch(`/api/entities/${entity.id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change, note }),
      });
      setChangeText('');
      setNote('');
      await mutateTimeline();
    } finally {
      setBusy(false);
    }
  }

  const timeline = timelineData?.timeline ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{entity ? `编辑实体：${entity.name}` : '新建实体'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as EntityType)} className="rounded border border-gray-300 px-2 py-1">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
          </div>
          <label className="flex flex-col gap-1">
            别名（逗号分隔）
            <input value={aliasesText} onChange={(e) => setAliasesText(e.target.value)} placeholder="小砚，林兄" className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">
            描述
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="外貌、性格、动机……" className="rounded border border-gray-300 px-2 py-1" />
          </label>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">结构化状态（键 = 值）</span>
              <button onClick={() => setFieldRows((rows) => [...rows, { key: '', value: '' }])} className="text-blue-600">+ 字段</button>
            </div>
            {fieldRows.map((row, i) => (
              <div key={i} className="mt-1 flex gap-1">
                <input
                  value={row.key}
                  onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  placeholder="境界"
                  className="w-1/3 rounded border border-gray-300 px-2 py-1"
                />
                <input
                  value={row.value}
                  onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  placeholder="炼气三层"
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
                />
                <button onClick={() => setFieldRows((rows) => rows.filter((_, j) => j !== i))} className="text-gray-400">✕</button>
              </div>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            校验规则（每行一条，如：不可复活）
            <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} rows={2} className="rounded border border-gray-300 px-2 py-1" />
          </label>

          {entity && (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-xs font-medium text-gray-500">时间线（最近状态优先）</h4>
              <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-gray-600">
                {timeline.map((t) => (
                  <li key={t.id}>
                    <span className="font-medium">{formatChange(t.change)}</span>
                    {t.note ? ` · ${t.note}` : ''}
                    <span className="ml-1 text-gray-400">{new Date(t.createdAt).toLocaleString('zh-CN')}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-1">
                <input value={changeText} onChange={(e) => setChangeText(e.target.value)} placeholder="状态变更，如：境界=筑基, 伤势=恢复" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" className="w-24 rounded border border-gray-300 px-2 py-1 text-xs" />
                <button onClick={() => void addTimeline()} disabled={busy} className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50">加</button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-between">
          {entity ? (
            <button
              onClick={() => void remove()}
              disabled={busy}
              className={confirmDelete ? 'text-red-600' : 'text-red-500 hover:underline'}
            >
              {confirmDelete ? '确认删除?' : '删除实体'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
            <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 实现左栏实体档案馆**

Create `components/workspace/EntityPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import EntityForm from './EntityForm';
import type { Entity, EntityType } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const TYPE_LABELS: Record<EntityType, string> = {
  character: '人物',
  faction: '阵营势力',
  location: '地点',
  system: '功法/体系',
  artifact: '道具/宝物',
};

export default function EntityPanel({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const entities = data?.entities ?? [];
  const groups = Object.keys(TYPE_LABELS) as EntityType[];

  return (
    <div className="mt-6 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-500">实体档案馆</h3>
        <button onClick={() => setEditing('new')} className="text-blue-600">+ 实体</button>
      </div>
      {groups.map((type) => {
        const list = entities.filter((e) => e.type === type);
        if (list.length === 0) return null;
        return (
          <div key={type} className="mt-2">
            <div className="text-xs text-gray-400">{TYPE_LABELS[type]}（{list.length}）</div>
            {list.map((e) => (
              <button key={e.id} onClick={() => setEditing(e)} className="block w-full truncate py-0.5 pl-3 text-left text-gray-700 hover:bg-gray-100">
                {e.name}
              </button>
            ))}
          </div>
        );
      })}
      {entities.length === 0 && <p className="mt-1 text-xs text-gray-300">暂无实体，点「+ 实体」创建（AI 上下文 L3 层依赖实体卡）。</p>}
      {editing && (
        <EntityForm
          projectId={projectId}
          entity={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 在侧栏接入实体面板**

Modify `components/workspace/Sidebar.tsx`：在 import 区加入：

```tsx
import EntityPanel from './EntityPanel';
```

并把原来的占位块：

```tsx
      <div className="mt-6 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-medium text-gray-400">实体档案馆</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
        <h3 className="mt-3 text-xs font-medium text-gray-400">伏笔跟踪</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
      </div>
```

替换为：

```tsx
      <EntityPanel projectId={projectId} />
      <div className="mt-6 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-medium text-gray-400">伏笔跟踪</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
      </div>
```

- [ ] **Step 5: 验证**

Run: `npm run lint`，Expected: 通过。

保持 `npm run dev`，curl 验证（把 `$projId` 换成任一项目 id）：

```powershell
curl.exe -s -X POST "http://localhost:3000/api/projects/$projId/entities" -H "Content-Type: application/json" -d '{"type":"character","name":"LinYan","aliases":["XiaoYan"],"fields":{"level":"qi-1"},"description":"swordsman","rules":["no revive"]}'
curl.exe -s "http://localhost:3000/api/projects/$projId/entities"
```

Expected: 创建 `201`，列表返回带 `aliases/fields` 数组与对象的实体。

- [ ] **Step 6: Commit**

```bash
git add app/api/projects app/api/entities components/workspace/EntityPanel.tsx components/workspace/EntityForm.tsx components/workspace/Sidebar.tsx
git commit -m "feat: 实体 API 与实体档案馆"
```

### Task 10: AI 伴写/重写 SSE 路由与采纳日志

**Files:**
- Create: `app/api/ai/ghostwrite/route.ts`、`app/api/ai/rewrite/route.ts`、`app/api/ai-requests/[id]/accept/route.ts`、`app/api/chapters/[id]/ai-requests/route.ts`

- [ ] **Step 1: 实现伴写路由（三分支 SSE）**

Create `app/api/ai/ghostwrite/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext, buildGhostwriteMessages } from '@/lib/ai/context';
import { GHOST_BRANCHES } from '@/lib/ai/prompts';
import { AIError, getAIConfig, streamChat } from '@/lib/ai/provider';
import { createAIRequest } from '@/lib/db/aiRequests';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });

  try {
    const config = await getAIConfig();
    const ctx = await assembleContext({ projectId: chapter.projectId, chapterId, before, after });
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'ghostwrite', model: config.model, prompt: before.slice(-500) });
    const streams = await Promise.all(GHOST_BRANCHES.map((b) => streamChat({ messages: buildGhostwriteMessages(ctx, b, before, after) })));

    const encoder = new TextEncoder();
    let finished = 0;
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', requestId: request.id })}\n\n`));
        streams.forEach((s, branch) => {
          void (async () => {
            const reader = s.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', branch, text: value })}\n\n`));
              }
            } catch (err) {
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', branch, message: String((err as Error).message) })}\n\n`));
            } finally {
              finished += 1;
              ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', branch })}\n\n`));
              if (finished === streams.length) ctrl.close();
            }
          })();
        });
      },
      cancel() {
        streams.forEach((s) => void s.cancel());
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 实现重写路由（单流 SSE）**

Create `app/api/ai/rewrite/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext, buildRewriteMessages } from '@/lib/ai/context';
import { REWRITE_MODES, type RewriteMode } from '@/lib/ai/prompts';
import { AIError, getAIConfig, streamChat } from '@/lib/ai/provider';
import { createAIRequest } from '@/lib/db/aiRequests';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const mode = body?.mode as RewriteMode;
  const selected = typeof body?.selected === 'string' ? body.selected : '';
  const before = typeof body?.before === 'string' ? body.before : '';
  const after = typeof body?.after === 'string' ? body.after : '';
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  if (!(mode in REWRITE_MODES)) return NextResponse.json({ error: '不支持的润色模式' }, { status: 400 });
  if (!selected.trim()) return NextResponse.json({ error: '请先选中要处理的文本' }, { status: 400 });
  const chapter = getChapter(chapterId);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });

  try {
    const config = await getAIConfig();
    const ctx = await assembleContext({ projectId: chapter.projectId, chapterId, before: before || selected, after });
    const request = createAIRequest({ projectId: chapter.projectId, chapterId, kind: 'rewrite', model: config.model, prompt: selected.slice(0, 500) });
    const stream = await streamChat({ messages: buildRewriteMessages(ctx, mode, selected) });

    const encoder = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', requestId: request.id })}\n\n`));
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', branch: 0, text: value })}\n\n`));
          }
        } catch (err) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', branch: 0, message: String((err as Error).message) })}\n\n`));
        } finally {
          ctrl.enqueue(encoder.encode('data: {"type":"done","branch":0}\n\n'));
          ctrl.close();
        }
      },
      cancel() {
        void stream.cancel();
      },
    });
    return new Response(out, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
    });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 实现采纳与日志路由**

Create `app/api/ai-requests/[id]/accept/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { markAccepted } from '@/lib/db/aiRequests';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!markAccepted(id, true)) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

Create `app/api/chapters/[id]/ai-requests/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { listByChapter } from '@/lib/db/aiRequests';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ requests: listByChapter(id) });
}
```

- [ ] **Step 4: 验证**

Run: `npm run lint`，Expected: 通过。

用 mock 模式启动 dev：`$env:INKPULSE_AI_MOCK='1'; npm run dev`，然后：

```powershell
curl.exe -s -N -X POST http://localhost:3000/api/ai/ghostwrite -H "Content-Type: application/json" -d '{"chapterId":"<某章节id>","before":"林砚按住刀柄","after":""}'
curl.exe -s -N -X POST http://localhost:3000/api/ai/rewrite -H "Content-Type: application/json" -d '{"chapterId":"<某章节id>","mode":"pace","selected":"他慢慢地走向门口，然后停了下来。","before":"","after":""}'
```

Expected: 两条都是 `text/event-stream`，依次输出 meta → 三条/一条 delta → done。

- [ ] **Step 5: Commit**

```bash
git add app/api/ai app/api/ai-requests "app/api/chapters/[id]/ai-requests"
git commit -m "feat: AI 伴写/重写 SSE 路由与采纳日志"
```

### Task 11: 编辑器 AI 接线与光标浮层

**Files:**
- Create: `lib/useAIStream.ts`、`components/workspace/AIOverlay.tsx`
- Modify: `components/workspace/ChapterEditor.tsx`（整体替换）

- [ ] **Step 1: 实现 SSE 消费 hook**

Create `lib/useAIStream.ts`:

```ts
import { useCallback, useRef, useState } from 'react';

export interface BranchState {
  id: string;
  label: string;
  text: string;
  done: boolean;
}

export interface AIStreamState {
  kind: 'ghostwrite' | 'rewrite' | null;
  requestId: string | null;
  branches: BranchState[];
  loading: boolean;
  error: string | null;
}

const IDLE: AIStreamState = { kind: null, requestId: null, branches: [], loading: false, error: null };

export function useAIStream() {
  const [state, setState] = useState<AIStreamState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const lastRef = useRef<{ url: string; body: unknown; kind: 'ghostwrite' | 'rewrite'; labels: string[] } | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((s) => ({ ...s, loading: false }));
  }, []);

  const clear = useCallback(() => setState(IDLE), []);

  const run = useCallback(async (url: string, body: unknown, kind: 'ghostwrite' | 'rewrite', labels: string[]) => {
    lastRef.current = { url, body, kind, labels };
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({
      kind,
      requestId: null,
      branches: labels.map((label, id) => ({ id: String(id), label, text: '', done: false })),
      loading: true,
      error: null,
    });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `请求失败（${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          let event: { type: string; branch?: number; text?: string; requestId?: string; message?: string };
          try {
            event = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }
          setState((s) => {
            if (event.type === 'meta' && event.requestId) return { ...s, requestId: event.requestId };
            if (event.type === 'delta' && typeof event.branch === 'number') {
              const branches = s.branches.map((b, i) => (i === event.branch ? { ...b, text: b.text + (event.text ?? '') } : b));
              return { ...s, branches };
            }
            if (event.type === 'done' && typeof event.branch === 'number') {
              const branches = s.branches.map((b, i) => (i === event.branch ? { ...b, done: true } : b));
              return { ...s, branches, loading: !branches.every((b) => b.done) };
            }
            if (event.type === 'error') return { ...s, error: s.error ?? event.message ?? '生成失败', loading: false };
            return s;
          });
        }
      }
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    } finally {
      controllerRef.current = null;
    }
  }, []);

  const retry = useCallback(() => {
    const last = lastRef.current;
    if (!last) return;
    void run(last.url, last.body, last.kind, last.labels);
  }, [run]);

  return { state, run, cancel, clear, retry };
}
```

- [ ] **Step 2: 实现光标浮层**

Create `components/workspace/AIOverlay.tsx`:

```tsx
'use client';

import type { AIStreamState } from '@/lib/useAIStream';

interface Props {
  position: { x: number; y: number };
  state: AIStreamState;
  onInsert: (index: number) => void;
  onReplace: (index: number) => void;
  onClose: () => void;
  onRetry: () => void;
}

export default function AIOverlay({ position, state, onInsert, onReplace, onClose, onRetry }: Props) {
  const isRewrite = state.kind === 'rewrite';
  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
      style={{ left: Math.max(8, position.x), top: Math.max(8, position.y) }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-gray-500">{isRewrite ? 'AI 润色建议' : '三条续写方向'}</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">✕</button>
      </div>
      {state.error && (
        <div className="mt-1 flex items-center justify-between rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          <span>{state.error}</span>
          <button onClick={onRetry} className="ml-2 shrink-0 text-blue-600 underline">重试</button>
        </div>
      )}
      <div className="mt-1 max-h-80 space-y-2 overflow-y-auto">
        {state.branches.map((b, i) => (
          <div key={b.id} className="rounded border border-gray-100 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-600">{b.label}</span>
              {!b.done && <span className="text-xs text-amber-500">生成中…</span>}
            </div>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-gray-700">{b.text || '…'}</p>
            <div className="mt-1 flex gap-2 text-xs">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(i)}
                disabled={!b.text}
                className="text-blue-600 hover:underline disabled:text-gray-300"
              >
                插入
              </button>
              {isRewrite && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onReplace(i)}
                  disabled={!b.text}
                  className="text-emerald-600 hover:underline disabled:text-gray-300"
                >
                  替换选中
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 重写章节编辑器并接线**

Replace `components/workspace/ChapterEditor.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseDoc, serializeDoc, type Doc } from '@/lib/markdown';
import { GHOST_BRANCHES, REWRITE_MODES, type RewriteMode } from '@/lib/ai/prompts';
import { useAIStream } from '@/lib/useAIStream';
import AIOverlay from './AIOverlay';

interface Props {
  chapterId: string;
  title: string;
  initialContent: string;
  onChange: (md: string) => void;
}

const MENU_ACTIONS: { key: string; label: string; mode: RewriteMode | null }[] = [
  { key: 'expand', label: '扩写', mode: 'expand' },
  { key: 'senses', label: '五感', mode: 'senses' },
  { key: 'pace', label: '节奏', mode: 'pace' },
  { key: 'mood', label: '意境', mode: 'mood' },
  { key: 'check', label: '诊断', mode: null },
];

export default function ChapterEditor({ chapterId, title, initialContent, onChange }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [rewriteMode, setRewriteMode] = useState<RewriteMode | null>(null);
  const replaceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ai = useAIStream();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const ghostRef = useRef<() => void>(() => {});
  const adoptRef = useRef<(index: number) => void>(() => {});

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: '开始写作……（Alt+/ 触发续写，Tab 采纳第一条）' }),
      ],
      content: parseDoc(initialContent) as unknown as JSONContent,
      editorProps: {
        attributes: {
          class: 'px-8 py-6 focus:outline-none',
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Tab' && aiRef.current.state.branches.some((b) => b.done)) {
            event.preventDefault();
            adoptRef.current(0);
            return true;
          }
          if (event.altKey && event.key === '/') {
            event.preventDefault();
            ghostRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => {
        onChangeRef.current(serializeDoc(e.getJSON() as unknown as Doc));
      },
      onSelectionUpdate: ({ editor: e }) => {
        const { from, to, empty } = e.state.selection;
        if (empty || from === to) {
          setMenu(null);
          return;
        }
        const rect = e.view.coordsAtPos(to);
        setMenu({ x: rect.left, y: rect.top - 44 });
      },
      onBlur: () => setMenu(null),
    },
    [],
  );

  function cursorContext(e: Editor) {
    const from = e.state.selection.from;
    return {
      before: e.state.doc.textBetween(0, from, '\n', ' ').slice(-2000),
      after: e.state.doc.textBetween(from, e.state.doc.content.size, '\n', ' ').slice(0, 300),
    };
  }

  function selectionContext(e: Editor) {
    const { from, to } = e.state.selection;
    return {
      selected: e.state.doc.textBetween(from, to, '\n', ' '),
      before: e.state.doc.textBetween(0, from, '\n', ' ').slice(-2000),
      after: e.state.doc.textBetween(to, e.state.doc.content.size, '\n', ' ').slice(0, 300),
    };
  }

  function triggerGhostwrite() {
    if (!editor) return;
    const { before, after } = cursorContext(editor);
    const rect = editor.view.coordsAtPos(editor.state.selection.from);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/ghostwrite', { chapterId, before, after }, 'ghostwrite', GHOST_BRANCHES.map((b) => b.label));
  }

  function triggerRewrite(mode: RewriteMode) {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const ctx = selectionContext(editor);
    replaceRangeRef.current = { from, to };
    setRewriteMode(mode);
    const rect = editor.view.coordsAtPos(to);
    setOverlayPos({ x: rect.left, y: rect.bottom + 8 });
    void ai.run('/api/ai/rewrite', { chapterId, mode, ...ctx }, 'rewrite', [REWRITE_MODES[mode].label]);
  }

  function adopt(index: number) {
    if (!editor) return;
    const text = aiRef.current.state.branches[index]?.text;
    if (!text) return;
    if (rewriteMode && replaceRangeRef.current) {
      editor.chain().focus().insertContentAt(replaceRangeRef.current, text).run();
    } else {
      editor.chain().focus().insertContent(text).run();
    }
    if (aiRef.current.state.requestId) {
      void fetch(`/api/ai-requests/${aiRef.current.state.requestId}/accept`, { method: 'POST' })
        .then(() => window.dispatchEvent(new Event('ai:adopted')));
    }
    closeOverlay();
  }

  function closeOverlay() {
    ai.clear();
    setOverlayPos(null);
    setRewriteMode(null);
    replaceRangeRef.current = null;
  }

  ghostRef.current = triggerGhostwrite;
  adoptRef.current = adopt;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-gray-100 px-8 py-3 text-center">
        <h2 className="font-medium">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {editor ? <EditorContent editor={editor} className="h-full" /> : null}
      </div>
      {menu && (
        <div
          className="fixed z-50 flex gap-1 rounded-md border border-gray-200 bg-white px-1 py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          {MENU_ACTIONS.map((a) =>
            a.mode ? (
              <button
                key={a.key}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => triggerRewrite(a.mode!)}
                className="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {a.label}
              </button>
            ) : (
              <button
                key={a.key}
                disabled
                title="M3 启用"
                className="cursor-not-allowed rounded px-2 py-1 text-xs text-gray-400"
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
      {overlayPos && (
        <AIOverlay
          position={overlayPos}
          state={ai.state}
          onInsert={adopt}
          onReplace={adopt}
          onClose={closeOverlay}
          onRetry={ai.retry}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 验证**

Run: `npm run lint`，Expected: 通过。

mock 模式浏览器验证：打开任一章节，光标停在正文中间按 `Alt+/`，应出现三条方向并流式滚动「生成中…」；点「插入」或等完成后按 `Tab`，正文末尾插入文本并触发自动保存；选中一段文字 → 点「节奏」，浮层出现建议，点「替换选中」原文被替换。

- [ ] **Step 5: Commit**

```bash
git add lib/useAIStream.ts components/workspace/AIOverlay.tsx components/workspace/ChapterEditor.tsx
git commit -m "feat: 编辑器 AI 接线与光标三分支浮层"
```

### Task 12: 右栏 AI 建议历史

**Files:**
- Modify: `components/workspace/InspectorPanel.tsx`、`components/workspace/WorkspaceShell.tsx`（传 chapterId）

- [ ] **Step 1: 接入历史与采纳事件**

Modify `components/workspace/InspectorPanel.tsx`：

imports 增加：

```tsx
import { useEffect, useState } from 'react';
import type { AIRequest, ChapterSnapshot, ChapterWithVolume } from '@/lib/types';
```

组件内新增：

```tsx
  const { data: requestsData, mutate: mutateRequests } = useSWR<{ requests: AIRequest[] }>(
    chapter ? `/api/chapters/${chapter.id}/ai-requests` : null,
    fetcher,
  );

  useEffect(() => {
    const handler = () => void mutateRequests();
    window.addEventListener('ai:adopted', handler);
    return () => window.removeEventListener('ai:adopted', handler);
  }, [mutateRequests]);
```

在「版本快照」section 与占位 section 之间插入：

```tsx
      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">AI 建议历史</h3>
        {(requestsData?.requests ?? []).length === 0 && <p className="mt-1 text-xs text-gray-400">暂无记录</p>}
        <ul className="mt-1 space-y-1">
          {(requestsData?.requests ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between text-xs text-gray-600">
              <span>{kindLabel(r.kind)} · {r.model}</span>
              <span className={r.accepted ? 'text-emerald-600' : 'text-gray-400'}>{r.accepted ? '已采纳' : '未采纳'}</span>
            </li>
          ))}
        </ul>
      </section>
```

文件底部加：

```tsx
function kindLabel(kind: string): string {
  if (kind === 'ghostwrite') return '伴写';
  if (kind === 'rewrite') return '润色';
  return kind;
}
```

Modify `components/workspace/WorkspaceShell.tsx`：给 `ChapterEditor` 传 `chapterId={current.id}`。

- [ ] **Step 2: 验证**

Run: `npm run lint`，Expected: 通过。mock 模式下做一次「Alt+/ → Tab 采纳」，右栏「AI 建议历史」应出现一条「伴写 · deepseek-chat / 已采纳」。

- [ ] **Step 3: Commit**

```bash
git add components/workspace/InspectorPanel.tsx components/workspace/WorkspaceShell.tsx
git commit -m "feat: 右栏 AI 建议历史与采纳标记"
```

### Task 13: 全量验收与收尾

**Files:** 无新增。

- [ ] **Step 1: 测试与静态检查**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: `npm test` 全部 PASS（新增设置 2、实体 3、日志 1、检索 4、Provider 5、上下文 3，共 52 个用例）；lint 通过；build 成功。

- [ ] **Step 2: mock 模式手工验收清单**

以 `$env:INKPULSE_AI_MOCK='1'` 重启 `npm run dev`，逐项确认：

- [ ] 右上角「设置」可改 baseUrl/model，密钥留空时点 AI 会提示未配置（mock 模式下不提示，直接出模拟结果）。
- [ ] 左栏可新建/编辑/删除实体卡（含别名、结构化字段、校验规则、时间线变更）。
- [ ] 光标处 `Alt+/` 出现三条方向流式输出；`Tab` 采纳第一条并写入正文与历史（已采纳）。
- [ ] 选中文本 → 悬浮菜单「扩写/五感/节奏/意境」可用，「诊断」置灰提示 M3；点「替换选中」后原文被替换。
- [ ] 刷新后正文、实体、AI 历史均持久化。

- [ ] **Step 3: 真实密钥联调（用户执行，可后置）**

在「设置」填入 DeepSeek API Key（或设置 `INKPULSE_AI_API_KEY`），去掉 mock 变量后重启，确认伴写/润色输出为真实中文续写；未配置密钥时点 AI 给出明确提示而非报错崩溃。

- [ ] **Step 4: 清理与提交**

停 dev；`git status --short` 确认 `data/`、`.next/`、`node_modules/` 未入库；然后：

```bash
git add -A
git commit -m "docs: M2 完成验收记录"
```

## M2 完成标准（DoD）

1. `npm test`、`npm run lint`、`npm run build` 三项全绿（有输出为证）。
2. mock 模式手工验收清单全部通过；真实密钥联调给出明确结果（可后置）。
3. 每个 Task 均有独立提交，工作区干净。
4. 一致性校验、关系图谱、伏笔看板仍明确标注为 M3，不虚假宣称完成。
