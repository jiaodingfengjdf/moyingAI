# M1 基础工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付墨影 AI 的 M1 基础工作台：本地可运行的项目/卷/章三级管理、三栏写作界面、TipTap Markdown 编辑器、500ms 防抖自动保存与章节快照对比/回滚（本里程碑不接 AI）。

**Architecture:** Next.js 15 App Router 单体应用。服务端用 Node 内置 `node:sqlite`（零原生依赖）做持久化，REST API 路由提供 CRUD；客户端用 React + Tailwind CSS + SWR，编辑器用 TipTap v3，正文以自定义 Markdown 子集序列化后存入 SQLite。

**Tech Stack:** Next.js 15.5 + React 19 + TypeScript + Tailwind CSS v4 + node:sqlite + TipTap 3.31 + SWR 2.5 + diff 9 + Vitest

---

## 前置事实与版本决策（本机已验证）

- Node v24.11.1、npm 可用；`node:sqlite` 已验证可用：`DatabaseSync` 支持 `exec/prepare/get/all/run`，`PRAGMA user_version` 可通过 `prepare().get()` 读取，FTS5 可用（启动时有一条无害的 ExperimentalWarning）。
- 依赖版本以当前 registry 实际值为准并锁定主版本：Next 15.5（用 `create-next-app@15`，不追 Next 16 以规避脚手架差异）、TipTap 3.31、SWR 2.5、diff 9。
- 存储决定：使用 `node:sqlite` 而非 better-sqlite3，避免 Windows 原生编译风险；数据库文件默认 `./data/app.db`，可用环境变量 `INKPULSE_DATA_DIR` 重定向（测试用 `:memory:`）。
- 状态管理决定：服务端数据用 SWR；自动保存用自研可测控制器 `AutosaveController`（不引入 zustand，M1 无跨组件交互态需求）。
- 命名与约定：所有新增业务代码用相对导入（lib 内互引、组件引 lib），API 路由与页面可用 `@/*` 别名；中文 UI 文案；每个任务独立提交。

## 文件结构（本计划将创建/修改的全部文件）

```
app/
├─ layout.tsx                      (Modify) 站点元信息、lang="zh-CN"
├─ globals.css                     (Modify) Tailwind 与 ProseMirror 基础排版
├─ page.tsx                        (Replace) 项目列表页
├─ projects/[id]/page.tsx          (Create) 工作台页（async params）
└─ api/
   ├─ projects/route.ts            (Create) GET 列表 / POST 创建
   ├─ projects/[id]/route.ts       (Create) GET / PATCH / DELETE
   ├─ projects/[id]/volumes/route.ts  (Create) GET 列表 / POST 创建
   ├─ projects/[id]/chapters/route.ts (Create) GET 列表 / POST 创建
   ├─ volumes/[id]/route.ts        (Create) GET / PATCH / DELETE
   ├─ chapters/[id]/route.ts       (Create) GET / PATCH / DELETE
   ├─ chapters/[id]/snapshots/route.ts (Create) GET 列表 / POST 创建
   ├─ snapshots/[id]/route.ts      (Create) GET / DELETE
   └─ snapshots/[id]/restore/route.ts  (Create) POST 回滚
components/
├─ ProjectList.tsx                 (Create) 项目列表与创建/删除
└─ workspace/
   ├─ WorkspaceShell.tsx           (Create) 三栏布局与状态编排
   ├─ Sidebar.tsx                  (Create) 左侧目录树
   ├─ ChapterEditor.tsx            (Create) TipTap 编辑器 + 选中悬浮菜单
   ├─ InspectorPanel.tsx           (Create) 右栏：字数/保存状态/快照
   └─ SnapshotDiff.tsx             (Create) 快照对比视图
lib/
├─ types.ts                        (Create) 共享类型
├─ db/
│  ├─ schema.ts                    (Create) 迁移 DDL
│  ├─ client.ts                    (Create) 连接/迁移/单例
│  ├─ id.ts                        (Create) createId()
│  ├─ projects.ts                  (Create) 项目仓库
│  ├─ volumes.ts                   (Create) 卷仓库
│  ├─ chapters.ts                  (Create) 章仓库
│  └─ snapshots.ts                 (Create) 快照仓库
├─ markdown.ts                     (Create) Markdown 子集序列化/解析
├─ wordCount.ts                    (Create) 字数统计
├─ autosave.ts                     (Create) 可测的防抖保存控制器
├─ useAutosave.ts                  (Create) React 封装 hook
└─ client.test.ts / markdown.test.ts / wordCount.test.ts / autosave.test.ts / db/*.test.ts (Create)
vitest.config.ts                   (Create)
package.json                       (Modify) test 脚本
```

## 任务分解

### Task 1: 脚手架与依赖

**Files:**
- Create: Next.js 工程（package.json、app/、public/、tsconfig 等）、vitest.config.ts
- Modify: package.json（test 脚本）

- [ ] **Step 1: 在子目录生成脚手架（跳过安装）**

Run:

```powershell
npx create-next-app@15 moying-ai-app --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes --skip-install
```

Expected: 生成 `moying-ai-app/`，包含 app/、public/、tsconfig.json、package.json、next.config.ts 等文件。

- [ ] **Step 2: 合并到项目根目录（保留我们已有的 .gitignore）**

Run:

```powershell
if (Test-Path 'moying-ai-app\.git') { Remove-Item -LiteralPath 'moying-ai-app\.git' -Recurse -Force }
Remove-Item -LiteralPath 'moying-ai-app\.gitignore' -Force
Get-ChildItem -Force 'moying-ai-app' | Move-Item -Destination '.' -Force
$target = (Resolve-Path 'moying-ai-app').Path
if ($target -ne 'C:\Users\ASUS\Desktop\墨影 AI\moying-ai-app') { throw "路径校验失败: $target" }
Remove-Item -LiteralPath 'moying-ai-app' -Force
```

Expected: 根目录出现 package.json、app/ 等；`moying-ai-app/` 被移除；根目录 `.gitignore` 未被覆盖。

- [ ] **Step 3: 安装运行时与开发依赖**

Run:

```powershell
npm install
npm install swr diff @tiptap/core@^3.31.2 @tiptap/react@^3.31.2 @tiptap/starter-kit@^3.31.2 @tiptap/extension-placeholder@^3.31.2
npm install -D vitest
```

Expected: 安装成功、无错误输出。

- [ ] **Step 4: 配置测试脚本与 Vitest**

Run:

```powershell
npm pkg set scripts.test="vitest run"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: 基础验证**

Run: `npm run lint`

Expected: 通过（脚手架自带规则，无报错）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: 初始化 Next.js 脚手架与依赖"
```

### Task 2: 数据库连接、迁移与共享类型

**Files:**
- Create: `lib/db/schema.ts`、`lib/db/client.ts`、`lib/db/id.ts`、`lib/types.ts`
- Test: `lib/db/client.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/client.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { openDatabase } from './client';

const TABLES = [
  'project', 'volume', 'chapter', 'chapter_snapshot', 'entity',
  'entity_timeline', 'relationship', 'foreshadowing', 'ai_request', 'setting',
];

describe('migrations', () => {
  it('创建全部表并把 user_version 设为 1', () => {
    const db = openDatabase(':memory:');
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const names = new Set(rows.map((r) => r.name));
    for (const table of TABLES) {
      expect(names.has(table), `缺少表 ${table}`).toBe(true);
    }
    const uv = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(uv.user_version).toBe(1);
    db.close();
  });

  it('对文件路径创建父目录', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('SELECT 1 AS ok').get()).toEqual({ ok: 1 });
    db.close();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/client.test.ts`

