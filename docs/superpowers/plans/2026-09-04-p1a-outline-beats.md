# P1-A 节拍器与大纲系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付大纲工作台：场景卡（元数据级）、「正文/大纲」视图、卷大纲弹窗、四套节拍模板应用、AI 卷/章骨架生成（预览后应用）与大纲逻辑预演。

**Architecture:** 在 M1~M3 基础上增量开发。新增 `scene` 表（迁移 4）与仓库/API；模板与骨架逻辑放 `lib/beats/`（纯函数可测）；AI 骨架生成与逻辑预演复用 `lib/ai/provider`（complete/streamChat）与 JSON 解析模式；大纲视图为工作台内的客户端组件。

**Tech Stack:** 与既有里程碑一致（Next.js 15 + React 19 + TS + Tailwind + node:sqlite + SWR + Vitest），零新增依赖。

---

## 关键决策

- 模板「应用到卷」创建卷下的章与场景卡；「应用到章」使用模板第一章的节拍为当前章生成场景卡（UI 文案说明）。
- AI 生成一律「预览后应用」：生成接口只返回骨架，写库由应用接口完成；模板应用也走同一插入接口（`/api/beats/apply-skeleton`）。
- `apply-skeleton` 在带 `volumeOutline` 时同步更新卷大纲（summary）。
- 卷/章大纲文本用既有 `summary/outline` 字段；场景卡不进正文字段。
- mock 模式（`INKPULSE_AI_MOCK=1`）返回确定性骨架与示例预警，保证无密钥全链路验收。
- 无原生 prompt/alert/confirm（沿用内联表单 + 两步确认惯例）。

## 文件结构

```
lib/db/
├─ schema.ts                 (Modify) 迁移 4：scene 表
├─ scenes.ts                 (Create) 场景卡仓库
├─ client.test.ts            (Modify) user_version 4 + scene 表
└─ scenes.test.ts            (Create)
lib/beats/
├─ templates.ts              (Create) 四套模板 + Beat/Skeleton 类型
├─ templates.test.ts         (Create)
└─ apply.ts                  (Create) insertSkeleton/insertBeats（写库）
lib/ai/outline.ts            (Create) 骨架/预警消息构建与 JSON 解析
app/api/
├─ chapters/[id]/scenes/route.ts   (Create) GET / POST
├─ scenes/[id]/route.ts            (Create) GET / PATCH / DELETE
├─ beats/apply-skeleton/route.ts   (Create) POST
├─ beats/apply-chapter-beats/route.ts (Create) POST
├─ ai/outline-generate/route.ts    (Create) POST
└─ ai/outline-check/route.ts       (Create) POST
components/workspace/
├─ ChapterOutlineView.tsx    (Create) 大纲视图（章大纲 + 场景卡 + A2/A3）
├─ VolumeOutlineModal.tsx    (Create) 卷大纲弹窗（大纲 + A2/A3）
├─ WorkspaceShell.tsx        (Modify) 正文/大纲切换
└─ Sidebar.tsx               (Modify) 卷行「纲」按钮
lib/types.ts                 (Modify) Scene/SceneStatus
```

## 任务分解

### Task 1: 迁移 4 与场景卡仓库

**Files:**
- Modify: `lib/db/schema.ts`、`lib/db/client.test.ts`、`lib/types.ts`
- Create: `lib/db/scenes.ts`
- Test: `lib/db/scenes.test.ts`

- [ ] **Step 1: 更新迁移与类型，写失败测试**

在 `lib/db/schema.ts` 的 `MIGRATIONS` 末尾追加：