Expected: FAIL（`Cannot find module './client'`）。

- [ ] **Step 3: 实现 schema、client 与 id**

Create `lib/db/schema.ts`:

```ts
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    penName TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS volume (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chapter (
    id TEXT PRIMARY KEY,
    volumeId TEXT NOT NULL REFERENCES volume(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    outline TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    wordCount INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chapter_snapshot (
    id TEXT PRIMARY KEY,
    chapterId TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    label TEXT,
    branchId TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entity (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    fields TEXT NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    rules TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS entity_timeline (
    id TEXT PRIMARY KEY,
    entityId TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
    chapterId TEXT,
    change TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS relationship (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    fromEntityId TEXT NOT NULL,
    toEntityId TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    strength INTEGER NOT NULL DEFAULT 0,
    chapterAnchorId TEXT,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS foreshadowing (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planting',
    plantChapterId TEXT,
    simmerRangeStart INTEGER,
    simmerRangeEnd INTEGER,
    payoffChapterId TEXT,
    relatedEntityIds TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_request (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    chapterId TEXT,
    kind TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    accepted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS setting (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_volume_project ON volume(projectId, "order");
  CREATE INDEX IF NOT EXISTS idx_chapter_volume ON chapter(volumeId, "order");
  CREATE INDEX IF NOT EXISTS idx_snapshot_chapter ON chapter_snapshot(chapterId, version);
  `,
];
```

Create `lib/db/id.ts`:

```ts
import { randomUUID } from 'node:crypto';

export function createId(): string {
  return randomUUID();
}
```

Create `lib/db/client.ts`:

```ts
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './schema';

export type DB = DatabaseSync;

let sharedDb: DB | null = null;

export function resolveDbPath(): string {
  const dir = process.env.INKPULSE_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, 'app.db');
}

export function applyMigrations(db: DB): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  let version = Number(row?.user_version ?? 0);
  for (; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDatabase(dbPath: string = resolveDbPath()): DB {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(db);
  return db;
}

export function getDb(): DB {
  if (!sharedDb) sharedDb = openDatabase();
  return sharedDb;
}
```

Create `lib/types.ts`:

```ts
export type EntityType = 'character' | 'faction' | 'location' | 'system' | 'artifact';
export type ChapterStatus = 'draft' | 'final';
export type ForeshadowingStatus = 'planting' | 'simmering' | 'payoff';

export interface Project {
  id: string;
  title: string;
  penName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithCounts extends Project {
  volumeCount: number;
  chapterCount: number;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  content: string;
  outline: string;
  status: ChapterStatus;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterWithVolume extends Chapter {
  projectId: string;
  volumeTitle: string;
}

export interface ChapterSnapshot {
  id: string;
  chapterId: string;
  version: number;
  content: string;
  label: string | null;
  branchId: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/client.test.ts`

Expected: PASS（2 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/client.ts lib/db/id.ts lib/types.ts lib/db/client.test.ts
git commit -m "feat: 数据库连接、迁移与共享类型"
```

### Task 3: 项目数据仓库（CRUD）

**Files:**
- Create: `lib/db/projects.ts`
- Test: `lib/db/projects.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/projects.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/projects.test.ts`

Expected: FAIL（`Cannot find module './projects'`）。

- [ ] **Step 3: 实现项目仓库**

Create `lib/db/projects.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Project, ProjectWithCounts } from '../types';

const BASE = 'id, title, penName, description, createdAt, updatedAt';

export function listProjects(db: DB = getDb()): ProjectWithCounts[] {
  const rows = db.prepare(`
    SELECT p.id, p.title, p.penName, p.description, p.createdAt, p.updatedAt,
      (SELECT COUNT(*) FROM volume v WHERE v.projectId = p.id) AS volumeCount,
      (SELECT COUNT(*) FROM chapter c JOIN volume v ON c.volumeId = v.id WHERE v.projectId = p.id) AS chapterCount
    FROM project p ORDER BY p.updatedAt DESC
  `).all();
  return rows as unknown as ProjectWithCounts[];
}

export function getProject(id: string, db: DB = getDb()): Project | null {
  const row = db.prepare(`SELECT ${BASE} FROM project WHERE id = ?`).get(id);
  return (row as unknown as Project | undefined) ?? null;
}

export function createProject(
  input: { title: string; penName?: string; description?: string },
  db: DB = getDb(),
): Project {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO project (id, title, penName, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, input.title, input.penName ?? '', input.description ?? '', now, now);
  return getProject(id, db)!;
}

export function updateProject(
  id: string,
  patch: { title?: string; penName?: string; description?: string },
  db: DB = getDb(),
): Project | null {
  const current = getProject(id, db);
  if (!current) return null;
  db.prepare('UPDATE project SET title = ?, penName = ?, description = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.penName ?? current.penName, patch.description ?? current.description, new Date().toISOString(), id);
  return getProject(id, db)!;
}

export function deleteProject(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM project WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/projects.test.ts`

Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/projects.ts lib/db/projects.test.ts
git commit -m "feat: 项目数据仓库"
```

### Task 4: 卷数据仓库（CRUD）

**Files:**
- Create: `lib/db/volumes.ts`
- Test: `lib/db/volumes.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/volumes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume, deleteVolume, getVolume, listVolumes, updateVolume } from './volumes';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('volumes repo', () => {
  it('创建时自动递增排序并列出', () => {
    const p = createProject({ title: '书' }, db);
    const v1 = createVolume(p.id, { title: '卷一' }, db);
    const v2 = createVolume(p.id, { title: '卷二', summary: '本卷大纲' }, db);
    expect(v1.order).toBe(0);
    expect(v2.order).toBe(1);
    expect(v2.summary).toBe('本卷大纲');
    expect(listVolumes(p.id, db).map((v) => v.title)).toEqual(['卷一', '卷二']);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    expect(updateVolume(v.id, { title: '第一卷', summary: '大纲' }, db)?.title).toBe('第一卷');
    expect(getVolume(v.id, db)?.summary).toBe('大纲');
    expect(deleteVolume(v.id, db)).toBe(true);
    expect(deleteVolume(v.id, db)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/volumes.test.ts`

Expected: FAIL（`Cannot find module './volumes'`）。

- [ ] **Step 3: 实现卷仓库**

Create `lib/db/volumes.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Volume } from '../types';

const SELECT = 'SELECT id, projectId, title, summary, "order", createdAt, updatedAt FROM volume';

export function listVolumes(projectId: string, db: DB = getDb()): Volume[] {
  return db.prepare(`${SELECT} WHERE projectId = ? ORDER BY "order" ASC`).all(projectId) as unknown as Volume[];
}

export function getVolume(id: string, db: DB = getDb()): Volume | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as Volume | undefined) ?? null;
}

export function createVolume(projectId: string, input: { title: string; summary?: string }, db: DB = getDb()): Volume {
  const id = createId();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM volume WHERE projectId = ?').get(projectId) as { next: number };
  db.prepare('INSERT INTO volume (id, projectId, title, summary, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, input.title, input.summary ?? '', Number(row.next), now, now);
  return getVolume(id, db)!;
}

export function updateVolume(id: string, patch: { title?: string; summary?: string }, db: DB = getDb()): Volume | null {
  const current = getVolume(id, db);
  if (!current) return null;
  db.prepare('UPDATE volume SET title = ?, summary = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.summary ?? current.summary, new Date().toISOString(), id);
  return getVolume(id, db)!;
}

export function deleteVolume(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM volume WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/volumes.test.ts`

Expected: PASS（2 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/volumes.ts lib/db/volumes.test.ts
git commit -m "feat: 卷数据仓库"
```

### Task 5: 字数统计（wordCount）

**Files:**
- Create: `lib/wordCount.ts`
- Test: `lib/wordCount.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/wordCount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countWords } from './wordCount';

describe('countWords', () => {
  it('去掉空白后按字符计数', () => {
    expect(countWords('你好 world')).toBe(7);
  });

  it('空字符串为 0', () => {
    expect(countWords('')).toBe(0);
  });

  it('多行与全角标点按字符计入', () => {
    expect(countWords('第一段。\n\n第二段！')).toBe(8);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/wordCount.test.ts`

Expected: FAIL（`Cannot find module './wordCount'`）。

- [ ] **Step 3: 实现**

Create `lib/wordCount.ts`:

```ts
export function countWords(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/wordCount.test.ts`

Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/wordCount.ts lib/wordCount.test.ts
git commit -m "feat: 字数统计"
```

### Task 6: 章数据仓库（CRUD）

**Files:**
- Create: `lib/db/chapters.ts`
- Test: `lib/db/chapters.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/chapters.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, deleteChapter, getChapter, listChaptersByProject, updateChapter } from './chapters';
import { countWords } from '../wordCount';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('chapters repo', () => {
  it('创建时计算字数、携带卷信息列出', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '第一段\n\n第二段' }, db);
    expect(c.wordCount).toBe(countWords('第一段\n\n第二段'));
    expect(c.status).toBe('draft');
    const list = listChaptersByProject(p.id, db);
    expect(list).toHaveLength(1);
    expect(list[0].projectId).toBe(p.id);
    expect(list[0].volumeTitle).toBe('卷一');
  });

  it('章内排序递增', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c1 = createChapter(v.id, { title: '第一章' }, db);
    const c2 = createChapter(v.id, { title: '第二章' }, db);
    expect(c1.order).toBe(0);
    expect(c2.order).toBe(1);
  });

  it('更新内容重算字数、更新状态', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: '旧' }, db);
    const updated = updateChapter(c.id, { content: '新内容', status: 'final' }, db);
    expect(updated?.wordCount).toBe(3);
    expect(updated?.status).toBe('final');
  });

  it('删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    expect(deleteChapter(c.id, db)).toBe(true);
    expect(getChapter(c.id, db)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/chapters.test.ts`

Expected: FAIL（`Cannot find module './chapters'`）。

- [ ] **Step 3: 实现章仓库**

Create `lib/db/chapters.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import { countWords } from '../wordCount';
import type { ChapterStatus, ChapterWithVolume } from '../types';

const SELECT = `
  SELECT c.id, c.volumeId, c.title, c.content, c.outline, c.status, c.wordCount, c."order", c.createdAt, c.updatedAt,
    v.title AS volumeTitle, v.projectId
  FROM chapter c JOIN volume v ON c.volumeId = v.id
`;

export function listChaptersByProject(projectId: string, db: DB = getDb()): ChapterWithVolume[] {
  return db.prepare(`${SELECT} WHERE v.projectId = ? ORDER BY v."order" ASC, c."order" ASC`).all(projectId) as unknown as ChapterWithVolume[];
}

export function getChapter(id: string, db: DB = getDb()): ChapterWithVolume | null {
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  return (row as unknown as ChapterWithVolume | undefined) ?? null;
}

export function createChapter(
  volumeId: string,
  input: { title: string; content?: string; outline?: string },
  db: DB = getDb(),
) {
  const id = createId();
  const now = new Date().toISOString();
  const content = input.content ?? '';
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM chapter WHERE volumeId = ?').get(volumeId) as { next: number };
  db.prepare(`INSERT INTO chapter (id, volumeId, title, content, outline, status, wordCount, "order", createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, volumeId, input.title, content, input.outline ?? '', 'draft', countWords(content), Number(row.next), now, now);
  return getChapter(id, db)!;
}

export function updateChapter(
  id: string,
  patch: { title?: string; content?: string; outline?: string; status?: ChapterStatus },
  db: DB = getDb(),
): ChapterWithVolume | null {
  const current = getChapter(id, db);
  if (!current) return null;
  const content = patch.content ?? current.content;
  db.prepare('UPDATE chapter SET title = ?, content = ?, outline = ?, status = ?, wordCount = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, content, patch.outline ?? current.outline, patch.status ?? current.status, countWords(content), new Date().toISOString(), id);
  return getChapter(id, db)!;
}

export function deleteChapter(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM chapter WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/chapters.test.ts`

Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/chapters.ts lib/db/chapters.test.ts
git commit -m "feat: 章数据仓库"
```

### Task 7: 快照数据仓库（版本/回滚）

**Files:**
- Create: `lib/db/snapshots.ts`
- Test: `lib/db/snapshots.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/db/snapshots.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, updateChapter } from './chapters';
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshots';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('snapshots repo', () => {
  it('创建快照并递增版本号', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s1 = createSnapshot(c.id, { label: '第一版' }, db);
    expect(s1.version).toBe(1);
    expect(s1.content).toBe('v1');
    updateChapter(c.id, { content: 'v2' }, db);
    const s2 = createSnapshot(c.id, {}, db);
    expect(s2.version).toBe(2);
    expect(s2.content).toBe('v2');
    expect(listSnapshots(c.id, db).map((s) => s.version)).toEqual([2, 1]);
  });

  it('回滚前自动快照当前状态并恢复目标版本', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s1 = createSnapshot(c.id, {}, db);
    updateChapter(c.id, { content: 'v2' }, db);
    const restored = restoreSnapshot(s1.id, db);
    expect(restored?.content).toBe('v1');
    expect(restored?.wordCount).toBe(2);
    const list = listSnapshots(c.id, db);
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('回滚前自动快照');
    expect(list[0].content).toBe('v2');
  });

  it('删除快照', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章', content: 'v1' }, db);
    const s = createSnapshot(c.id, {}, db);
    expect(deleteSnapshot(s.id, db)).toBe(true);
    expect(deleteSnapshot(s.id, db)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/snapshots.test.ts`

Expected: FAIL（`Cannot find module './snapshots'`）。

- [ ] **Step 3: 实现快照仓库**

Create `lib/db/snapshots.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import { countWords } from '../wordCount';
import { getChapter } from './chapters';
import type { ChapterSnapshot } from '../types';

const SELECT = 'SELECT id, chapterId, version, content, label, branchId, createdAt FROM chapter_snapshot';

export function listSnapshots(chapterId: string, db: DB = getDb()): ChapterSnapshot[] {
  return db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY version DESC`).all(chapterId) as unknown as ChapterSnapshot[];
}

export function getSnapshot(id: string, db: DB = getDb()): ChapterSnapshot | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as ChapterSnapshot | undefined) ?? null;
}

export function createSnapshot(chapterId: string, input: { label?: string; branchId?: string }, db: DB = getDb()): ChapterSnapshot {
  const chapter = db.prepare('SELECT content FROM chapter WHERE id = ?').get(chapterId) as { content: string } | undefined;
  if (!chapter) throw new Error('章节不存在');
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM chapter_snapshot WHERE chapterId = ?').get(chapterId) as { next: number };
  const id = createId();
  db.prepare('INSERT INTO chapter_snapshot (id, chapterId, version, content, label, branchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, chapterId, Number(row.next), chapter.content, input.label ?? null, input.branchId ?? null, new Date().toISOString());
  return getSnapshot(id, db)!;
}

export function deleteSnapshot(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM chapter_snapshot WHERE id = ?').run(id).changes > 0;
}

export function restoreSnapshot(id: string, db: DB = getDb()) {
  const snap = getSnapshot(id, db);
  if (!snap) throw new Error('快照不存在');
  const chapter = db.prepare('SELECT content FROM chapter WHERE id = ?').get(snap.chapterId) as { content: string } | undefined;
  if (!chapter) throw new Error('章节不存在');
  // 回滚前保存当前状态，防止误操作无法恢复
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM chapter_snapshot WHERE chapterId = ?').get(snap.chapterId) as { next: number };
  db.prepare('INSERT INTO chapter_snapshot (id, chapterId, version, content, label, branchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(createId(), snap.chapterId, Number(row.next), chapter.content, '回滚前自动快照', null, new Date().toISOString());
  db.prepare('UPDATE chapter SET content = ?, wordCount = ?, updatedAt = ? WHERE id = ?')
    .run(snap.content, countWords(snap.content), new Date().toISOString(), snap.chapterId);
  return getChapter(snap.chapterId, db);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/db/snapshots.test.ts`

Expected: PASS（3 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/db/snapshots.ts lib/db/snapshots.test.ts
git commit -m "feat: 快照数据仓库"
```

### Task 8: Markdown 序列化与解析

**Files:**
- Create: `lib/markdown.ts`
- Test: `lib/markdown.test.ts`

功能边界：只覆盖小说写作所需子集——1~6 级标题、段落（含硬换行）、粗体/斜体/行内代码、无序/有序列表、分隔线、引用、代码块。块之间用空行分隔；列表项之间不空行。

- [ ] **Step 1: 写失败测试**

Create `lib/markdown.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/markdown.test.ts`

Expected: FAIL（`Cannot find module './markdown'`）。

- [ ] **Step 3: 实现**

Create `lib/markdown.ts`:

```ts
export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TextNode {
  type: 'text';
  text?: string;
  marks?: Mark[];
}

export interface HardBreakNode {
  type: 'hardBreak';
}

export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
}

export type Node = BlockNode | TextNode | HardBreakNode;

export interface Doc {
  type: 'doc';
  content?: Node[];
}

function children(node: Node): Node[] {
  return (node as BlockNode).content ?? [];
}

function inlineToText(node: Node): string {
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'text') {
    let text = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'code') text = '`' + text + '`';
    }
    return text;
  }
  return '';
}

function blockToString(node: Node): string {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      return `${'#'.repeat(level)} ${children(node).map(inlineToText).join('')}`;
    }
    case 'paragraph':
      return children(node).map(inlineToText).join('');
    case 'horizontalRule':
      return '---';
     case 'blockquote':
       return `> ${children(node).flatMap((child) => children(child).map(inlineToText)).join('')}`;
    case 'codeBlock':
      return '```\n' + children(node).map((n) => (n.type === 'text' ? (n.text ?? '') : '')).join('\n') + '\n```';
    case 'bulletList':
      return children(node).map((item) => `- ${children(item).map(inlineToText).join('')}`).join('\n');
    case 'orderedList':
      return children(node).map((item, i) => `${i + 1}. ${children(item).map(inlineToText).join('')}`).join('\n');
    default:
      return '';
  }
}