```ts
  `
  CREATE TABLE IF NOT EXISTS scene (
    id TEXT PRIMARY KEY,
    chapterId TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    goal TEXT NOT NULL DEFAULT '',
    points TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scene_chapter ON scene(chapterId, "order");
  `,
```

把 `lib/db/client.test.ts` 的 `user_version` 断言改为 4，并在 `TABLES` 数组加 `'scene'`。

在 `lib/types.ts` 追加：

```ts
export type SceneStatus = 'draft' | 'done';

export interface Scene {
  id: string;
  chapterId: string;
  title: string;
  goal: string;
  points: string;
  status: SceneStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

Create `lib/db/scenes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter, deleteChapter } from './chapters';
import { createScene, deleteScene, getScene, listScenes, updateScene } from './scenes';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('scenes repo', () => {
  it('创建时自动排序并列出', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const s1 = createScene(c.id, { title: '雨夜追兵', goal: '暴露敌意' }, db);
    const s2 = createScene(c.id, { title: '客栈对峙', goal: '揭晓身份', points: '苏晚在场' }, db);
    expect(s1.order).toBe(0);
    expect(s2.order).toBe(1);
    expect(listScenes(c.id, db).map((s) => s.title)).toEqual(['雨夜追兵', '客栈对峙']);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const s = createScene(c.id, { title: '开场' }, db);
    const updated = updateScene(s.id, { goal: '让主角登场', status: 'done' }, db);
    expect(updated?.goal).toBe('让主角登场');
    expect(updated?.status).toBe('done');
    expect(deleteScene(s.id, db)).toBe(true);
  });

  it('章节删除级联清理场景卡', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    createScene(c.id, { title: '开场' }, db);
    deleteChapter(c.id, db);
    expect(db.prepare('SELECT COUNT(*) AS n FROM scene').get()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/scenes.test.ts lib/db/client.test.ts`

Expected: FAIL（`Cannot find module './scenes'`；user_version 断言不符）。

- [ ] **Step 3: 实现场景卡仓库**

Create `lib/db/scenes.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Scene, SceneStatus } from '../types';

const SELECT = 'SELECT id, chapterId, title, goal, points, status, "order", createdAt, updatedAt FROM scene';

export function listScenes(chapterId: string, db: DB = getDb()): Scene[] {
  return db.prepare(`${SELECT} WHERE chapterId = ? ORDER BY "order" ASC, createdAt ASC`).all(chapterId) as unknown as Scene[];
}

export function getScene(id: string, db: DB = getDb()): Scene | null {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id);
  return (row as unknown as Scene | undefined) ?? null;
}

export function createScene(
  chapterId: string,
  input: { title: string; goal?: string; points?: string; status?: SceneStatus },
  db: DB = getDb(),
): Scene {
  const chapter = db.prepare('SELECT id FROM chapter WHERE id = ?').get(chapterId);
  if (!chapter) throw new Error('章节不存在');
  const id = createId();
  const now = new Date().toISOString();
  const row = db.prepare('SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM scene WHERE chapterId = ?').get(chapterId) as { next: number };
  db.prepare(`INSERT INTO scene (id, chapterId, title, goal, points, status, "order", createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, chapterId, input.title, input.goal ?? '', input.points ?? '', input.status ?? 'draft', Number(row.next), now, now);
  return getScene(id, db)!;
}

export function updateScene(
  id: string,
  patch: { title?: string; goal?: string; points?: string; status?: SceneStatus; order?: number },
  db: DB = getDb(),
): Scene | null {
  const current = getScene(id, db);
  if (!current) return null;
  db.prepare('UPDATE scene SET title = ?, goal = ?, points = ?, status = ?, "order" = ?, updatedAt = ? WHERE id = ?')
    .run(patch.title ?? current.title, patch.goal ?? current.goal, patch.points ?? current.points, patch.status ?? current.status,
      patch.order ?? current.order, new Date().toISOString(), id);
  return getScene(id, db)!;
}

export function deleteScene(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM scene WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/db/scenes.test.ts lib/db/client.test.ts`，Expected: PASS（scene 3 个 + client 2 个）。

```bash
git add lib/db/schema.ts lib/db/client.test.ts lib/types.ts lib/db/scenes.ts lib/db/scenes.test.ts
git commit -m "feat: 场景卡迁移与仓库"
```

### Task 2: 场景卡 API

**Files:**
- Create: `app/api/chapters/[id]/scenes/route.ts`、`app/api/scenes/[id]/route.ts`

- [ ] **Step 1: 创建路由**

Create `app/api/chapters/[id]/scenes/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { createScene, listScenes } from '@/lib/db/scenes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  return NextResponse.json({ scenes: listScenes(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!getChapter(id)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '场景标题不能为空' }, { status: 400 });
  const scene = createScene(id, {
    title,
    goal: typeof body?.goal === 'string' ? body.goal : '',
    points: typeof body?.points === 'string' ? body.points : '',
    status: body?.status === 'done' ? 'done' : 'draft',
  });
  return NextResponse.json({ scene }, { status: 201 });
}
```

Create `app/api/scenes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteScene, getScene, updateScene } from '@/lib/db/scenes';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const scene = getScene(id);
  if (!scene) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ scene });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateScene>[1] = {};
  if (typeof body?.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.goal === 'string') patch.goal = body.goal;
  if (typeof body?.points === 'string') patch.points = body.points;
  if (body?.status === 'draft' || body?.status === 'done') patch.status = body.status;
  if (typeof body?.order === 'number') patch.order = body.order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const scene = updateScene(id, patch);
  if (!scene) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ scene });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteScene(id)) return NextResponse.json({ error: '场景不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: lint 与 curl 冒烟并提交**

Run: `npm run lint`，Expected: 通过。

```powershell
curl.exe -s http://localhost:3000/api/chapters/<某章节id>/scenes
curl.exe -s -X POST http://localhost:3000/api/chapters/<某章节id>/scenes -H "Content-Type: application/json" -d '{"title":"雨夜追兵","goal":"暴露敌意"}'
```

Expected: 空列表 → 创建 `201` 且返回 `order:0` 的场景。

```bash
git add "app/api/chapters/[id]/scenes" app/api/scenes
git commit -m "feat: 场景卡 API"
```

### Task 3: 正文/大纲切换与大纲视图

**Files:**
- Create: `components/workspace/ChapterOutlineView.tsx`
- Modify: `components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: 实现大纲视图（章大纲 + 场景卡管理）**

Create `components/workspace/ChapterOutlineView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAutosave } from '@/lib/useAutosave';
import type { ChapterWithVolume, Scene } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  chapter: ChapterWithVolume;
  onOutlineSaved: () => void;
}

interface SceneDraft {
  title: string;
  goal: string;
  points: string;
}

const EMPTY_DRAFT: SceneDraft = { title: '', goal: '', points: '' };

export default function ChapterOutlineView({ chapter, onOutlineSaved }: Props) {
  const [outline, setOutline] = useState(chapter.outline);
  const [editing, setEditing] = useState<Scene | 'new' | null>(null);
  const [draft, setDraft] = useState<SceneDraft>(EMPTY_DRAFT);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data, mutate } = useSWR<{ scenes: Scene[] }>(`/api/chapters/${chapter.id}/scenes`, fetcher);
  const scenes = data?.scenes ?? [];

  const autosave = useAutosave(async (value: string) => {
    const res = await fetch(`/api/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outline: value }),
    });
    if (!res.ok) throw new Error('大纲保存失败');
    onOutlineSaved();
  });

  function openNew() {
    setDraft(EMPTY_DRAFT);
    setEditing('new');
    setError('');
  }

  function openEdit(scene: Scene) {
    setDraft({ title: scene.title, goal: scene.goal, points: scene.points });
    setEditing(scene);
    setError('');
  }

  async function saveScene() {
    if (!draft.title.trim()) {
      setError('标题不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const url = editing === 'new' ? `/api/chapters/${chapter.id}/scenes` : editing ? `/api/scenes/${editing.id}` : '';
      const method = editing === 'new' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, title: draft.title.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(scene: Scene) {
    await fetch(`/api/scenes/${scene.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: scene.status === 'done' ? 'draft' : 'done' }),
    });
    await mutate();
  }

  async function remove(scene: Scene) {
    if (confirmingId !== scene.id) {
      setConfirmingId(scene.id);
      return;
    }
    setConfirmingId(null);
    await fetch(`/api/scenes/${scene.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-8 py-6 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">本章大纲 · {chapter.title}</h3>
        <span className="text-xs text-gray-400">大纲{autosaveLabel(autosave.state)}</span>
      </div>
      <textarea
        value={outline}
        onChange={(e) => {
          setOutline(e.target.value);
          autosave.schedule(e.target.value);
        }}
        rows={6}
        placeholder="本章要完成什么：核心事件、情绪走向、钩子……"
        className="mt-3 w-full rounded border border-gray-300 px-3 py-2 leading-6"
      />

      <div className="mt-5 flex items-center justify-between">
        <h4 className="font-medium text-gray-700">场景卡（{scenes.length}）</h4>
        <button onClick={openNew} disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
          + 场景
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {editing && (
        <div className="mt-3 space-y-2 rounded border border-gray-200 p-3">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="场景标题"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <textarea
            value={draft.goal}
            onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}
            rows={2}
            placeholder="本场景目标"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <textarea
            value={draft.points}
            onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))}
            rows={2}
            placeholder="要点（可多行）"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setEditing(null); setDraft(EMPTY_DRAFT); }} className="text-gray-500">取消</button>
            <button onClick={() => void saveScene()} disabled={busy} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">保存</button>
          </div>
        </div>
      )}

      {scenes.length === 0 && !editing && <p className="mt-2 text-xs text-gray-400">暂无场景卡，点「+ 场景」添加。</p>}
      <ul className="mt-3 space-y-2">
        {scenes.map((s, index) => (
          <li key={s.id} className="flex items-start justify-between gap-2 rounded border border-gray-100 p-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{index + 1}.</span>
                <span className={`font-medium ${s.status === 'done' ? 'text-gray-400 line-through' : ''}`}>{s.title}</span>
                <button onClick={() => void toggleStatus(s)} className="text-xs text-gray-400 hover:text-emerald-600" title="切换完成状态">
                  {s.status === 'done' ? '✓ 已完成' : '○ 未完成'}
                </button>
              </div>
              {s.goal && <p className="mt-1 text-xs text-gray-600">目标：{s.goal}</p>}
              {s.points && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-400">{s.points}</p>}
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline">编辑</button>
              <button
                onClick={() => void remove(s)}
                className={confirmingId === s.id ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}
              >
                {confirmingId === s.id ? '确认删?' : '删'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function autosaveLabel(state: string): string {
  if (state === 'pending' || state === 'saving') return ' · 保存中…';
  if (state === 'error') return ' · 保存失败';
  return '';
}
```

- [ ] **Step 2: 工作台接入切换**

Modify `components/workspace/WorkspaceShell.tsx`：

```tsx
import ChapterOutlineView from './ChapterOutlineView';
```

```tsx
  const [view, setView] = useState<'write' | 'outline'>('write');
```

中间 `main` 内改为：

```tsx
        <main className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <p className="p-6 text-gray-500">加载中…</p>
          ) : current ? (
            <>
              <div className="flex items-center justify-center gap-1 border-b border-gray-100 bg-white py-1">
                {(['write', 'outline'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded px-3 py-0.5 text-xs ${view === v ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    {v === 'write' ? '正文' : '大纲'}
                  </button>
                ))}
              </div>
              {view === 'write' ? (
                <ChapterEditor
                  key={`${current.id}-${refreshToken}`}
                  chapterId={current.id}
                  title={current.title}
                  initialContent={current.content}
                  onChange={handleContentChange}
                />
              ) : (
                <ChapterOutlineView
                  key={`${current.id}-${refreshToken}`}
                  chapter={current}
                  onOutlineSaved={() => void mutateChapters()}
                />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              尚无章节，请在左侧创建第一卷并添加章节。
            </div>
          )}
        </main>
```

- [ ] **Step 3: 验证并提交**

Run: `npm run lint`，Expected: 通过。浏览器手工检查：切到「大纲」可编辑章大纲（保存后标题旁无报错）、增删场景卡、切换完成状态；切回「正文」内容未丢。

```bash
git add components/workspace/ChapterOutlineView.tsx components/workspace/WorkspaceShell.tsx
git commit -m "feat: 正文/大纲切换与大纲视图"
```

### Task 4: 卷大纲弹窗

**Files:**
- Create: `components/workspace/VolumeOutlineModal.tsx`
- Modify: `components/workspace/Sidebar.tsx`

- [ ] **Step 1: 实现卷大纲弹窗（大纲编辑部分）**

Create `components/workspace/VolumeOutlineModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Volume } from '@/lib/types';

interface Props {
  projectId: string;
  volume: Volume;
  onClose: () => void;
  onChanged: () => void;
}

export default function VolumeOutlineModal({ projectId, volume, onClose, onChanged }: Props) {
  const [summary, setSummary] = useState(volume.summary);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function saveSummary() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/volumes/${volume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存失败');
        return;
      }
      setSaved(true);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">卷大纲 · {volume.title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <label className="flex flex-col gap-1 text-sm">
            卷大纲
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setSaved(false);
              }}
              rows={14}
              placeholder="本卷主线、情绪曲线、结局落点……"
              className="rounded border border-gray-300 px-3 py-2 leading-6"
            />
          </label>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {saved && <p className="mt-2 text-xs text-emerald-600">已保存</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
          <button onClick={() => void saveSummary()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">
            保存大纲
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 侧栏接入「纲」按钮**

Modify `components/workspace/Sidebar.tsx`：

```tsx
import VolumeOutlineModal from './VolumeOutlineModal';
```

状态与渲染：

```tsx
  const [outlineVolume, setOutlineVolume] = useState<Volume | null>(null);
```

卷行操作组 `+章` 前增加：

```tsx
                <button onClick={() => setOutlineVolume(v)} disabled={busy} title="卷大纲与节拍" className="text-gray-500 hover:text-blue-600">纲</button>
```

组件末尾（`</aside>` 前）：

```tsx
      {outlineVolume && (
        <VolumeOutlineModal
          projectId={projectId}
          volume={outlineVolume}
          onClose={() => setOutlineVolume(null)}
          onChanged={onChanged}
        />
      )}
```

- [ ] **Step 3: 验证并提交**

Run: `npm run lint`，Expected: 通过。浏览器检查：点卷行「纲」→ 弹窗编辑大纲 → 保存 → 提示已保存。

```bash
git add components/workspace/VolumeOutlineModal.tsx components/workspace/Sidebar.tsx
git commit -m "feat: 卷大纲弹窗"
```

### Task 5: 节拍模板库

**Files:**
- Create: `lib/beats/templates.ts`
- Test: `lib/beats/templates.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/beats/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BEAT_TEMPLATES, templateFirstChapterBeats, templateToVolumeSkeleton } from './templates';

describe('beat templates', () => {
  it('内置四套模板且结构完整', () => {
    expect(BEAT_TEMPLATES.map((t) => t.id)).toEqual(['golden-three', 'face-slap', 'dungeon', 'ensemble']);
    for (const t of BEAT_TEMPLATES) {
      expect(t.chapters.length).toBeGreaterThanOrEqual(3);
      for (const c of t.chapters) {
        expect(c.title).toBeTruthy();
        expect(c.outline).toBeTruthy();
        expect(c.beats.length).toBeGreaterThanOrEqual(2);
        for (const b of c.beats) {
          expect(b.title).toBeTruthy();
          expect(b.goal).toBeTruthy();
        }
      }
    }
  });

  it('转换助手产出正确形状', () => {
    const t = BEAT_TEMPLATES[0];
    const skeleton = templateToVolumeSkeleton(t);
    expect(skeleton.chapters.length).toBe(t.chapters.length);
    expect(skeleton.chapters[0].beats[0].goal).toBeTruthy();
    expect(templateFirstChapterBeats(t).length).toBe(t.chapters[0].beats.length);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/beats/templates.test.ts`

Expected: FAIL（`Cannot find module './templates'`）。

- [ ] **Step 3: 实现模板库**

Create `lib/beats/templates.ts`:

```ts
export interface Beat {
  title: string;
  goal: string;
  points?: string;
}

export interface SkeletonChapter {
  title: string;
  outline: string;
  beats: Beat[];
}

export interface SkeletonPayload {
  volumeOutline: string;
  chapters: SkeletonChapter[];
}

export interface BeatTemplate {
  id: string;
  name: string;
  description: string;
  volumeOutline: string;
  chapters: SkeletonChapter[];
}

export const BEAT_TEMPLATES: BeatTemplate[] = [
  {
    id: 'golden-three',
    name: '黄金三章',
    description: '快速建立代入感：主角陷入困境 → 金手指/转机 → 反击立威，三章内给出完整情绪闭环。',
    volumeOutline: '开篇三章：第一章以强冲突与身份代入开篇，第二章给出转机并升级危险，第三章完成首次反击立威并抛出长期目标。',
    chapters: [
      {
        title: '开局困境',
        outline: '用 1~2 个具体事件让读者记住主角的核心欲望与致命困境，章末抛出不可回避的威胁。',
        beats: [
          { title: '主角登场', goal: '展现身份、处境与核心欲望，制造第一个小冲突。', points: '动作开场，先演后述' },
          { title: '困境加码', goal: '威胁升级，主角退无可退。', points: '结尾钩子：限期/代价' },
        ],
      },
      {
        title: '转机与升级',
        outline: '金手指或外力转机出现，主角第一次使用新能力，随即遭遇更强对手。',
        beats: [
          { title: '获得转机', goal: '能力觉醒或贵人相助，给出代价与限制。' },
          { title: '初试锋芒', goal: '小胜建立读者信心，暴露新能力的边界。' },
          { title: '强敌登场', goal: '更高层对手出现，旧账新仇叠加。' },
        ],
      },
      {
        title: '反击立威',
        outline: '设计一场让读者憋屈后释放的打脸/翻盘，收回第一章钩子并展开全书目标。',
        beats: [
          { title: '冲突引爆', goal: '对手当众羞辱或下死手，情绪压制到最高点。' },
          { title: '绝地反杀', goal: '主角以出人意料的方式取胜，爽点释放。' },
          { title: '长线目标', goal: '胜利带来新身份与更大任务，转入主线。' },
        ],
      },
    ],
  },
  {
    id: 'face-slap',
    name: '打脸逆袭循环',
    description: '标准的「压 → 蓄 → 打」循环模板，适用于都市/玄幻升级剧情。',
    volumeOutline: '一个完整的打脸循环：铺垫受辱、暗中蓄力、当众反杀，并让打脸结果推动下一阶段矛盾。',
    chapters: [
      {
        title: '受辱铺垫',
        outline: '对手基于信息差当众贬低/打压主角，埋下反转依据。',
        beats: [
          { title: '轻视与侮辱', goal: '让读者与主角一起憋屈。' },
          { title: '信息差埋点', goal: '安排只有主角知道的反转筹码。' },
        ],
      },
      {
        title: '暗中蓄力',
        outline: '主角不急于发作，完成关键准备，期间配角二次嘲讽。',
        beats: [
          { title: '隐忍布局', goal: '收集证据/提升实力，展示主角谋略。' },
          { title: '二次嘲讽', goal: '对手更加得意，加深反转落差。' },
        ],
      },
      {
        title: '当众打脸',
        outline: '在众人见证下揭示真相或实力，对手全面溃败，主角获得实际利益。',
        beats: [
          { title: '公开反杀', goal: '反转证据亮出，对手颜面扫地。' },
          { title: '清算利益', goal: '收回赌注/地位/资源，爽感落地。' },
          { title: '余波钩子', goal: '引出更强者或新冲突。' },
        ],
      },
    ],
  },
  {
    id: 'dungeon',
    name: '副本探索',
    description: '探索 → 危机 → 结算的副本循环，适合升级流地图推图。',
    volumeOutline: '进入副本 → 规则摸底 → 危机爆发 → 战力结算与收获，结尾抛出下一层秘密。',
    chapters: [
      {
        title: '进入副本',
        outline: '主角与同行者进入新区域，交代规则、目标与代价。',
        beats: [
          { title: '区域规则', goal: '建立副本独特规则与风险提示。' },
          { title: '首遇异象', goal: '小异常预示危机，队伍分工。' },
        ],
      },
      {
        title: '危机爆发',
        outline: '真正的危机让队伍减员或分裂，主角暴露底牌才能破局。',
        beats: [
          { title: '陷阱发动', goal: '全员陷入险境。' },
          { title: '底牌亮出', goal: '主角承担关键任务，战力首次结算。' },
        ],
      },
      {
        title: '结算与埋伏',
        outline: '突破核心区域，收获战利品；离开时发现更深层的阴谋痕迹。',
        beats: [
          { title: '攻克核心', goal: '解决首脑/取得宝物。' },
          { title: '分配收获', goal: '战力/资源结算，队伍关系变化。' },
          { title: '下一层钩子', goal: '发现阴谋痕迹，指向后续副本。' },
        ],
      },
    ],
  },
  {
    id: 'ensemble',
    name: '群像悬疑网状',
    description: '多视角事件 → 嫌疑交织 → 第一重反转，适合悬疑与多线叙事。',
    volumeOutline: '用一场事件引出多组人物与视角，让嫌疑在人物间交织，卷末完成第一重反转并留下最大疑问。',
    chapters: [
      {
        title: '事件发生',
        outline: '异常事件发生，多个视角人物被卷入，各自隐藏动机。',
        beats: [
          { title: '发现异常', goal: '用客观视角呈现事件现场。' },
          { title: '视角分组', goal: '至少两组人马得到不同线索。' },
        ],
      },
      {
        title: '嫌疑交织',
        outline: '各组怀疑对象交错，真凶线索藏在误判之下。',
        beats: [
          { title: '互相指认', goal: '嫌疑落在最不可能的人身上。' },
          { title: '线索引爆', goal: '关键证据反转一次判断。' },
        ],
      },
      {
        title: '第一重反转',
        outline: '当众揭穿一层真相，但背后主使仍未露面。',
        beats: [
          { title: '公开揭底', goal: '洗清一个人，揪出第一层凶手。' },
          { title: '幕后阴影', goal: '新证据显示主使另有其人。' },
        ],
      },
    ],
  },
];

export function templateToVolumeSkeleton(t: BeatTemplate): SkeletonPayload {
  return {
    volumeOutline: t.volumeOutline,
    chapters: t.chapters.map((c) => ({
      title: c.title,
      outline: c.outline,
      beats: c.beats.map((b) => ({ title: b.title, goal: b.goal, points: b.points ?? '' })),
    })),
  };
}

export function templateFirstChapterBeats(t: BeatTemplate): Beat[] {
  return t.chapters[0]?.beats ?? [];
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/beats/templates.test.ts`，Expected: PASS（2 个用例）。

```bash
git add lib/beats/templates.ts lib/beats/templates.test.ts
git commit -m "feat: 节拍模板库"
```

### Task 6: 骨架/场景批量写入服务

**Files:**
- Create: `lib/beats/apply.ts`、`app/api/beats/apply-skeleton/route.ts`、`app/api/beats/apply-chapter-beats/route.ts`
- Test: `lib/beats/apply.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/beats/apply.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { listScenes } from '../db/scenes';
import { insertBeats, insertSkeleton } from './apply';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('insertSkeleton', () => {
  it('批量建章与场景卡并回填卷大纲', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const result = insertSkeleton(p.id, v.id, {
      volumeOutline: '新卷大纲',
      chapters: [
        { title: '章一', outline: '大纲一', beats: [{ title: '场景1', goal: '目标1' }] },
        { title: '章二', outline: '大纲二', beats: [
          { title: '场景2', goal: '目标2' },
          { title: '场景3', goal: '目标3', points: '要点' },
        ] },
      ],
    }, db);
    expect(result).toEqual({ chapterCount: 2, sceneCount: 3 });
    expect(db.prepare('SELECT summary FROM volume WHERE id = ?').get(v.id)).toEqual({ summary: '新卷大纲' });
  });

  it('校验卷归属并抛出错误', () => {
    const p1 = createProject({ title: '甲' }, db);
    const p2 = createProject({ title: '乙' }, db);
    const v = createVolume(p1.id, { title: '卷一' }, db);
    expect(() => insertSkeleton(p2.id, v.id, { volumeOutline: '', chapters: [] }, db)).toThrow();
  });
});

describe('insertBeats', () => {
  it('为章节批量生成场景卡', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const count = insertBeats(c.id, [
      { title: 'A', goal: 'g1' },
      { title: 'B', goal: 'g2', points: 'p2' },
    ], db);
    expect(count).toBe(2);
    expect(listScenes(c.id, db).map((s) => s.title)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/beats/apply.test.ts`

Expected: FAIL（`Cannot find module './apply'`）。

- [ ] **Step 3: 实现写入服务与路由**

Create `lib/beats/apply.ts`:

```ts
import { getDb, type DB } from '../db/client';
import { getVolume } from '../db/volumes';
import { createChapter } from '../db/chapters';
import { createScene } from '../db/scenes';
import type { Beat, SkeletonPayload } from './templates';

export function insertSkeleton(projectId: string, volumeId: string, payload: SkeletonPayload, db: DB = getDb()): { chapterCount: number; sceneCount: number } {
  const volume = getVolume(volumeId, db);
  if (!volume || volume.projectId !== projectId) throw new Error('卷不存在或不属于该项目');
  let chapterCount = 0;
  let sceneCount = 0;
  for (const ch of payload.chapters) {
    const chapter = createChapter(volumeId, { title: ch.title, outline: ch.outline }, db);
    chapterCount += 1;
    for (const beat of ch.beats ?? []) {
      createScene(chapter.id, { title: beat.title, goal: beat.goal, points: beat.points ?? '' }, db);
      sceneCount += 1;
    }
  }
  if (payload.volumeOutline) {
    db.prepare('UPDATE volume SET summary = ?, updatedAt = ? WHERE id = ?')
      .run(payload.volumeOutline, new Date().toISOString(), volumeId);
  }
  return { chapterCount, sceneCount };
}

export function insertBeats(chapterId: string, beats: Beat[], db: DB = getDb()): number {
  let count = 0;
  for (const beat of beats) {
    createScene(chapterId, { title: beat.title, goal: beat.goal, points: beat.points ?? '' }, db);
    count += 1;
  }
  return count;
}
```

Create `app/api/beats/apply-skeleton/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { insertSkeleton } from '@/lib/beats/apply';
import type { SkeletonPayload } from '@/lib/beats/templates';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  const skeleton = body?.skeleton as SkeletonPayload | undefined;
  if (!projectId || !volumeId) return NextResponse.json({ error: 'projectId 与 volumeId 必填' }, { status: 400 });
  const chapters = Array.isArray(skeleton?.chapters) ? skeleton.chapters.filter((c) => typeof c?.title === 'string' && c.title.trim()) : [];
  if (chapters.length === 0) return NextResponse.json({ error: '骨架缺少章节' }, { status: 400 });
  try {
    const counts = insertSkeleton(projectId, volumeId, {
      volumeOutline: typeof skeleton?.volumeOutline === 'string' ? skeleton.volumeOutline : '',
      chapters: chapters as SkeletonPayload['chapters'],
    });
    return NextResponse.json({ ...counts }, { status: 201 });
  } catch {
    return NextResponse.json({ error: '卷不存在或不属于该项目' }, { status: 404 });
  }
}
```

Create `app/api/beats/apply-chapter-beats/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { insertBeats } from '@/lib/beats/apply';
import type { Beat } from '@/lib/beats/templates';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const beats = Array.isArray(body?.beats) ? (body.beats as Beat[]).filter((b) => typeof b?.title === 'string' && b.title.trim()) : [];
  if (!chapterId) return NextResponse.json({ error: 'chapterId 必填' }, { status: 400 });
  if (!getChapter(chapterId)) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  if (beats.length === 0) return NextResponse.json({ error: '节拍列表为空' }, { status: 400 });
  const sceneCount = insertBeats(chapterId, beats);
  return NextResponse.json({ sceneCount }, { status: 201 });
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/beats/apply.test.ts`，Expected: PASS（3 个用例）。

```bash
git add lib/beats/apply.ts lib/beats/apply.test.ts app/api/beats
git commit -m "feat: 骨架/场景批量写入服务"
```

### Task 7: AI 大纲骨架生成

**Files:**
- Create: `lib/ai/outline.ts`、`app/api/ai/outline-generate/route.ts`
- Test: `lib/ai/outline.test.ts`

- [ ] **Step 1: 写失败测试**

Create `lib/ai/outline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGenerateMessages, mockGenerate, parseBeats, parseSkeletonPayload } from './outline';

describe('parseSkeletonPayload', () => {
  it('解析纯 JSON 与围栏 JSON 并做字段兜底', () => {
    const payload = { volumeOutline: '卷纲', chapters: [{ title: '章一', outline: '纲一', beats: [{ title: '场一', goal: '目标' }] }] };
    expect(parseSkeletonPayload(JSON.stringify(payload)).chapters).toHaveLength(1);
    expect(parseSkeletonPayload('```json\n' + JSON.stringify(payload) + '\n```').volumeOutline).toBe('卷纲');
    expect(parseSkeletonPayload('不是 JSON').chapters).toHaveLength(0);
  });

  it('解析章节级节拍', () => {
    expect(parseBeats(JSON.stringify({ beats: [{ title: 'A', goal: 'g' }] }))).toHaveLength(1);
    expect(parseBeats(JSON.stringify([{ title: 'B', goal: 'g' }]))).toHaveLength(1);
    expect(parseBeats('垃圾')).toHaveLength(0);
  });
});

describe('生成消息与 mock', () => {
  it('消息要求 JSON 输出且 mock 有确定性结构', () => {
    const msgs = buildGenerateMessages('volume', '写一卷宗门考核');
    expect(msgs[1].content).toContain('写一卷宗门考核');
    expect(msgs[1].content).toContain('JSON');
    const vol = mockGenerate('volume');
    expect(vol.kind).toBe('volume');
    expect((vol.payload as { chapters: unknown[] }).chapters.length).toBeGreaterThanOrEqual(3);
    const chap = mockGenerate('chapter');
    expect(chap.kind).toBe('chapter');
    expect((chap.payload as { beats: unknown[] }).beats.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/ai/outline.test.ts`

Expected: FAIL（`Cannot find module './outline'`）。

- [ ] **Step 3: 实现生成库与路由**

Create `lib/ai/outline.ts`:

```ts
import type { Beat, SkeletonPayload } from '../beats/templates';
import type { ChatMessage } from './provider';

export type OutlineLevel = 'chapter' | 'volume';

export interface GenerateResult {
  kind: OutlineLevel;
  payload: SkeletonPayload | { chapterOutline: string; beats: Beat[] };
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
}

export function parseSkeletonPayload(text: string): SkeletonPayload {
  try {
    const parsed = JSON.parse(stripFences(text)) as { volumeOutline?: unknown; chapters?: unknown };
    const chapters = Array.isArray(parsed.chapters)
      ? parsed.chapters
          .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
          .map((c) => ({
            title: String(c.title ?? '未命名章节'),
            outline: String(c.outline ?? ''),
            beats: Array.isArray(c.beats)
              ? c.beats
                  .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
                  .map((b) => ({ title: String(b.title ?? ''), goal: String(b.goal ?? ''), points: b.points ? String(b.points) : '' }))
              : [],
          }))
      : [];
    return { volumeOutline: typeof parsed.volumeOutline === 'string' ? parsed.volumeOutline : '', chapters };
  } catch {
    return { volumeOutline: '', chapters: [] };
  }
}

export function parseBeats(text: string): Beat[] {
  try {
    const parsed = JSON.parse(stripFences(text)) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { beats?: unknown }).beats) ? (parsed as { beats: unknown[] }).beats : [];
    return list
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => ({
        title: String(b.title ?? ''),
        goal: String(b.goal ?? ''),
        points: b.points ? String(b.points) : '',
      }));
  } catch {
    return [];
  }
}

const GENERATE_SYSTEM = [
  '你是资深网文大纲架构师，负责按爆款叙事力学生成结构骨架。',
  '只输出 JSON，不要输出任何其他文字。',
].join('\n');

export function buildGenerateMessages(level: OutlineLevel, prompt: string): ChatMessage[] {
  const shape = level === 'volume'
    ? '{"volumeOutline":"本卷主线概述","chapters":[{"title":"章节名","outline":"本章大纲","beats":[{"title":"场景名","goal":"场景目标","points":"要点(可选)"}]}]}，共 3~6 章，每章 2~4 个场景。'
    : '{"chapterOutline":"本章大纲","beats":[{"title":"场景名","goal":"场景目标","points":"要点(可选)"}]}，共 3~5 个场景。';
  return [
    { role: 'system', content: GENERATE_SYSTEM },
    { role: 'user', content: `请为以下需求生成 ${level === 'volume' ? '卷级骨架' : '章节级骨架'}，输出格式：${shape}\n\n需求：${prompt.slice(0, 800)}` },
  ];
}

export function mockGenerate(level: OutlineLevel): GenerateResult {
  if (level === 'chapter') {
    return {
      kind: 'chapter',
      payload: {
        chapterOutline: '模拟章大纲：主角被迫面对两难选择。',
        beats: [
          { title: '压力逼近', goal: '外部威胁迫近，主角时间所剩无几。' },
          { title: '内部动摇', goal: '同伴质疑或内心挣扎。' },
          { title: '做出抉择', goal: '主角下决心，代价明确。' },
          { title: '行动钩子', goal: '第一步行动并抛出新变数。' },
        ],
      },
    };
  }
  return {
    kind: 'volume',
    payload: {
      volumeOutline: '模拟卷大纲：主角在小城站稳脚跟后卷入宗门考核。',
      chapters: [
        { title: '宗门考核', outline: '考核规则公布，主角被迫参赛。', beats: [{ title: '报名风波', goal: '被轻视的报名场面。' }, { title: '规则漏洞', goal: '发现可利用的规则。' }] },
        { title: '初赛立威', outline: '初赛碾压对手，引出更强对手。', beats: [{ title: '首轮获胜', goal: '展现实力。' }, { title: '种子选手', goal: '下一轮对手登场。' }] },
        { title: '决赛反转', outline: '决赛揭晓幕后黑手。', beats: [{ title: '绝境', goal: '陷入陷阱。' }, { title: '反转取胜', goal: '揭底并获胜。' }] },
      ],
    },
  };
}
```

Create `app/api/ai/outline-generate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildGenerateMessages, mockGenerate, parseBeats, parseSkeletonPayload, type OutlineLevel } from '@/lib/ai/outline';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const level = body?.level as OutlineLevel;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';
  if (level !== 'chapter' && level !== 'volume') return NextResponse.json({ error: 'level 必填（chapter/volume）' }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: 'prompt 不能为空' }, { status: 400 });

  const chapter = level === 'chapter' ? getChapter(chapterId) : null;
  const volume = level === 'volume' ? getVolume(volumeId) : null;
  if (level === 'chapter' && !chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  if (level === 'volume' && !volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
  const projectId = chapter?.projectId ?? volume?.projectId ?? '';

  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      const result = mockGenerate(level);
      createAIRequest({ projectId, chapterId: level === 'chapter' ? chapterId : null, kind: 'outline', model: 'mock', prompt });
      return NextResponse.json(result);
    }
    const config = await getAIConfig();
    if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请在右上角「设置」填写', 400);
    const text = await complete({ messages: buildGenerateMessages(level, prompt), temperature: 0.7 });
    createAIRequest({ projectId, chapterId: level === 'chapter' ? chapterId : null, kind: 'outline', model: config.model, prompt });
    if (level === 'volume') {
      const payload = parseSkeletonPayload(text);
      if (payload.chapters.length === 0) throw new AIError('生成结果无法解析，请重试或缩短需求', 502);
      return NextResponse.json({ kind: 'volume', payload });
    }
    const beats = parseBeats(text);
    if (beats.length === 0) throw new AIError('生成结果无法解析，请重试或缩短需求', 502);
    return NextResponse.json({ kind: 'chapter', payload: { chapterOutline: '', beats } });
  } catch (err) {
    if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/ai/outline.test.ts`，Expected: PASS（3 个用例）。

```bash
git add lib/ai/outline.ts lib/ai/outline.test.ts app/api/ai/outline-generate
git commit -m "feat: AI 大纲骨架生成"
```

### Task 8: A2 UI（章/卷模板应用与 AI 骨架预览）

**Files:**
- Modify: `components/workspace/ChapterOutlineView.tsx`、`components/workspace/VolumeOutlineModal.tsx`

- [ ] **Step 1: 扩展大纲视图（章模板 + AI 场景骨架）**

Modify `components/workspace/ChapterOutlineView.tsx`：

imports 改为：

```tsx
import { BEAT_TEMPLATES, templateFirstChapterBeats } from '@/lib/beats/templates';
import type { Beat } from '@/lib/beats/templates';
```

组件内新增状态（放在 `busy/error` 声明之后）：

```tsx
  const [templateId, setTemplateId] = useState(BEAT_TEMPLATES[0].id);
  const [templateMsg, setTemplateMsg] = useState('');
  const [genGoal, setGenGoal] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<Beat[] | null>(null);
```

在 `remove` 函数之后新增：

```tsx
  async function applyChapterTemplate() {
    const template = BEAT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const beats = templateFirstChapterBeats(template);
    setBusy(true);
    setTemplateMsg('');
    try {
      const res = await fetch('/api/beats/apply-chapter-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, beats }),
      });
      if (!res.ok) return;
      setTemplateMsg(`已按「${template.name}」添加 ${beats.length} 个场景卡`);
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function generateBeats() {
    if (!genGoal.trim()) return;
    setGenLoading(true);
    setGenError('');
    setPreview(null);
    try {
      const res = await fetch('/api/ai/outline-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'chapter', chapterId: chapter.id, prompt: genGoal.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(json.error ?? '生成失败');
        return;
      }
      setPreview((json.payload?.beats as Beat[]) ?? []);
    } finally {
      setGenLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview || preview.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/beats/apply-chapter-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, beats: preview }),
      });
      if (res.ok) {
        setTemplateMsg(`已应用 AI 骨架，添加 ${preview.length} 个场景卡`);
        setPreview(null);
        setGenGoal('');
        await mutate();
      }
    } finally {
      setBusy(false);
    }
  }
```

在 `{error && <p className="mt-2 text-xs text-red-600">{error}</p>}` 之前插入：

```tsx
      <div className="mt-3 rounded border border-dashed border-gray-200 p-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
            {BEAT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => void applyChapterTemplate()} disabled={busy} className="text-blue-600 hover:underline disabled:text-gray-300">
            应用章模板
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={() => void generateBeats()} disabled={busy || genLoading} className="text-blue-600 hover:underline disabled:text-gray-300">
            AI 生成场景骨架
          </button>
        </div>
        {templateMsg && <p className="mt-1 text-xs text-emerald-600">{templateMsg}</p>}
        {genLoading && <p className="mt-1 text-xs text-amber-500">生成中…</p>}
        {genError && <p className="mt-1 text-xs text-red-600">{genError}</p>}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={genGoal}
            onChange={(e) => setGenGoal(e.target.value)}
            placeholder="本章目标（AI 生成用，可选）"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
          />
        </div>
        {preview && (
          <div className="mt-2 rounded bg-gray-50 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">预览：{preview.length} 个场景</span>
              <span className="flex gap-2">
                <button onClick={() => void applyPreview()} disabled={busy} className="text-emerald-600 hover:underline">应用</button>
                <button onClick={() => setPreview(null)} className="text-gray-400 hover:underline">放弃</button>
              </span>
            </div>
            <ul className="mt-1 space-y-1 text-xs text-gray-600">
              {preview.map((b, i) => (
                <li key={i}><span className="font-medium">{b.title}</span>：{b.goal}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
```

- [ ] **Step 2: 扩展卷大纲弹窗（卷模板 + AI 卷骨架）**

Modify `components/workspace/VolumeOutlineModal.tsx`：

imports：

```tsx
import { BEAT_TEMPLATES, templateToVolumeSkeleton } from '@/lib/beats/templates';
import type { SkeletonPayload } from '@/lib/beats/templates';
```

状态：

```tsx
  const [templateId, setTemplateId] = useState(BEAT_TEMPLATES[0].id);
  const [templateMsg, setTemplateMsg] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<SkeletonPayload | null>(null);
```

在 `saveSummary` 后新增：

```tsx
  async function applyTemplate() {
    const template = BEAT_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const skeleton = templateToVolumeSkeleton(template);
    setBusy(true);
    setTemplateMsg('');
    try {
      const res = await fetch('/api/beats/apply-skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, volumeId: volume.id, skeleton }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '应用失败');
        return;
      }
      setTemplateMsg(`已按「${template.name}」生成 ${json.chapterCount} 章 / ${json.sceneCount} 场景`);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function generateVolume() {
    if (!genPrompt.trim()) return;
    setGenLoading(true);
    setGenError('');
    setPreview(null);
    try {
      const res = await fetch('/api/ai/outline-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'volume', volumeId: volume.id, prompt: genPrompt.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(json.error ?? '生成失败');
        return;
      }
      setPreview(json.payload as SkeletonPayload);
    } finally {
      setGenLoading(false);
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch('/api/beats/apply-skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, volumeId: volume.id, skeleton: preview }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setTemplateMsg(`已应用 AI 骨架：${json.chapterCount} 章 / ${json.sceneCount} 场景`);
        setPreview(null);
        setGenPrompt('');
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  }
```

在卷大纲 textarea 的 label 之后插入：

```tsx
          <div className="mt-3 rounded border border-dashed border-gray-200 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
                {BEAT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={() => void applyTemplate()} disabled={busy} className="text-blue-600 hover:underline disabled:text-gray-300">应用卷模板</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => void generateVolume()} disabled={busy || genLoading} className="text-blue-600 hover:underline disabled:text-gray-300">AI 生成卷骨架</button>
            </div>
            {templateMsg && <p className="mt-1 text-emerald-600">{templateMsg}</p>}
            {genLoading && <p className="mt-1 text-amber-500">生成中…</p>}
            {genError && <p className="mt-1 text-red-600">{genError}</p>}
            <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="卷目标（AI 生成用）" className="mt-2 w-full rounded border border-gray-300 px-2 py-1" />
            {preview && (
              <div className="mt-2 rounded bg-gray-50 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-600">预览：{preview.chapters.length} 章（卷大纲{preview.volumeOutline ? '已含' : '为空'}）</span>
                  <span className="flex gap-2">
                    <button onClick={() => void applyPreview()} disabled={busy} className="text-emerald-600 hover:underline">应用</button>
                    <button onClick={() => setPreview(null)} className="text-gray-400 hover:underline">放弃</button>
                  </span>
                </div>
                {preview.volumeOutline && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-gray-500">{preview.volumeOutline}</p>}
              </div>
            )}
          </div>
```

- [ ] **Step 3: 验证并提交**

Run: `npm run lint`，Expected: 通过。mock 模式浏览器检查：章大纲视图「应用章模板」追加场景卡；「AI 生成场景骨架」出预览并可应用；卷弹窗同样两条路径可用。

```bash
git add components/workspace/ChapterOutlineView.tsx components/workspace/VolumeOutlineModal.tsx
git commit -m "feat: 模板应用与 AI 骨架预览 UI"
```

### Task 9: 大纲逻辑预演接口

**Files:**
- Modify: `lib/ai/outline.ts`、`lib/ai/outline.test.ts`
- Create: `app/api/ai/outline-check/route.ts`

- [ ] **Step 1: 扩展消息构建与测试**

在 `lib/ai/outline.ts` 末尾追加：

```ts
export function buildOutlineCheckMessages(input: { volumeOutline?: string; chapterOutline?: string; scenes?: Beat[] }): ChatMessage[] {
  const lines = [
    input.volumeOutline ? `卷大纲：\n${input.volumeOutline}` : '',
    input.chapterOutline ? `章大纲：\n${input.chapterOutline}` : '',
    input.scenes?.length ? `场景卡：\n${input.scenes.map((s) => `- ${s.title}：${s.goal}`).join('\n')}` : '',
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: [
        '你是资深网文大纲评审。请检查结构逻辑：因果前置是否充分、是否有机械降神（Deus ex Machina）、节拍之间是否断裂。',
        '只输出 JSON 数组，元素形如 {"type":"因果前置不足|疑似机械降神|节拍断裂","text":"涉及内容","reason":"问题说明","suggestion":"修改建议"}。',
        '无问题输出 []。',
      ].join('\n'),
    },
    { role: 'user', content: lines.join('\n\n').slice(0, 3000) },
  ];
}
```

在 `lib/ai/outline.test.ts` 增加一个用例：

```ts
  it('逻辑预演消息包含卷/章大纲与场景目标', () => {
    const msgs = buildOutlineCheckMessages({ volumeOutline: '卷纲', chapterOutline: '章纲', scenes: [{ title: 'A', goal: '目标' }] });
    expect(msgs[1].content).toContain('卷纲');
    expect(msgs[1].content).toContain('章纲');
    expect(msgs[1].content).toContain('目标');
    expect(msgs[0].content).toContain('机械降神');
  });
```

import 增加 `buildOutlineCheckMessages`。

- [ ] **Step 2: 实现检查路由**

Create `app/api/ai/outline-check/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter, listChaptersByProject } from '@/lib/db/chapters';
import { getVolume } from '@/lib/db/volumes';
import { listScenes } from '@/lib/db/scenes';
import { createAIRequest } from '@/lib/db/aiRequests';
import { buildOutlineCheckMessages } from '@/lib/ai/outline';
import { parseConflicts } from '@/lib/ai/consistency';
import type { ConsistencyIssue } from '@/lib/types';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const chapterId = typeof body?.chapterId === 'string' ? body.chapterId : '';
  const volumeId = typeof body?.volumeId === 'string' ? body.volumeId : '';

  let projectId = '';
  let input: { volumeOutline?: string; chapterOutline?: string; scenes?: ReturnType<typeof listScenes> } = {};
  if (chapterId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    projectId = chapter.projectId;
    input = { chapterOutline: chapter.outline, scenes: listScenes(chapterId) };
  } else if (volumeId) {
    const volume = getVolume(volumeId);
    if (!volume) return NextResponse.json({ error: '卷不存在' }, { status: 404 });
    projectId = volume.projectId;
    const outlines = listChaptersByProject(projectId).filter((c) => c.volumeId === volumeId).map((c) => `[${c.title}] ${c.outline || '（未写大纲）'}`);
    input = { volumeOutline: volume.summary, chapterOutline: outlines.join('\n') };
  } else {
    return NextResponse.json({ error: 'chapterId 或 volumeId 必填' }, { status: 400 });
  }

  let issues: ConsistencyIssue[] = [];
  let aiSkipped: string | null = null;
  let model = 'mock';
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      issues = [
        { type: '疑似机械降神', text: '高潮援军', reason: '援军此前未在卷内登场（模拟输出）', suggestion: '在早前章节埋下其出场的理由', source: 'llm' },
        { type: '因果前置不足', text: '主角反转', reason: '反转依据未前置（模拟输出）', suggestion: '前两章补充线索', source: 'llm' },
      ];
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，请先在设置中填写', 400);
      model = config.model;
      const text = await complete({ messages: buildOutlineCheckMessages(input), temperature: 0.2 });
      issues = parseConflicts(text);
    }
    createAIRequest({ projectId, chapterId: chapterId || null, kind: 'outline-check', model, prompt: JSON.stringify(input).slice(0, 300) });
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = '大纲预演失败，请重试';
  }
  return NextResponse.json({ issues, aiSkipped });
}
```

- [ ] **Step 3: 验证并提交**

Run: `npx vitest run lib/ai/outline.test.ts`（Expected: PASS 4 个用例）、`npm run lint`。

```bash
git add lib/ai/outline.ts lib/ai/outline.test.ts app/api/ai/outline-check
git commit -m "feat: 大纲逻辑预演接口"
```

### Task 10: A3 UI（大纲视图与卷弹窗逻辑预演）

**Files:**
- Modify: `components/workspace/ChapterOutlineView.tsx`、`components/workspace/VolumeOutlineModal.tsx`

- [ ] **Step 1: 大纲视图增加预演**

Modify `components/workspace/ChapterOutlineView.tsx`：

```tsx
import type { ConsistencyIssue } from '@/lib/types';
```

状态：

```tsx
  const [checkIssues, setCheckIssues] = useState<ConsistencyIssue[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkSkipped, setCheckSkipped] = useState('');
```

函数（放在 `applyPreview` 后）：

```tsx
  async function runOutlineCheck() {
    setCheckLoading(true);
    try {
      const res = await fetch('/api/ai/outline-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      const json = await res.json().catch(() => ({}));
      setCheckIssues((json.issues as ConsistencyIssue[]) ?? []);
      setCheckSkipped(json.aiSkipped ?? '');
    } finally {
      setCheckLoading(false);
    }
  }
```

在场景卡 `</ul>` 之后追加：

```tsx
      <div className="mt-4 flex items-center justify-between">
        <h4 className="font-medium text-gray-700">逻辑预演</h4>
        <button onClick={() => void runOutlineCheck()} disabled={checkLoading} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
          {checkLoading ? '检查中…' : '预演'}
        </button>
      </div>
      {checkSkipped && <p className="mt-1 text-xs text-amber-600">{checkSkipped}</p>}
      {checkIssues.length === 0 && !checkLoading && <p className="mt-1 text-xs text-gray-400">未发现问题</p>}
      <ul className="mt-1 space-y-2">
        {checkIssues.map((issue, i) => (
          <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
            <span className="font-medium text-amber-800">{issue.type}</span>
            <span className="ml-2 text-gray-500">{issue.text}</span>
            <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>
            <p className="text-gray-600">建议：{issue.suggestion}</p>
          </li>
        ))}
      </ul>
```

- [ ] **Step 2: 卷弹窗增加预演**

Modify `components/workspace/VolumeOutlineModal.tsx`：

```tsx
import type { ConsistencyIssue } from '@/lib/types';
```

状态与函数：

```tsx
  const [checkIssues, setCheckIssues] = useState<ConsistencyIssue[]>([]);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkSkipped, setCheckSkipped] = useState('');

  async function runVolumeCheck() {
    setCheckLoading(true);
    try {
      const res = await fetch('/api/ai/outline-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumeId: volume.id }),
      });
      const json = await res.json().catch(() => ({}));
      setCheckIssues((json.issues as ConsistencyIssue[]) ?? []);
      setCheckSkipped(json.aiSkipped ?? '');
    } finally {
      setCheckLoading(false);
    }
  }
```

在卷预演按钮与列表插入到「保存大纲」按钮行之前（`</div>` 前的 `flex justify-end` 容器之前）：

```tsx
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">卷逻辑预演</h4>
              <button onClick={() => void runVolumeCheck()} disabled={checkLoading} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">
                {checkLoading ? '检查中…' : '预演'}
              </button>
            </div>
            {checkSkipped && <p className="mt-1 text-xs text-amber-600">{checkSkipped}</p>}
            {checkIssues.length === 0 && !checkLoading && <p className="mt-1 text-xs text-gray-400">未发现问题</p>}
            <ul className="mt-1 space-y-2">
              {checkIssues.map((issue, i) => (
                <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                  <span className="font-medium text-amber-800">{issue.type}</span>
                  <span className="ml-2 text-gray-500">{issue.text}</span>
                  <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>
                  <p className="text-gray-600">建议：{issue.suggestion}</p>
                </li>
              ))}
            </ul>
          </div>
```

- [ ] **Step 3: 验证并提交**

Run: `npm run lint`，Expected: 通过。

```bash
git add components/workspace/ChapterOutlineView.tsx components/workspace/VolumeOutlineModal.tsx
git commit -m "feat: 大纲逻辑预演 UI"
```

### Task 11: 全量验收与收尾

**Files:** 无新增。

- [ ] **Step 1: 三项全绿**

```powershell
npm test
npm run lint
npm run build
```

Expected: `npm test` 全量通过（原 59 + scene 3 + templates 2 + apply 3 + outline 4 = 71 个用例）；lint 通过；build 成功。

- [ ] **Step 2: mock 模式浏览器验收清单**

- [x] 编辑器「正文/大纲」切换：大纲视图可编辑章大纲（防抖保存），场景卡增删改与完成状态切换正常，切回正文内容不丢。
- [x] 卷行「纲」弹窗：卷大纲保存生效；「应用卷模板」生成 n 章/n 场景并提示；「AI 生成卷骨架」预览后可应用。
- [x] 章大纲视图：「应用章模板」追加场景卡；「AI 生成场景骨架」预览后可应用。
- [x] 「逻辑预演」在章大纲与卷弹窗均输出结构化预警（mock 返回两条示例）。
- [x] 刷新后场景卡、章大纲、卷大纲全部持久化。

- [ ] **Step 3: 执行记录与最终提交**

在计划末尾补充「执行记录（与计划的偏差）」，然后：

```bash
git add -A
git commit -m "docs: P1-A 完成验收记录"
```

## P1-A 完成标准（DoD）

1. `npm test`、`npm run lint`、`npm run build` 全绿（有输出为证）。
2. mock 浏览器验收清单全部通过。
3. 每个 Task 独立提交，工作区干净。
4. 场景独立正文区、P1-B~E、P2 明确未实现，不虚假宣称。

## 执行记录（与计划的偏差）

1. **数据丢失事件与 WAL 折回修复**：执行期间一次 dev 服务器异常终止导致 WAL 帧丢失，早前演示数据（UI验收测试 项目及其卷/章/快照等）不可恢复；用户项目「我当丧尸那些年」及其角色「林峰」因已折回主文件而幸存。立即修复：`openDatabase()` 在迁移后执行 `PRAGMA wal_checkpoint(TRUNCATE)`，每次启动把 WAL 折回主文件。已向用户透明说明，后续再有强制终止不再有同类大窗口丢失。
2. **SSE 取消竞态修复**：日志暴露用户在真实使用中取消 AI 伴写（关闭浮层）时，服务端在流关闭后继续 `enqueue` 并对已锁定流重复 `cancel` 报错。为 ghostwrite/rewrite 两个路由增加 `closed` 标记、reader 引用与幂等关闭/释放。
3. **AI 大纲用户消息补「只输出 JSON」**：测试暴露用户消息缺少 JSON 指令，补充后更符合模型输出要求。
4. **测试总数**：全量 71 个用例与计划一致。
5. **验收环境**：用户已在演示项目「墨影演示」写入约 766 字正文，验收改在独立项目「P1A验收」中进行，未触碰用户正文。

验证证据：`npm test` 71/71 通过；`npm run lint` 无告警；`npm run build` 编译成功；mock 模式浏览器实测「正文/大纲切换、章大纲防抖保存、场景卡增删与状态、章模板应用（+2）、AI 场景骨架预览应用（+4）、章逻辑预演、卷大纲保存、卷模板应用（3章/8场景）、AI 卷骨架应用（3章/6场景）、卷逻辑预演、重载持久化（7 章 + 场景卡 7 + 大纲文本）」全链路通过。