export function serializeDoc(doc: Doc): string {
  return (doc.content ?? []).map(blockToString).filter((s) => s !== '').join('\n\n');
}

function parseInline(text: string): Node[] {
  const nodes: Node[] = [];
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  const pushText = (t: string) => {
    if (t) nodes.push({ type: 'text', text: t });
  };
  let last = 0;
  for (const m of text.matchAll(regex)) {
    const index = m.index ?? 0;
    pushText(text.slice(last, index));
    if (m[1] !== undefined) nodes.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] });
    else if (m[3] !== undefined) nodes.push({ type: 'text', text: m[4], marks: [{ type: 'italic' }] });
    else nodes.push({ type: 'text', text: m[6], marks: [{ type: 'code' }] });
    last = index + m[0].length;
  }
  pushText(text.slice(last));
  return nodes;
}

function paragraphFromLines(lines: string[]): BlockNode {
  const content: Node[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    content.push(...parseInline(line));
  });
  return { type: 'paragraph', content };
}

export function parseDoc(md: string): Doc {
  const normalized = md.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { type: 'doc', content: [] };
  const content: Node[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^#{1,6}\s+/.test(lines[0])) {
      const level = lines[0].match(/^#{1,6}\s+/)?.[0].trim().length ?? 1;
      content.push({ type: 'heading', attrs: { level }, content: parseInline(lines[0].replace(/^#{1,6}\s+/, '')) });
    } else if (lines.every((l) => /^-\s+/.test(l))) {
      content.push({ type: 'bulletList', content: lines.map((l) => ({ type: 'listItem', content: parseInline(l.replace(/^-\s+/, '')) })) });
    } else if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      content.push({ type: 'orderedList', content: lines.map((l) => ({ type: 'listItem', content: parseInline(l.replace(/^\d+\.\s+/, '')) })) });
    } else if (lines[0] === '---') {
      content.push({ type: 'horizontalRule' });
    } else if (lines[0].startsWith('```')) {
      content.push({ type: 'codeBlock', content: [{ type: 'text', text: lines.slice(1, -1).join('\n') }] });
    } else if (lines[0].startsWith('> ')) {
       content.push({ type: 'blockquote', content: [paragraphFromLines(lines.map((l) => l.replace(/^>\s?/, '')))] });
    } else {
      content.push(paragraphFromLines(lines));
    }
  }
  return { type: 'doc', content };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/markdown.test.ts`

 Expected: PASS（13 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.ts lib/markdown.test.ts
git commit -m "feat: Markdown 序列化与解析"
```

### Task 9: 自动保存控制器（AutosaveController）

**Files:**
- Create: `lib/autosave.ts`、`lib/useAutosave.ts`
- Test: `lib/autosave.test.ts`

设计：核心防抖/重试逻辑放在与 React 无关的 `AutosaveController` 类中（纯 Node 环境可测），`useAutosave` 只做薄封装并订阅状态。

- [ ] **Step 1: 写失败测试**

Create `lib/autosave.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutosaveController } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutosaveController', () => {
  it('防抖 500ms 后保存最后一次值', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    c.schedule('b');
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
    expect(c.getState()).toBe('saved');
  });

  it('flush 立即保存并取消挂起定时器', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    await c.flush();
    expect(save).toHaveBeenCalledWith('a');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('失败保留待存值，retry 后恢复', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('网络错误')).mockResolvedValueOnce(undefined);
    const c = new AutosaveController(save);
    c.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    expect(c.getState()).toBe('error');
    c.retry();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(c.getState()).toBe('saved');
  });

  it('状态回调按序触发', () => {
    const states: string[] = [];
    const c = new AutosaveController(vi.fn().mockResolvedValue(undefined), 500, (s) => states.push(s));
    c.schedule('a');
    expect(states).toContain('pending');
    expect(c.getState()).toBe('pending');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/autosave.test.ts`

Expected: FAIL（`Cannot find module './autosave'`）。

- [ ] **Step 3: 实现控制器与 hook**

Create `lib/autosave.ts`:

```ts
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type SaveFn = (value: string) => Promise<void>;
export type Listener = (state: SaveState) => void;

export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private state: SaveState = 'idle';

  constructor(
    private readonly save: SaveFn,
    private readonly delay = 500,
    private readonly onChange?: Listener,
  ) {}

  getState(): SaveState {
    return this.state;
  }

  private setState(state: SaveState): void {
    this.state = state;
    this.onChange?.(state);
  }

  schedule(value: string): void {
    this.pending = value;
    this.setState('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delay);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending === null) return;
    const value = this.pending;
    this.pending = null;
    this.setState('saving');
    try {
      await this.save(value);
      this.setState('saved');
    } catch {
      this.pending = value;
      this.setState('error');
    }
  }

  retry(): void {
    if (this.pending !== null) void this.flush();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
```

Create `lib/useAutosave.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { AutosaveController, type SaveFn, type SaveState } from './autosave';

export function useAutosave(save: SaveFn, delay = 500) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const controllerRef = useRef<AutosaveController | null>(null);
  const [state, setState] = useState<SaveState>('idle');

  if (!controllerRef.current) {
    controllerRef.current = new AutosaveController((value) => saveRef.current(value), delay, setState);
  }
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  const schedule = useCallback((value: string) => controller.schedule(value), [controller]);
  const flush = useCallback(() => controller.flush(), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);

  return { state, schedule, flush, retry };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/autosave.test.ts`

Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/autosave.ts lib/useAutosave.ts lib/autosave.test.ts
git commit -m "feat: 自动保存控制器与 React hook"
```

### Task 10: 项目 API 与项目列表页

**Files:**
- Create: `app/api/projects/route.ts`、`app/api/projects/[id]/route.ts`、`components/ProjectList.tsx`
- Modify: `app/layout.tsx`（移除 Google 字体，避免构建时外网依赖）、`app/globals.css`（基础排版）、`app/page.tsx`（项目列表）

注意：脚手架默认使用 `next/font/google`，构建时需要访问 Google 字体服务，国内网络可能失败。本任务改为系统字体栈。

- [ ] **Step 1: 创建项目 API 路由**

Create `app/api/projects/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/db/projects';

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '项目标题不能为空' }, { status: 400 });
  const project = createProject({
    title,
    penName: typeof body?.penName === 'string' ? body.penName.trim() : '',
    description: typeof body?.description === 'string' ? body.description.trim() : '',
  });
  return NextResponse.json({ project }, { status: 201 });
}
```

Create `app/api/projects/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteProject, getProject, updateProject } from '@/lib/db/projects';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; penName?: string; description?: string } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.penName === 'string') patch.penName = body.penName.trim();
  if (typeof body?.description === 'string') patch.description = body.description.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const project = updateProject(id, patch);
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 调整布局、样式与项目列表页**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '墨影 AI · 智能小说创作工作台',
  description: '墨影 AI (InkPulse AI) 智能小说创作工作台',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

Replace `app/globals.css`:

```css
@import "tailwindcss";

html,
body {
  height: 100%;
}

body {
  font-family: ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.ProseMirror {
  min-height: 100%;
  outline: none;
}

.ProseMirror p {
  margin: 0 0 0.75rem;
  line-height: 1.9;
}

.ProseMirror h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.75rem; }
.ProseMirror h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.ProseMirror h3 { font-size: 1.1rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.ProseMirror ul { list-style: disc; padding-left: 1.25rem; margin: 0 0 0.75rem; }
.ProseMirror ol { list-style: decimal; padding-left: 1.25rem; margin: 0 0 0.75rem; }
.ProseMirror blockquote { border-left: 3px solid #d1d5db; padding-left: 0.75rem; color: #4b5563; margin: 0 0 0.75rem; }
.ProseMirror pre { background: #f3f4f6; padding: 0.75rem; border-radius: 0.375rem; margin: 0 0 0.75rem; overflow-x: auto; }
.ProseMirror hr { border-top: 1px solid #e5e7eb; margin: 1rem 0; }
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #9ca3af;
  float: left;
  height: 0;
  pointer-events: none;
}
```

Replace `app/page.tsx`:

```tsx
import ProjectList from '@/components/ProjectList';

export default function Home() {
  return <ProjectList />;
}
```

Create `components/ProjectList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import type { ProjectWithCounts } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ProjectList() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ projects: ProjectWithCounts[] }>('/api/projects', fetcher);
  const [title, setTitle] = useState('');
  const [penName, setPenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, penName }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '创建失败');
        return;
      }
      setTitle('');
      setPenName('');
      await mutate();
      router.push(`/projects/${json.project.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('确认删除该项目？其下的卷、章节与快照将一并删除。')) return;
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (res.ok) await mutate();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">墨影 AI</h1>
      <p className="mt-1 text-sm text-gray-500">智能小说创作工作台 · 数据本地存储于 data/ 目录</p>

      <form onSubmit={create} className="mt-8 flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
        <label className="flex flex-col gap-1 text-sm">
          项目名
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="例如：九天仙帝"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          笔名（可选）
          <input
            value={penName}
            onChange={(e) => setPenName(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="作者名"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="w-fit rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {creating ? '创建中…' : '创建项目'}
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {isLoading && <p className="text-gray-500">加载中…</p>}
        {(data?.projects ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
            <button className="text-left" onClick={() => router.push(`/projects/${p.id}`)}>
              <div className="font-medium">{p.title}</div>
              <div className="mt-1 text-xs text-gray-500">
                {p.penName ? `${p.penName} · ` : ''}
                {p.volumeCount} 卷 / {p.chapterCount} 章 · 更新于 {new Date(p.updatedAt).toLocaleString('zh-CN')}
              </div>
            </button>
            <button onClick={() => remove(p.id)} className="text-sm text-red-600 hover:underline">
              删除
            </button>
          </div>
        ))}
        {!isLoading && (data?.projects ?? []).length === 0 && (
          <p className="text-gray-500">还没有项目，先创建一个开始写作吧。</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: 静态检查与 API 冒烟验证**

Run: `npm run lint`

Expected: 通过。

另开一个终端保持运行：`npm run dev`，然后执行：

```powershell
curl.exe -s http://localhost:3000/api/projects
curl.exe -s -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" -d "{\"title\":\"测试书\",\"penName\":\"测试作者\"}"
curl.exe -s -X POST http://localhost:3000/api/projects -H "Content-Type: application/json" -d "{\"title\":\"  \"}"
```

Expected: 依次为 `{"projects":[]}`；`201` 且返回带 id 的 project；`400` 且返回 `{"error":"项目标题不能为空"}`。随后在浏览器打开 `http://localhost:3000`，创建项目并确认列表出现新项目（点击跳转的工作台页将在 Task 13 实现，此时 404 属预期）。

- [ ] **Step 4: Commit**

```bash
git add app/api/projects app/layout.tsx app/globals.css app/page.tsx components/ProjectList.tsx
git commit -m "feat: 项目 API 与项目列表页"
```

### Task 11: 卷与章 API 路由

**Files:**
- Create: `app/api/projects/[id]/volumes/route.ts`、`app/api/volumes/[id]/route.ts`、`app/api/projects/[id]/chapters/route.ts`、`app/api/chapters/[id]/route.ts`

- [ ] **Step 1: 创建卷 API**

Create `app/api/projects/[id]/volumes/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/projects';
import { createVolume, listVolumes } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  return NextResponse.json({ volumes: listVolumes(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '卷标题不能为空' }, { status: 400 });
  const volume = createVolume(id, {
    title,
    summary: typeof body?.summary === 'string' ? body.summary.trim() : '',
  });
  return NextResponse.json({ volume }, { status: 201 });
}
```

Create `app/api/volumes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteVolume, getVolume, updateVolume } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const volume = getVolume(id);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ volume });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; summary?: string } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.summary === 'string') patch.summary = body.summary.trim();
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const volume = updateVolume(id, patch);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ volume });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteVolume(id)) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 创建章 API**

Create `app/api/projects/[id]/chapters/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createChapter, listChaptersByProject } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ chapters: listChaptersByProject(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: projectId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!volumeId || !title) return NextResponse.json({ error: 'volumeId 与标题必填' }, { status: 400 });
  const volume = getVolume(volumeId);
  if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  if (volume.projectId !== projectId) return NextResponse.json({ error: '卷不属于该项目' }, { status: 400 });
  const chapter = createChapter(volumeId, { title });
  return NextResponse.json({ chapter }, { status: 201 });
}
```

Create `app/api/chapters/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteChapter, getChapter, updateChapter } from '@/lib/db/chapters';
import type { ChapterStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const chapter = getChapter(id);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ chapter });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: { title?: string; content?: string; outline?: string; status?: ChapterStatus } = {};
  if (typeof body?.title === 'string') patch.title = body.title.trim();
  if (typeof body?.content === 'string') patch.content = body.content;
  if (typeof body?.outline === 'string') patch.outline = body.outline;
  if (body?.status === 'draft' || body?.status === 'final') patch.status = body.status;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const chapter = updateChapter(id, patch);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ chapter });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: API 冒烟验证**

保持 `npm run dev` 运行，执行（把返回的项目 id 代入 `$projId`）：

```powershell
$projId = '上一步创建的项目ID'
$volId = (curl.exe -s -X POST "http://localhost:3000/api/projects/$projId/volumes" -H "Content-Type: application/json" -d "{\"title\":\"第一卷\"}" | ConvertFrom-Json).volume.id
$chapId = (curl.exe -s -X POST "http://localhost:3000/api/projects/$projId/chapters" -H "Content-Type: application/json" -d "{\"volumeId\":\"$volId\",\"title\":\"第一章\"}" | ConvertFrom-Json).chapter.id
curl.exe -s -X PATCH "http://localhost:3000/api/chapters/$chapId" -H "Content-Type: application/json" -d "{\"content\":\"第一段。\n\n第二段！\"}"
curl.exe -s "http://localhost:3000/api/projects/$projId/chapters"
```

Expected: 创建卷/章均 `201`；PATCH 返回 `wordCount=8`；列表包含一条 `volumeTitle=第一卷` 的记录。

- [ ] **Step 4: Commit**

```bash
git add app/api/volumes app/api/chapters "app/api/projects/[id]/volumes" "app/api/projects/[id]/chapters"
git commit -m "feat: 卷与章 API 路由"
```

### Task 12: 快照 API 路由

**Files:**
- Create: `app/api/chapters/[id]/snapshots/route.ts`、`app/api/snapshots/[id]/route.ts`、`app/api/snapshots/[id]/restore/route.ts`

- [ ] **Step 1: 创建快照 API**

Create `app/api/chapters/[id]/snapshots/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createSnapshot, listSnapshots } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ snapshots: listSnapshots(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const snapshot = createSnapshot(id, {
    label: typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : undefined,
    branchId: typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : undefined,
  });
  return NextResponse.json({ snapshot }, { status: 201 });
}
```

Create `app/api/snapshots/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteSnapshot, getSnapshot } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const snapshot = getSnapshot(id);
  if (!snapshot) return NextResponse.json({ error: '快照不存在' }, { status: 404 });
  return NextResponse.json({ snapshot });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteSnapshot(id)) return NextResponse.json({ error: '快照不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

Create `app/api/snapshots/[id]/restore/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { restoreSnapshot } from '@/lib/db/snapshots';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const chapter = restoreSnapshot(id);
    return NextResponse.json({ chapter });
  } catch {
    return NextResponse.json({ error: '快照或章节不存在' }, { status: 404 });
  }
}
```

- [ ] **Step 2: API 冒烟验证**

保持 `npm run dev` 运行，沿用上一步的 `$chapId`：

```powershell
$snapId = (curl.exe -s -X POST "http://localhost:3000/api/chapters/$chapId/snapshots" -H "Content-Type: application/json" -d "{\"label\":\"v1\"}" | ConvertFrom-Json).snapshot.id
curl.exe -s -X PATCH "http://localhost:3000/api/chapters/$chapId" -H "Content-Type: application/json" -d "{\"content\":\"改过的正文\"}"
curl.exe -s "http://localhost:3000/api/chapters/$chapId/snapshots"
curl.exe -s -X POST "http://localhost:3000/api/snapshots/$snapId/restore"
curl.exe -s "http://localhost:3000/api/chapters/$chapId"
```

Expected: 创建快照 `version=1`；修改正文后 GET 快照列表仍只有 1 条且 content 为旧文；restore 后 GET 章节的 content 恢复为旧文，快照列表多出一条 `回滚前自动快照`。

- [ ] **Step 3: Commit**

```bash
git add app/api/snapshots "app/api/chapters/[id]/snapshots"
git commit -m "feat: 快照 API 路由"
```

### Task 13: 工作台骨架与左侧栏

**Files:**
- Create: `app/projects/[id]/page.tsx`、`components/workspace/WorkspaceShell.tsx`、`components/workspace/Sidebar.tsx`

- [ ] **Step 1: 创建工作台页**

Create `app/projects/[id]/page.tsx`:

```tsx
import WorkspaceShell from '@/components/workspace/WorkspaceShell';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspaceShell projectId={id} />;
}
```

- [ ] **Step 2: 实现三栏骨架与状态编排**

Create `components/workspace/WorkspaceShell.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import Sidebar from './Sidebar';
import ChapterEditor from './ChapterEditor';
import InspectorPanel from './InspectorPanel';
import { useAutosave } from '@/lib/useAutosave';
import { countWords } from '@/lib/wordCount';
import type { ChapterWithVolume, Project, Volume } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WorkspaceShell({ projectId }: { projectId: string }) {
  const { data: projectData } = useSWR<{ project: Project }>(`/api/projects/${projectId}`, fetcher);
  const { data: volumesData, mutate: mutateVolumes } = useSWR<{ volumes: Volume[] }>(`/api/projects/${projectId}/volumes`, fetcher);
  const { data: chaptersData, mutate: mutateChapters } = useSWR<{ chapters: ChapterWithVolume[] }>(`/api/projects/${projectId}/chapters`, fetcher);

  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const contentRef = useRef('');

  const volumes = volumesData?.volumes ?? [];
  const chapters = chaptersData?.chapters ?? [];
  const current = chapters.find((c) => c.id === currentChapterId) ?? null;
  const loading = !volumesData || !chaptersData;

  const save = useCallback(
    async (content: string) => {
      if (!currentChapterId) return;
      const res = await fetch(`/api/chapters/${currentChapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('保存失败');
      await mutateChapters();
    },
    [currentChapterId, mutateChapters],
  );

  const autosave = useAutosave(save);

  const handleContentChange = useCallback(
    (content: string) => {
      contentRef.current = content;
      setWordCount(countWords(content));
      autosave.schedule(content);
    },
    [autosave],
  );

  const switchChapter = useCallback(
    async (id: string) => {
      await autosave.flush();
      setCurrentChapterId(id);
      const next = (chaptersData?.chapters ?? []).find((c) => c.id === id);
      contentRef.current = next?.content ?? '';
      setWordCount(countWords(next?.content ?? ''));
    },
    [autosave, chaptersData],
  );

  // 初始选中第一章；当前章被删除时回退到第一章
  useEffect(() => {
    if (chapters.length === 0) {
      setCurrentChapterId(null);
      contentRef.current = '';
      setWordCount(0);
      return;
    }
    if (!currentChapterId || !chapters.some((c) => c.id === currentChapterId)) {
      const first = chapters[0];
      setCurrentChapterId(first.id);
      contentRef.current = first.content;
      setWordCount(countWords(first.content));
    }
  }, [chapters, currentChapterId]);

  async function handleChanged() {
    await mutateVolumes();
    await mutateChapters();
  }

  async function handleRestored() {
    await mutateChapters();
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="font-semibold">{projectData?.project?.title ?? '加载中…'}</h1>
          <span className="text-xs text-gray-500">墨影 AI</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <SaveBadge state={autosave.state} onRetry={autosave.retry} />
          <span>{wordCount} 字</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          projectId={projectId}
          volumes={volumes}
          chapters={chapters}
          currentChapterId={currentChapterId}
          onSelect={(id) => void switchChapter(id)}
          onChanged={() => void handleChanged()}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <p className="p-6 text-gray-500">加载中…</p>
          ) : current ? (
            <ChapterEditor
              key={`${current.id}-${refreshToken}`}
              title={current.title}
              initialContent={current.content}
              onChange={handleContentChange}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              尚无章节，请在左侧创建第一卷并添加章节。
            </div>
          )}
        </main>
        <InspectorPanel
          chapter={current}
          saveState={autosave.state}
          wordCount={wordCount}
          onRestored={() => void handleRestored()}
        />
      </div>
    </div>
  );
}

function SaveBadge({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === 'pending' || state === 'saving') return <span className="text-amber-600">保存中…</span>;
  if (state === 'error') return <button onClick={onRetry} className="text-red-600 underline">保存失败，点此重试</button>;
  if (state === 'saved') return <span className="text-emerald-600">已保存</span>;
  return <span>就绪</span>;
}
```

- [ ] **Step 3: 实现左侧目录树**

Create `components/workspace/Sidebar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ChapterWithVolume, Volume } from '@/lib/types';

interface Props {
  projectId: string;
  volumes: Volume[];
  chapters: ChapterWithVolume[];
  currentChapterId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export default function Sidebar({ projectId, volumes, chapters, currentChapterId, onSelect, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function api(url: string, options?: RequestInit) {
    setBusy(true);
    try {
      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? '操作失败');
        return null;
      }
      await onChanged();
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function addVolume() {
    const title = prompt('卷标题：');
    if (!title?.trim()) return;
    await api(`/api/projects/${projectId}/volumes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function renameVolume(v: Volume) {
    const title = prompt('新卷名：', v.title);
    if (!title?.trim() || title.trim() === v.title) return;
    await api(`/api/volumes/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function removeVolume(v: Volume) {
    if (!confirm(`删除卷「${v.title}」？其下所有章节与快照将一并删除。`)) return;
    await api(`/api/volumes/${v.id}`, { method: 'DELETE' });
  }

  async function addChapter(volumeId: string) {
    const title = prompt('章节标题：');
    if (!title?.trim()) return;
    const json = await api(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volumeId, title: title.trim() }),
    });
    if (json?.chapter?.id) onSelect(json.chapter.id);
  }

  async function renameChapter(c: ChapterWithVolume) {
    const title = prompt('新章节名：', c.title);
    if (!title?.trim() || title.trim() === c.title) return;
    await api(`/api/chapters/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    });
  }

  async function removeChapter(c: ChapterWithVolume) {
    if (!confirm(`删除章节「${c.title}」？其快照将一并删除。`)) return;
    await api(`/api/chapters/${c.id}`, { method: 'DELETE' });
  }

  return (
    <aside className="flex w-64 flex-col overflow-y-auto border-r border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-gray-700">目录</h2>
        <button
          onClick={addVolume}
          disabled={busy}
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          + 卷
        </button>
      </div>
      {volumes.length === 0 && <p className="mt-2 text-xs text-gray-400">还没有卷，点「+ 卷」创建。</p>}
      {volumes.map((v) => (
        <div key={v.id} className="mt-2">
          <div className="group flex items-center justify-between rounded px-2 py-1 hover:bg-gray-100">
            <span className="font-medium">{v.title}</span>
            <span className="hidden gap-1 group-hover:flex">
              <button onClick={() => addChapter(v.id)} disabled={busy} className="text-gray-500 hover:text-blue-600">+章</button>
              <button onClick={() => renameVolume(v)} disabled={busy} className="text-gray-500 hover:text-blue-600">改</button>
              <button onClick={() => removeVolume(v)} disabled={busy} className="text-gray-500 hover:text-red-600">删</button>
            </span>
          </div>
          {chapters
            .filter((c) => c.volumeId === v.id)
            .map((c) => (
              <div key={c.id} className="group flex items-center justify-between rounded py-1 pl-6 pr-2 hover:bg-gray-100">
                <button
                  onClick={() => onSelect(c.id)}
                  className={`flex-1 truncate text-left ${c.id === currentChapterId ? 'text-blue-600' : 'text-gray-700'}`}
                >
                  {c.title}
                </button>
                <span className="hidden gap-1 group-hover:flex">
                  <button onClick={() => renameChapter(c)} disabled={busy} className="text-gray-400 hover:text-blue-600">改</button>
                  <button onClick={() => removeChapter(c)} disabled={busy} className="text-gray-400 hover:text-red-600">删</button>
                </span>
              </div>
            ))}
        </div>
      ))}
      <div className="mt-6 border-t border-gray-100 pt-3">
        <h3 className="text-xs font-medium text-gray-400">实体档案馆</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
        <h3 className="mt-3 text-xs font-medium text-gray-400">伏笔跟踪</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 验证**

Run: `npm run lint`

Expected: 通过。注意此时 `ChapterEditor`、`InspectorPanel` 尚未创建，本步骤仅验证 Sidebar 与 Shell 的语法；先创建占位文件再跑 lint：

Create `components/workspace/ChapterEditor.tsx`（占位，Task 14 替换）:

```tsx
'use client';

export default function ChapterEditor(props: { title: string; initialContent: string; onChange: (md: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-8">
      <h2 className="mb-4 text-center font-medium">{props.title}</h2>
      <p className="text-gray-400">编辑器将在 Task 14 接入。</p>
    </div>
  );
}
```

Create `components/workspace/InspectorPanel.tsx`（占位，Task 15 替换）:

```tsx
'use client';

export default function InspectorPanel(props: { chapter: unknown; saveState: string; wordCount: number; onRestored: () => void }) {
  return (
    <aside className="w-72 border-l border-gray-200 bg-white p-3 text-sm text-gray-400">
      右栏将在 Task 15 接入。
    </aside>
  );
}
```

再运行 `npm run lint`，Expected: 通过。随后 `npm run dev`，浏览器验证：打开 `http://localhost:3000` → 创建项目 → 进入工作台 → 点「+ 卷」→ 卷行悬浮「+章」创建章节 → 点击章节名可选中（中栏暂时是占位文本）。

- [ ] **Step 5: Commit**

```bash
git add "app/projects/[id]/page.tsx" components/workspace/WorkspaceShell.tsx components/workspace/Sidebar.tsx components/workspace/ChapterEditor.tsx components/workspace/InspectorPanel.tsx
git commit -m "feat: 工作台三栏骨架与左侧目录树"
```

### Task 14: 章节编辑器（TipTap + 选中悬浮菜单）

**Files:**
- Modify: `components/workspace/ChapterEditor.tsx`（替换占位）

- [ ] **Step 1: 实现编辑器**

Replace `components/workspace/ChapterEditor.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { parseDoc, serializeDoc, type Doc } from '@/lib/markdown';

interface Props {
  title: string;
  initialContent: string;
  onChange: (md: string) => void;
}

const MENU_ACTIONS = [
  { key: 'expand', label: '扩写' },
  { key: 'senses', label: '五感' },
  { key: 'pace', label: '节奏' },
  { key: 'mood', label: '意境' },
  { key: 'check', label: '诊断' },
];

export default function ChapterEditor({ title, initialContent, onChange }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: '开始写作……（M2 将启用 Tab 采纳补全）' }),
      ],
      content: parseDoc(initialContent) as unknown as JSONContent,
      editorProps: {
        attributes: {
          class: 'px-8 py-6 focus:outline-none',
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
          {MENU_ACTIONS.map((a) => (
            <button
              key={a.key}
              disabled
              title="M2 启用"
              className="cursor-not-allowed rounded px-2 py-1 text-xs text-gray-400"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证**

Run: `npm run lint`（Expected: 通过）。

浏览器验证：进入某章节，输入多段文字（用回车分段），观察顶栏「保存中… → 已保存」状态流转与字数实时增长；选中一段文字，光标上方出现 5 个置灰按钮（M2 启用）；刷新页面后正文仍在（已持久化）。打开 `data/app.db` 所在目录确认数据库文件存在。

- [ ] **Step 3: Commit**

```bash
git add components/workspace/ChapterEditor.tsx
git commit -m "feat: TipTap 章节编辑器与选中悬浮菜单"
```

### Task 15: 右栏与快照对比/回滚

**Files:**
- Modify: `components/workspace/InspectorPanel.tsx`（替换占位）
- Create: `components/workspace/SnapshotDiff.tsx`

- [ ] **Step 1: 实现快照对比组件**

Create `components/workspace/SnapshotDiff.tsx`:

```tsx
'use client';

import { diffLines } from 'diff';
import type { ChapterSnapshot } from '@/lib/types';

interface Props {
  current: string;
  snapshot: ChapterSnapshot;
  onClose: () => void;
}

export default function SnapshotDiff({ current, snapshot, onClose }: Props) {
  const parts = diffLines(snapshot.content, current);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="font-medium">
            对比 v{snapshot.version}
            {snapshot.label ? `（${snapshot.label}）` : ''} vs 当前
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="overflow-y-auto p-4 font-mono text-xs leading-6">
          <pre className="whitespace-pre-wrap break-all">
            {parts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? 'bg-emerald-100 text-emerald-900'
                    : part.removed
                      ? 'bg-red-100 text-red-900 line-through'
                      : ''
                }
              >
                {part.value}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现右栏面板**

Replace `components/workspace/InspectorPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import SnapshotDiff from './SnapshotDiff';
import type { ChapterSnapshot, ChapterWithVolume } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  chapter: ChapterWithVolume | null;
  saveState: string;
  wordCount: number;
  onRestored: () => void;
}

export default function InspectorPanel({ chapter, saveState, wordCount, onRestored }: Props) {
  const { data, isLoading, mutate } = useSWR<{ snapshots: ChapterSnapshot[] }>(
    chapter ? `/api/chapters/${chapter.id}/snapshots` : null,
    fetcher,
  );
  const [diff, setDiff] = useState<ChapterSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const snapshots = data?.snapshots ?? [];

  async function createSnapshot() {
    if (!chapter) return;
    const label = prompt('快照标签（可选）：');
    setBusy(true);
    try {
      await fetch(`/api/chapters/${chapter.id}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function restore(s: ChapterSnapshot) {
    if (!confirm(`回滚到版本 v${s.version}${s.label ? `（${s.label}）` : ''}？回滚前会自动保存当前状态。`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${s.id}/restore`, { method: 'POST' });
      if (res.ok) {
        setDiff(null);
        onRestored();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: ChapterSnapshot) {
    if (!confirm(`删除快照 v${s.version}？`)) return;
    await fetch(`/api/snapshots/${s.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <aside className="flex w-72 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white p-3 text-sm">
      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">本章信息</h3>
        <dl className="mt-2 space-y-1 text-gray-700">
          <div className="flex justify-between"><dt className="text-gray-500">字数</dt><dd>{wordCount}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">保存状态</dt><dd>{saveLabel(saveState)}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">快照数</dt><dd>{snapshots.length}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">版本快照</h3>
          <button
            onClick={createSnapshot}
            disabled={!chapter || busy}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            + 快照
          </button>
        </div>
        {isLoading && <p className="mt-2 text-gray-400">加载中…</p>}
        {!isLoading && snapshots.length === 0 && <p className="mt-2 text-gray-400">暂无快照</p>}
        <ul className="mt-2 space-y-2">
          {snapshots.map((s) => (
            <li key={s.id} className="rounded border border-gray-100 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">v{s.version}</span>
                <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              {s.label && <div className="text-xs text-gray-500">{s.label}</div>}
              <div className="mt-1 flex gap-2 text-xs">
                <button onClick={() => setDiff(s)} className="text-blue-600 hover:underline">对比</button>
                <button onClick={() => restore(s)} disabled={busy} className="text-emerald-600 hover:underline">回滚</button>
                <button onClick={() => remove(s)} disabled={busy} className="text-red-500 hover:underline">删除</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-300">
        <h3 className="font-medium">角色状态 · 信息差</h3>
        <p className="mt-1">M3 里程碑启用</p>
      </section>
      <section className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-300">
        <h3 className="font-medium">一致性警报</h3>
        <p className="mt-1">M3 里程碑启用</p>
      </section>

      {diff && chapter && (
        <SnapshotDiff current={chapter.content} snapshot={diff} onClose={() => setDiff(null)} />
      )}
    </aside>
  );
}

function saveLabel(state: string): string {
  switch (state) {
    case 'pending':
      return '待保存';
    case 'saving':
      return '保存中…';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    default:
      return '就绪';
  }
}
```

- [ ] **Step 3: 验证**

Run: `npm run lint`（Expected: 通过）。

浏览器验证：写一段正文 → 点「+ 快照」（填标签）→ 修改正文并等待自动保存 → 点快照「对比」看增删高亮 → 点「回滚」确认后正文恢复旧版、快照列表多出「回滚前自动快照」→ 删除一条快照后列表更新。

- [ ] **Step 4: Commit**

```bash
git add components/workspace/InspectorPanel.tsx components/workspace/SnapshotDiff.tsx
git commit -m "feat: 右栏信息面板与快照对比回滚"
```

### Task 16: 全量验收与收尾

**Files:** 无新增（仅验证与提交）。

- [ ] **Step 1: 跑全部测试与静态检查**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: `npm test` 全部 PASS（数据库 14、markdown 13、wordCount 3、autosave 4，共 34 个用例）；lint 通过；build 成功产出 `.next/`。

- [ ] **Step 2: M1 手工验收清单（逐项确认）**

保持 `npm run dev` 运行，按序完成并全部打勾：

- [ ] 首页能创建项目并进入工作台；刷新后项目仍在。
- [ ] 工作台能创建卷、章节、重命名、删除；章节切换顺畅。
- [ ] 输入正文后 500ms 内顶栏出现「保存中…」并最终「已保存」；字数实时更新。
- [ ] 停止并重启 `npm run dev` 后，正文与目录完整恢复（数据在 `data/app.db`）。
- [ ] 快照可创建（带标签）、对比（红/绿高亮）、回滚（自动生成「回滚前自动快照」）、删除。
- [ ] 选中正文出现悬浮菜单（按钮置灰，M2 接入）。
- [ ] 删除项目后，其卷/章/快照在数据库中全部消失。

- [ ] **Step 3: 清理与最终提交**

停止 dev server；确认 `.gitignore` 已忽略 `data/`、`.next/`、`node_modules/`：

```powershell
git status --short
```

Expected: 无 `data/`、`.next/`、`node_modules/` 出现在未跟踪列表。然后：

```bash
git add -A
git commit -m "docs: M1 完成验收记录"
```

## M1 完成标准（DoD）

以下条件全部满足才算 M1 完成：

1. `npm test`、`npm run lint`、`npm run build` 三项全绿（有输出为证）。
2. 手工验收清单 7 项全部通过。
3. 每个 Task 均有独立提交，工作区干净。
4. 未实现能力（AI、实体卡、伏笔、一致性）以「M2/M3 启用」占位明确标注，不虚假宣称完成。
