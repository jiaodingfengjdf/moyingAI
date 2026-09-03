# M3 记忆与质检 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成墨影 AI MVP 的最后一个里程碑：实体关系列表管理、伏笔追踪看板（三态 + 超期预警）、一致性校验（确定性规则引擎 + LLM 审查，右栏红色警报）、角色状态只读面板，以及整体打磨与验收。

**Architecture:** 新增 `lib/db/relationships.ts`、`lib/db/foreshadowing.ts`、`lib/ai/consistency.ts` 与对应 API；客户端新增关系/伏笔表单与看板，右栏接入「一致性警报」与「角色状态」面板。一致性校验复用 M2 的四层上下文装配与 Provider，新增非流式 `complete()`。

**Tech Stack:** 与 M1/M2 完全一致，零新增依赖。

---

## 关键决策

- 伏笔「回收区间」按全书章节序号理解（作者视角的第 N 章）；当全书章节总数已超过 `simmerRangeEnd` 且伏笔未回收时，判定为「遗忘伏笔」并在看板标黄。
- 一致性校验输出两类来源：`rule`（确定性规则，当前覆盖“死者复生”）与 `llm`（Continuity Agent 结构化审查）；无密钥时仅返回规则结果并附带提示。
- 校验触发：保存成功且正文相对上次检查有变化时，防抖 3 秒后台自动执行；右栏同时提供「重新检查」按钮（避免每次击键都消耗 token）。
- 关系在 MVP 用「列表」呈现（从属/好感度/类型/备注），完整图谱可视化留待 P1。
- 诊断按钮继续置灰（毒点扫描属 P1），本里程碑不实现。

## 文件结构

```
lib/db/
├─ relationships.ts            (Create) 关系仓库
├─ foreshadowing.ts            (Create) 伏笔仓库 + 超期判定
├─ entities.ts                 (Modify) listEntityStatus()
└─ *.test.ts                   (Create) 对应测试
lib/ai/
├─ provider.ts                 (Modify) complete()
└─ consistency.ts              (Create) 规则引擎 + LLM 审查消息与解析
app/api/
├─ projects/[id]/relationships/route.ts   (Create) GET / POST
├─ relationships/[id]/route.ts            (Create) GET / PATCH / DELETE
├─ projects/[id]/foreshadowing/route.ts   (Create) GET / POST
├─ foreshadowing/[id]/route.ts            (Create) GET / PATCH / DELETE
├─ projects/[id]/entity-status/route.ts   (Create) GET
└─ chapters/[id]/check/route.ts           (Create) POST
components/workspace/
├─ RelationshipForm.tsx        (Create) 关系表单
├─ ForeshadowingForm.tsx       (Create) 伏笔表单
├─ ForeshadowingPanel.tsx      (Create) 左栏伏笔看板
├─ EntityPanel.tsx             (Modify) 关系列表 + 表单入口
├─ Sidebar.tsx                 (Modify) 接入伏笔看板
└─ InspectorPanel.tsx          (Modify) 一致性警报 + 角色状态面板
lib/types.ts                   (Modify) Relationship / Foreshadowing / ConsistencyIssue 类型
```

## 任务分解

### Task 1: 关系仓库

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/db/relationships.ts`
- Test: `lib/db/relationships.test.ts`

- [ ] **Step 1: 补类型与失败测试**

在 `lib/types.ts` 追加：

```ts
export interface Relationship {
  id: string;
  projectId: string;
  fromEntityId: string;
  toEntityId: string;
  fromName: string;
  toName: string;
  type: string;
  strength: number;
  chapterAnchorId: string | null;
  note: string;
}
```

Create `lib/db/relationships.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createEntity } from './entities';
import { createRelationship, deleteRelationship, listRelationships, updateRelationship } from './relationships';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('relationships repo', () => {
  it('创建并携带双方实体名列出', () => {
    const p = createProject({ title: '书' }, db);
    const a = createEntity({ projectId: p.id, type: 'character', name: '林砚' }, db);
    const b = createEntity({ projectId: p.id, type: 'character', name: '苏晚' }, db);
    const r = createRelationship({ projectId: p.id, fromEntityId: a.id, toEntityId: b.id, type: '恋人', strength: 80, note: '互生好感' }, db);
    expect(r.fromName).toBe('林砚');
    expect(r.toName).toBe('苏晚');
    expect(r.strength).toBe(80);
    expect(listRelationships(p.id, db)).toHaveLength(1);
  });

  it('更新与删除', () => {
    const p = createProject({ title: '书' }, db);
    const a = createEntity({ projectId: p.id, type: 'character', name: '甲' }, db);
    const b = createEntity({ projectId: p.id, type: 'character', name: '乙' }, db);
    const r = createRelationship({ projectId: p.id, fromEntityId: a.id, toEntityId: b.id, type: '宿敌', strength: -60 }, db);
    const updated = updateRelationship(r.id, { strength: -80, note: '仇恨加深' }, db);
    expect(updated?.strength).toBe(-80);
    expect(deleteRelationship(r.id, db)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/relationships.test.ts`

Expected: FAIL（`Cannot find module './relationships'`）。

- [ ] **Step 3: 实现关系仓库**

Create `lib/db/relationships.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Relationship } from '../types';

const SELECT = `
  SELECT r.id, r.projectId, r.fromEntityId, r.toEntityId, r.type, r.strength, r.chapterAnchorId, r.note,
    ef.name AS fromName, et.name AS toName
  FROM relationship r
  JOIN entity ef ON ef.id = r.fromEntityId
  JOIN entity et ON et.id = r.toEntityId
`;

export function listRelationships(projectId: string, db: DB = getDb()): Relationship[] {
  return db.prepare(`${SELECT} WHERE r.projectId = ? ORDER BY r.type, ef.name, et.name`).all(projectId) as unknown as Relationship[];
}

export function getRelationship(id: string, db: DB = getDb()): Relationship | null {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
  return (row as unknown as Relationship | undefined) ?? null;
}

export function createRelationship(
  input: { projectId: string; fromEntityId: string; toEntityId: string; type: string; strength: number; chapterAnchorId?: string | null; note?: string },
  db: DB = getDb(),
): Relationship {
  if (input.fromEntityId === input.toEntityId) throw new Error('不能与自身建立关系');
  const id = createId();
  db.prepare(`INSERT INTO relationship (id, projectId, fromEntityId, toEntityId, type, strength, chapterAnchorId, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.fromEntityId, input.toEntityId, input.type, input.strength, input.chapterAnchorId ?? null, input.note ?? '');
  return getRelationship(id, db)!;
}

export function updateRelationship(
  id: string,
  patch: { type?: string; strength?: number; chapterAnchorId?: string | null; note?: string },
  db: DB = getDb(),
): Relationship | null {
  const current = getRelationship(id, db);
  if (!current) return null;
  db.prepare('UPDATE relationship SET type = ?, strength = ?, chapterAnchorId = ?, note = ? WHERE id = ?')
    .run(patch.type ?? current.type, patch.strength ?? current.strength, patch.chapterAnchorId ?? current.chapterAnchorId, patch.note ?? current.note, id);
  return getRelationship(id, db)!;
}

export function deleteRelationship(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM relationship WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/db/relationships.test.ts`，Expected: PASS（2 个用例）。

```bash
git add lib/types.ts lib/db/relationships.ts lib/db/relationships.test.ts
git commit -m "feat: 实体关系仓库"
```

### Task 2: 伏笔仓库与超期判定

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/db/foreshadowing.ts`
- Test: `lib/db/foreshadowing.test.ts`

- [ ] **Step 1: 补类型与失败测试**

在 `lib/types.ts` 追加：

```ts
export interface Foreshadowing {
  id: string;
  projectId: string;
  title: string;
  status: ForeshadowingStatus;
  plantChapterId: string | null;
  simmerRangeStart: number | null;
  simmerRangeEnd: number | null;
  payoffChapterId: string | null;
  relatedEntityIds: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
  plantChapterTitle: string | null;
  payoffChapterTitle: string | null;
  overdue: boolean;
}
```

Create `lib/db/foreshadowing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './client';
import { createProject } from './projects';
import { createVolume } from './volumes';
import { createChapter } from './chapters';
import { createForeshadowing, isOverdue, listForeshadowing, updateForeshadowing } from './foreshadowing';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('foreshadowing repo', () => {
  it('创建并携带章节标题与关联实体往返', () => {
    const p = createProject({ title: '书' }, db);
    const v = createVolume(p.id, { title: '卷一' }, db);
    const c = createChapter(v.id, { title: '第一章' }, db);
    const f = createForeshadowing({ projectId: p.id, title: '祖传玉佩', status: 'planting', plantChapterId: c.id, simmerRangeStart: 5, simmerRangeEnd: 10, relatedEntityIds: ['e1', 'e2'], note: '暗藏血脉线索' }, db);
    expect(f.plantChapterTitle).toBe('第一章');
    expect(f.relatedEntityIds).toEqual(['e1', 'e2']);
    expect(listForeshadowing(p.id, db)).toHaveLength(1);
  });

  it('超期判定与回收', () => {
    const p = createProject({ title: '书' }, db);
    const f = createForeshadowing({ projectId: p.id, title: '旧案', status: 'simmering', simmerRangeEnd: 3 }, db);
    expect(isOverdue(f, 10)).toBe(true);
    expect(isOverdue(f, 2)).toBe(false);
    const done = updateForeshadowing(f.id, { status: 'payoff' }, db);
    expect(isOverdue(done!, 10)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/db/foreshadowing.test.ts`

Expected: FAIL（`Cannot find module './foreshadowing'`）。

- [ ] **Step 3: 实现伏笔仓库**

Create `lib/db/foreshadowing.ts`:

```ts
import { createId } from './id';
import { getDb, type DB } from './client';
import type { Foreshadowing, ForeshadowingStatus } from '../types';

const SELECT = `
  SELECT f.*, pc.title AS plantChapterTitle, poc.title AS payoffChapterTitle
  FROM foreshadowing f
  LEFT JOIN chapter pc ON pc.id = f.plantChapterId
  LEFT JOIN chapter poc ON poc.id = f.payoffChapterId
`;

function rowToForeshadowing(row: unknown): Foreshadowing {
  const r = row as { relatedEntityIds: string } & Omit<Foreshadowing, 'relatedEntityIds'>;
  return { ...r, relatedEntityIds: JSON.parse(r.relatedEntityIds) as string[] };
}

export function isOverdue(f: Foreshadowing, totalChapters: number): boolean {
  return f.status !== 'payoff' && typeof f.simmerRangeEnd === 'number' && totalChapters > f.simmerRangeEnd;
}

export function countProjectChapters(projectId: string, db: DB = getDb()): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM chapter c JOIN volume v ON c.volumeId = v.id WHERE v.projectId = ?').get(projectId) as { n: number };
  return Number(row.n);
}

export function listForeshadowing(projectId: string, db: DB = getDb()): Foreshadowing[] {
  const total = countProjectChapters(projectId, db);
  const rows = db.prepare(`${SELECT} WHERE f.projectId = ? ORDER BY f.createdAt DESC, f.rowid DESC`).all(projectId);
  return (rows as unknown[]).map((row) => ({ ...rowToForeshadowing(row), overdue: isOverdue(rowToForeshadowing(row), total) }));
}

export function getForeshadowing(id: string, db: DB = getDb()): Foreshadowing | null {
  const row = db.prepare(`${SELECT} WHERE f.id = ?`).get(id);
  if (!row) return null;
  const f = rowToForeshadowing(row);
  return { ...f, overdue: isOverdue(f, countProjectChapters(f.projectId, db)) };
}

export function createForeshadowing(
  input: {
    projectId: string; title: string; status?: ForeshadowingStatus; plantChapterId?: string | null;
    simmerRangeStart?: number | null; simmerRangeEnd?: number | null; payoffChapterId?: string | null;
    relatedEntityIds?: string[]; note?: string;
  },
  db: DB = getDb(),
): Foreshadowing {
  const id = createId();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO foreshadowing (id, projectId, title, status, plantChapterId, simmerRangeStart, simmerRangeEnd, payoffChapterId, relatedEntityIds, note, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.projectId, input.title, input.status ?? 'planting', input.plantChapterId ?? null,
      input.simmerRangeStart ?? null, input.simmerRangeEnd ?? null, input.payoffChapterId ?? null,
      JSON.stringify(input.relatedEntityIds ?? []), input.note ?? '', now, now);
  return getForeshadowing(id, db)!;
}

export function updateForeshadowing(
  id: string,
  patch: {
    title?: string; status?: ForeshadowingStatus; plantChapterId?: string | null;
    simmerRangeStart?: number | null; simmerRangeEnd?: number | null; payoffChapterId?: string | null;
    relatedEntityIds?: string[]; note?: string;
  },
  db: DB = getDb(),
): Foreshadowing | null {
  const current = getForeshadowing(id, db);
  if (!current) return null;
  const next = {
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    plantChapterId: patch.plantChapterId !== undefined ? patch.plantChapterId : current.plantChapterId,
    simmerRangeStart: patch.simmerRangeStart !== undefined ? patch.simmerRangeStart : current.simmerRangeStart,
    simmerRangeEnd: patch.simmerRangeEnd !== undefined ? patch.simmerRangeEnd : current.simmerRangeEnd,
    payoffChapterId: patch.payoffChapterId !== undefined ? patch.payoffChapterId : current.payoffChapterId,
    relatedEntityIds: patch.relatedEntityIds ?? current.relatedEntityIds,
    note: patch.note ?? current.note,
  };
  db.prepare(`UPDATE foreshadowing SET title = ?, status = ?, plantChapterId = ?, simmerRangeStart = ?, simmerRangeEnd = ?, payoffChapterId = ?, relatedEntityIds = ?, note = ?, updatedAt = ? WHERE id = ?`)
    .run(next.title, next.status, next.plantChapterId, next.simmerRangeStart, next.simmerRangeEnd, next.payoffChapterId,
      JSON.stringify(next.relatedEntityIds), next.note, new Date().toISOString(), id);
  return getForeshadowing(id, db)!;
}

export function deleteForeshadowing(id: string, db: DB = getDb()): boolean {
  return db.prepare('DELETE FROM foreshadowing WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/db/foreshadowing.test.ts`，Expected: PASS（2 个用例）。

```bash
git add lib/types.ts lib/db/foreshadowing.ts lib/db/foreshadowing.test.ts
git commit -m "feat: 伏笔仓库与超期判定"
```

### Task 3: 一致性校验（规则引擎 + LLM 审查）

**Files:**
- Modify: `lib/types.ts`、`lib/ai/provider.ts`（`complete()`）
- Create: `lib/ai/consistency.ts`
- Test: `lib/ai/consistency.test.ts`

- [ ] **Step 1: 补类型与失败测试**

在 `lib/types.ts` 追加：

```ts
export interface ConsistencyIssue {
  type: string;
  text: string;
  reason: string;
  suggestion: string;
  source: 'rule' | 'llm';
}
```

Create `lib/ai/consistency.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from '../db/client';
import { createProject } from '../db/projects';
import { createEntity, addTimelineEntry } from '../db/entities';
import { buildConsistencyMessages, parseConflicts, runRuleChecks } from './consistency';

let db: DB;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('runRuleChecks', () => {
  it('检测死者复生', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '林砚', fields: { 状态: '死亡' } }, db);
    expect(runRuleChecks({ projectId: p.id, content: '林砚按住刀柄站了起来。', db })).toHaveLength(1);
    expect(runRuleChecks({ projectId: p.id, content: '林砚被复活后按住刀柄。', db })[0].source).toBe('rule');
    expect(runRuleChecks({ projectId: p.id, content: '林砚按住刀柄复活。', db })).toHaveLength(0);
  });

  it('时间线最新状态覆盖初始字段', () => {
    const p = createProject({ title: '书' }, db);
    const e = createEntity({ projectId: p.id, type: 'character', name: '苏晚', fields: { 状态: '死亡' } }, db);
    addTimelineEntry(e.id, { change: { 状态: '存活' }, note: '假死归来' }, db);
    expect(runRuleChecks({ projectId: p.id, content: '苏晚微微一笑。', db })).toHaveLength(0);
  });
});

describe('LLM 审查解析', () => {
  it('解析纯 JSON 与带围栏的 JSON', () => {
    const payload = JSON.stringify([{ type: '设定冲突', text: '境界不符', reason: '上章为筑基', suggestion: '改为炼气' }]);
    expect(parseConflicts(payload)).toHaveLength(1);
    expect(parseConflicts('```json\n' + payload + '\n```')[0].source).toBe('llm');
    expect(parseConflicts('不是 JSON')).toHaveLength(0);
  });

  it('构建审查消息包含原文与要求', () => {
    const msgs = buildConsistencyMessages({ volumeTitle: '卷一', chapterTitle: '第一章', outline: '', entities: [], history: [] }, '待检正文');
    expect(msgs[0].content).toContain('第一章');
    expect(msgs[1].content).toContain('待检正文');
    expect(msgs[1].content).toContain('JSON');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/ai/consistency.test.ts`

Expected: FAIL（`Cannot find module './consistency'`）。

- [ ] **Step 3: 实现规则引擎与 LLM 审查**

Create `lib/ai/consistency.ts`:

```ts
import { listEntities, listTimeline } from '../db/entities';
import type { DB } from '../db/client';
import type { ConsistencyIssue, Entity, EntityTimelineEntry } from '../types';
import { renderContextBlock, type AssembledContext } from './context';
import { SYSTEM_PROMPT } from './prompts';
import type { ChatMessage } from './provider';

const DEAD_VALUES = ['死亡', '已死', '阵亡', '身亡', '战死'];
const REVIVE_HINTS = ['复活', '重生', '诈死', '未死', '假死'];

export function latestStatus(entity: Entity, timeline: EntityTimelineEntry[]): Record<string, unknown> {
  return { ...entity.fields, ...(timeline[0]?.change ?? {}) };
}

export function runRuleChecks(opts: { projectId: string; content: string; db?: DB }): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  for (const entity of listEntities(opts.projectId, opts.db)) {
    const names = [entity.name, ...entity.aliases];
    if (!names.some((n) => n && opts.content.includes(n))) continue;
    const timeline = listTimeline(entity.id, opts.db);
    const status = latestStatus(entity, timeline);
    const dead = Object.entries(status).some(([key, value]) => /状态|生死|存活/.test(key) && DEAD_VALUES.includes(String(value).trim()));
    if (dead && !REVIVE_HINTS.some((h) => opts.content.includes(h))) {
      issues.push({
        type: '疑似死者复生',
        text: entity.name,
        reason: `设定卡或时间线中「${entity.name}」处于死亡状态，但正文中再次出场`,
        suggestion: '请补上复活/重生依据，或先更新其时间线状态再让其出场',
        source: 'rule',
      });
    }
  }
  return issues;
}

const CONSISTENCY_INSTRUCTION = [
  '请对照世界观设定卡与本章新增正文，做一致性审查。',
  '只输出 JSON 数组，不要输出任何其他文字。每个元素形如：',
  '{"type":"冲突类型","text":"涉及文本","reason":"与哪条设定矛盾","suggestion":"修改建议"}',
  '无冲突时输出 []。',
].join('\n');

export function buildConsistencyMessages(ctx: AssembledContext, content: string): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${renderContextBlock(ctx)}` },
    { role: 'user', content: `${CONSISTENCY_INSTRUCTION}\n\n待审正文：\n\n${content.slice(-2000)}` },
  ];
}

export function parseConflicts(text: string): ConsistencyIssue[] {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        type: String(item.type ?? '设定冲突'),
        text: String(item.text ?? ''),
        reason: String(item.reason ?? ''),
        suggestion: String(item.suggestion ?? ''),
        source: 'llm' as const,
      }));
  } catch {
    return [];
  }
}
```

在 `lib/ai/provider.ts` 末尾追加非流式封装：

```ts
export async function complete(options: StreamChatOptions, configOverride?: AIConfig): Promise<string> {
  const stream = await streamChat(options, configOverride);
  const reader = stream.getReader();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += value;
  }
  return out;
}
```

- [ ] **Step 4: 运行测试确认通过并提交**

Run: `npx vitest run lib/ai/consistency.test.ts`，Expected: PASS（5 个用例）。

```bash
git add lib/types.ts lib/ai/provider.ts lib/ai/consistency.ts lib/ai/consistency.test.ts
git commit -m "feat: 一致性规则引擎与 LLM 审查"
```

### Task 4: 角色状态聚合端点

**Files:**
- Modify: `lib/db/entities.ts`（`listEntityStatus()`）、`app/api/projects/[id]/entity-status/route.ts`

- [ ] **Step 1: 实现聚合函数与路由**

在 `lib/db/entities.ts` 末尾追加：

```ts
export interface EntityStatus {
  id: string;
  name: string;
  type: string;
  latest: Record<string, unknown>;
  latestNote: string;
  updatedAt: string;
}

export function listEntityStatus(projectId: string, db: DB = getDb()): EntityStatus[] {
  return listEntities(projectId, db)
    .map((e) => {
      const timeline = listTimeline(e.id, db);
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        latest: timeline[0]?.change ?? {},
        latestNote: timeline[0]?.note ?? '',
        updatedAt: timeline[0]?.createdAt ?? e.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);
}
```

Create `app/api/projects/[id]/entity-status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listEntityStatus } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ status: listEntityStatus(id) });
}
```

- [ ] **Step 2: 验证并提交**

Run: `npm run lint`，Expected: 通过。

```bash
git add lib/db/entities.ts "app/api/projects/[id]/entity-status/route.ts"
git commit -m "feat: 角色状态聚合端点"
```

### Task 5: 关系 API 与关系管理 UI

**Files:**
- Create: `app/api/projects/[id]/relationships/route.ts`、`app/api/relationships/[id]/route.ts`、`components/workspace/RelationshipForm.tsx`
- Modify: `components/workspace/EntityPanel.tsx`

- [ ] **Step 1: 创建关系 API**

Create `app/api/projects/[id]/relationships/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createRelationship, listRelationships } from '@/lib/db/relationships';
import { getEntity } from '@/lib/db/entities';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ relationships: listRelationships(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const fromEntityId = typeof body?.fromEntityId === 'string' ? body.fromEntityId : '';
  const toEntityId = typeof body?.toEntityId === 'string' ? body.toEntityId : '';
  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  const strength = Number(body?.strength);
  if (!fromEntityId || !toEntityId || fromEntityId === toEntityId) return NextResponse.json({ error: '请选择两个不同的实体' }, { status: 400 });
  if (!type || !Number.isFinite(strength)) return NextResponse.json({ error: '类型与好感度必填' }, { status: 400 });
  if (!getEntity(fromEntityId) || !getEntity(toEntityId)) return NextResponse.json({ error: '实体不存在' }, { status: 404 });
  const relationship = createRelationship({
    projectId: id,
    fromEntityId,
    toEntityId,
    type,
    strength: Math.max(-100, Math.min(100, strength)),
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ relationship }, { status: 201 });
}
```

Create `app/api/relationships/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteRelationship, getRelationship, updateRelationship } from '@/lib/db/relationships';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const relationship = getRelationship(id);
  if (!relationship) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ relationship });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateRelationship>[1] = {};
  if (typeof body?.type === 'string' && body.type.trim()) patch.type = body.type.trim();
  if (typeof body?.strength === 'number' && Number.isFinite(body.strength)) patch.strength = Math.max(-100, Math.min(100, body.strength));
  if (typeof body?.note === 'string') patch.note = body.note;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const relationship = updateRelationship(id, patch);
  if (!relationship) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ relationship });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteRelationship(id)) return NextResponse.json({ error: '关系不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 实现关系表单**

Create `components/workspace/RelationshipForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { Entity, Relationship } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  projectId: string;
  relationship: Relationship | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RelationshipForm({ projectId, relationship, onClose, onSaved }: Props) {
  const { data } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [fromEntityId, setFromEntityId] = useState(relationship?.fromEntityId ?? '');
  const [toEntityId, setToEntityId] = useState(relationship?.toEntityId ?? '');
  const [type, setType] = useState(relationship?.type ?? '从属');
  const [strength, setStrength] = useState(relationship?.strength ?? 0);
  const [note, setNote] = useState(relationship?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entities = data?.entities ?? [];

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(relationship ? `/api/relationships/${relationship.id}` : `/api/projects/${projectId}/relationships`, {
        method: relationship ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEntityId, toEntityId, type, strength, note }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{relationship ? '编辑关系' : '新建关系'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <select value={fromEntityId} onChange={(e) => setFromEntityId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">选择实体 A</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={toEntityId} onChange={(e) => setToEntityId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">选择实体 B</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input value={type} onChange={(e) => setType(e.target.value)} placeholder="关系类型（恋人/宿敌/师徒…）" className="w-full rounded border border-gray-300 px-2 py-1" />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            好感度：{strength}（-100 敌视 ~ +100 亲密）
            <input type="range" min={-100} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注" className="w-full rounded border border-gray-300 px-2 py-1" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
          <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在实体档案馆加入关系列表**

Modify `components/workspace/EntityPanel.tsx`：新增 relationships SWR、`relationForm` 状态，实体列表后渲染：

```tsx
import RelationshipForm from './RelationshipForm';
import type { Entity, EntityType, Relationship } from '@/lib/types';
```

```tsx
  const { data: relationData, mutate: mutateRelations } = useSWR<{ relationships: Relationship[] }>(`/api/projects/${projectId}/relationships`, fetcher);
  const [relationForm, setRelationForm] = useState<Relationship | 'new' | null>(null);
  const [confirmingRelation, setConfirmingRelation] = useState<string | null>(null);
  const relationships = relationData?.relationships ?? [];
```

在实体分组列表后追加：

```tsx
      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">实体关系（{relationships.length}）</span>
          <button onClick={() => setRelationForm('new')} className="text-blue-600">+ 关系</button>
        </div>
        {relationships.map((r) => (
          <div key={r.id} className="group flex items-center justify-between gap-1 py-0.5 pl-3 text-gray-600">
            <button onClick={() => setRelationForm(r)} className="min-w-0 flex-1 truncate text-left" title={r.note}>
              {r.fromName} → {r.toName} · {r.type} · {r.strength}
            </button>
            <button
              onClick={async () => {
                if (confirmingRelation !== r.id) {
                  setConfirmingRelation(r.id);
                  return;
                }
                setConfirmingRelation(null);
                await fetch(`/api/relationships/${r.id}`, { method: 'DELETE' });
                await mutateRelations();
              }}
              className={confirmingRelation === r.id ? 'shrink-0 text-red-600' : 'shrink-0 text-gray-400 hover:text-red-600'}
            >
              {confirmingRelation === r.id ? '确认删?' : '删'}
            </button>
          </div>
        ))}
        {relationships.length === 0 && <p className="mt-1 pl-3 text-xs text-gray-300">暂无关系</p>}
      </div>
```

并在组件末尾（EntityForm 旁）追加：

```tsx
      {relationForm && (
        <RelationshipForm
          projectId={projectId}
          relationship={relationForm === 'new' ? null : relationForm}
          onClose={() => setRelationForm(null)}
          onSaved={() => {
            setRelationForm(null);
            void mutateRelations();
          }}
        />
      )}
```

- [ ] **Step 4: 验证并提交**

Run: `npm run lint`，Expected: 通过。curl 冒烟（任一项目 id）：

```powershell
curl.exe -s -X POST "http://localhost:3000/api/projects/<项目id>/relationships" -H "Content-Type: application/json" -d '{"fromEntityId":"<实体A>","toEntityId":"<实体B>","type":"lover","strength":80}'
curl.exe -s "http://localhost:3000/api/projects/<项目id>/relationships"
```

Expected: 创建 `201`，列表返回带 `fromName/toName` 的关系。

```bash
git add app/api/projects app/api/relationships components/workspace/RelationshipForm.tsx components/workspace/EntityPanel.tsx
git commit -m "feat: 关系 API 与关系管理 UI"
```

### Task 6: 伏笔 API 与看板

**Files:**
- Create: `app/api/projects/[id]/foreshadowing/route.ts`、`app/api/foreshadowing/[id]/route.ts`、`components/workspace/ForeshadowingForm.tsx`、`components/workspace/ForeshadowingPanel.tsx`
- Modify: `components/workspace/Sidebar.tsx`

- [ ] **Step 1: 创建伏笔 API**

Create `app/api/projects/[id]/foreshadowing/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createForeshadowing, listForeshadowing } from '@/lib/db/foreshadowing';
import type { ForeshadowingStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const STATUSES: ForeshadowingStatus[] = ['planting', 'simmering', 'payoff'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ foreshadowing: listForeshadowing(id) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '伏笔标题不能为空' }, { status: 400 });
  const status = body?.status as ForeshadowingStatus;
  const f = createForeshadowing({
    projectId: id,
    title,
    status: STATUSES.includes(status) ? status : 'planting',
    plantChapterId: typeof body?.plantChapterId === 'string' ? body.plantChapterId : null,
    simmerRangeStart: typeof body?.simmerRangeStart === 'number' ? body.simmerRangeStart : null,
    simmerRangeEnd: typeof body?.simmerRangeEnd === 'number' ? body.simmerRangeEnd : null,
    payoffChapterId: typeof body?.payoffChapterId === 'string' ? body.payoffChapterId : null,
    relatedEntityIds: Array.isArray(body?.relatedEntityIds) ? body.relatedEntityIds.filter((x): x is string => typeof x === 'string') : [],
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return NextResponse.json({ foreshadowing: f }, { status: 201 });
}
```

Create `app/api/foreshadowing/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteForeshadowing, getForeshadowing, updateForeshadowing } from '@/lib/db/foreshadowing';
import type { ForeshadowingStatus } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
const STATUSES: ForeshadowingStatus[] = ['planting', 'simmering', 'payoff'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const f = getForeshadowing(id);
  if (!f) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ foreshadowing: f });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const patch: Parameters<typeof updateForeshadowing>[1] = {};
  if (typeof body?.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if (typeof body?.status === 'string' && STATUSES.includes(body.status as ForeshadowingStatus)) patch.status = body.status as ForeshadowingStatus;
  if ('plantChapterId' in (body ?? {})) patch.plantChapterId = typeof body.plantChapterId === 'string' ? body.plantChapterId : null;
  if ('simmerRangeStart' in (body ?? {})) patch.simmerRangeStart = typeof body.simmerRangeStart === 'number' ? body.simmerRangeStart : null;
  if ('simmerRangeEnd' in (body ?? {})) patch.simmerRangeEnd = typeof body.simmerRangeEnd === 'number' ? body.simmerRangeEnd : null;
  if ('payoffChapterId' in (body ?? {})) patch.payoffChapterId = typeof body.payoffChapterId === 'string' ? body.payoffChapterId : null;
  if (Array.isArray(body?.relatedEntityIds)) patch.relatedEntityIds = body.relatedEntityIds.filter((x): x is string => typeof x === 'string');
  if (typeof body?.note === 'string') patch.note = body.note;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 });
  const f = updateForeshadowing(id, patch);
  if (!f) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ foreshadowing: f });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!deleteForeshadowing(id)) return NextResponse.json({ error: '伏笔不存在' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 实现伏笔表单**

Create `components/workspace/ForeshadowingForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { ChapterWithVolume, Entity, Foreshadowing, ForeshadowingStatus } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const STATUSES: { value: ForeshadowingStatus; label: string }[] = [
  { value: 'planting', label: '埋设中' },
  { value: 'simmering', label: '发酵中' },
  { value: 'payoff', label: '已回收' },
];

interface Props {
  projectId: string;
  foreshadowing: Foreshadowing | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ForeshadowingForm({ projectId, foreshadowing, onClose, onSaved }: Props) {
  const { data: chaptersData } = useSWR<{ chapters: ChapterWithVolume[] }>(`/api/projects/${projectId}/chapters`, fetcher);
  const { data: entitiesData } = useSWR<{ entities: Entity[] }>(`/api/projects/${projectId}/entities`, fetcher);
  const [title, setTitle] = useState(foreshadowing?.title ?? '');
  const [status, setStatus] = useState<ForeshadowingStatus>(foreshadowing?.status ?? 'planting');
  const [plantChapterId, setPlantChapterId] = useState(foreshadowing?.plantChapterId ?? '');
  const [simmerRangeStart, setSimmerRangeStart] = useState(foreshadowing?.simmerRangeStart?.toString() ?? '');
  const [simmerRangeEnd, setSimmerRangeEnd] = useState(foreshadowing?.simmerRangeEnd?.toString() ?? '');
  const [payoffChapterId, setPayoffChapterId] = useState(foreshadowing?.payoffChapterId ?? '');
  const [relatedIds, setRelatedIds] = useState<string[]>(foreshadowing?.relatedEntityIds ?? []);
  const [note, setNote] = useState(foreshadowing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chapters = chaptersData?.chapters ?? [];
  const entities = entitiesData?.entities ?? [];

  function toggleEntity(id: string) {
    setRelatedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save() {
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(foreshadowing ? `/api/foreshadowing/${foreshadowing.id}` : `/api/projects/${projectId}/foreshadowing`, {
        method: foreshadowing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          status,
          plantChapterId: plantChapterId || null,
          simmerRangeStart: simmerRangeStart ? Number(simmerRangeStart) : null,
          simmerRangeEnd: simmerRangeEnd ? Number(simmerRangeEnd) : null,
          payoffChapterId: payoffChapterId || null,
          relatedEntityIds: relatedIds,
          note,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{foreshadowing ? '编辑伏笔' : '新建伏笔'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="伏笔标题（如：祖传玉佩）" className="w-full rounded border border-gray-300 px-2 py-1" />
          <div className="flex gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as ForeshadowingStatus)} className="rounded border border-gray-300 px-2 py-1">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={plantChapterId} onChange={(e) => setPlantChapterId(e.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1">
              <option value="">埋设章节（无）</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.volumeTitle}·{c.title}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">回收区间</span>
            <input value={simmerRangeStart} onChange={(e) => setSimmerRangeStart(e.target.value)} placeholder="起（章序号）" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
            <span>~</span>
            <input value={simmerRangeEnd} onChange={(e) => setSimmerRangeEnd(e.target.value)} placeholder="止（章序号）" className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1" />
          </div>
          <select value={payoffChapterId} onChange={(e) => setPayoffChapterId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1">
            <option value="">回收章节（无）</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.volumeTitle}·{c.title}</option>)}
          </select>
          <div>
            <span className="text-gray-500">关联实体</span>
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
              {entities.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={relatedIds.includes(e.id)} onChange={() => toggleEntity(e.id)} />
                  {e.name}
                </label>
              ))}
            </div>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="备注" className="w-full rounded border border-gray-300 px-2 py-1" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">取消</button>
          <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 实现伏笔看板**

Create `components/workspace/ForeshadowingPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import ForeshadowingForm from './ForeshadowingForm';
import type { Foreshadowing } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const STATUS_LABELS: Record<Foreshadowing['status'], string> = {
  planting: '埋设',
  simmering: '发酵',
  payoff: '已回收',
};

export default function ForeshadowingPanel({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<{ foreshadowing: Foreshadowing[] }>(`/api/projects/${projectId}/foreshadowing`, fetcher);
  const [editing, setEditing] = useState<Foreshadowing | 'new' | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const list = data?.foreshadowing ?? [];

  async function remove(f: Foreshadowing) {
    if (confirmingId !== f.id) {
      setConfirmingId(f.id);
      return;
    }
    setConfirmingId(null);
    await fetch(`/api/foreshadowing/${f.id}`, { method: 'DELETE' });
    await mutate();
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-gray-500">伏笔跟踪</h3>
        <button onClick={() => setEditing('new')} className="text-blue-600">+ 伏笔</button>
      </div>
      {list.length === 0 && <p className="mt-1 text-xs text-gray-300">暂无伏笔</p>}
      <ul className="mt-1 space-y-1">
        {list.map((f) => (
          <li key={f.id} className={`rounded px-2 py-1 ${f.overdue ? 'bg-amber-50' : ''}`}>
            <div className="flex items-center justify-between gap-1">
              <button onClick={() => setEditing(f)} className="min-w-0 flex-1 truncate text-left text-gray-700">
                {f.title}
              </button>
              <button
                onClick={() => void remove(f)}
                className={confirmingId === f.id ? 'shrink-0 text-red-600' : 'shrink-0 text-gray-400 hover:text-red-600'}
              >
                {confirmingId === f.id ? '确认删?' : '删'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 pl-1 text-xs text-gray-400">
              <span>{STATUS_LABELS[f.status]}</span>
              {f.simmerRangeStart != null && <span>回收区间 {f.simmerRangeStart}~{f.simmerRangeEnd ?? '∞'}</span>}
              {f.payoffChapterTitle && <span>回收于 {f.payoffChapterTitle}</span>}
              {f.overdue && <span className="font-medium text-amber-600">⚠ 遗忘伏笔</span>}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <ForeshadowingForm
          projectId={projectId}
          foreshadowing={editing === 'new' ? null : editing}
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

- [ ] **Step 4: 在侧栏接入伏笔看板**

Modify `components/workspace/Sidebar.tsx`：

```tsx
import ForeshadowingPanel from './ForeshadowingPanel';
```

把占位块：

```tsx
      <div className="mt-6 border-t border-gray-100 pt-3">
        <h3 className="mt-3 text-xs font-medium text-gray-400">伏笔跟踪</h3>
        <p className="mt-1 text-xs text-gray-300">M3 里程碑启用</p>
      </div>
```

替换为：

```tsx
      <ForeshadowingPanel projectId={projectId} />
```

- [ ] **Step 5: 验证并提交**

Run: `npm run lint`，Expected: 通过。curl 冒烟：创建伏笔后列表带 `overdue=false`；把 `simmerRangeEnd` 设为 1（当前项目已有 1 章以上）时 `overdue=true`。

```bash
git add app/api/projects app/api/foreshadowing components/workspace/ForeshadowingForm.tsx components/workspace/ForeshadowingPanel.tsx components/workspace/Sidebar.tsx
git commit -m "feat: 伏笔 API 与看板（含超期预警）"
```

### Task 7: 一致性检查路由与右栏警报/角色状态

**Files:**
- Create: `app/api/chapters/[id]/check/route.ts`
- Modify: `components/workspace/InspectorPanel.tsx`

- [ ] **Step 1: 实现检查路由**

Create `app/api/chapters/[id]/check/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getChapter } from '@/lib/db/chapters';
import { assembleContext } from '@/lib/ai/context';
import { buildConsistencyMessages, parseConflicts, runRuleChecks } from '@/lib/ai/consistency';
import { AIError, complete, getAIConfig } from '@/lib/ai/provider';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const chapter = getChapter(id);
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const content = typeof body?.content === 'string' ? body.content : chapter.content;

  const ruleIssues = runRuleChecks({ projectId: chapter.projectId, content });
  let llmIssues: ReturnType<typeof parseConflicts> = [];
  let aiSkipped: string | null = null;
  try {
    if (process.env.INKPULSE_AI_MOCK === '1') {
      llmIssues = [{ type: '设定冲突（模拟）', text: '示例冲突文本', reason: '模拟审查输出', suggestion: '接入真实密钥后由模型给出建议', source: 'llm' }];
    } else {
      const config = await getAIConfig();
      if (!config.apiKey) throw new AIError('尚未配置 AI 密钥，仅执行规则检查', 400);
      const ctx = await assembleContext({ projectId: chapter.projectId, chapterId: id, before: content.slice(-2000), after: '' });
      const text = await complete({ messages: buildConsistencyMessages(ctx, content), temperature: 0.2 });
      llmIssues = parseConflicts(text);
    }
  } catch (err) {
    if (err instanceof AIError) aiSkipped = err.message;
    else aiSkipped = 'AI 审查失败，仅返回规则检查结果';
  }
  return NextResponse.json({ issues: [...ruleIssues, ...llmIssues], aiSkipped });
}
```

- [ ] **Step 2: 右栏接入一致性警报与角色状态**

Modify `components/workspace/InspectorPanel.tsx`：

imports 增加：

```tsx
import { useRef } from 'react';
import type { AIRequest, ChapterSnapshot, ChapterWithVolume, ConsistencyIssue } from '@/lib/types';
```

新增 SWR 与状态：

```tsx
  const { data: statusData } = useSWR<{ status: Array<{ id: string; name: string; type: string; latest: Record<string, unknown>; latestNote: string }> }>(
    chapter ? `/api/projects/${chapter.projectId}/entity-status` : null,
    fetcher,
  );
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [aiSkipped, setAiSkipped] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const lastCheckedHash = useRef('');

  async function runCheck(content: string) {
    if (!chapter) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json().catch(() => ({}));
      setIssues((json.issues as ConsistencyIssue[]) ?? []);
      setAiSkipped(json.aiSkipped ?? null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (saveState !== 'saved' || !chapter) return;
    if (chapter.content === lastCheckedHash.current) return;
    lastCheckedHash.current = chapter.content;
    const timer = setTimeout(() => void runCheck(chapter.content), 3000);
    return () => clearTimeout(timer);
  }, [saveState, chapter]);
```

把两个占位 section 替换为：

```tsx
      <section className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-500">一致性警报</h3>
          <button onClick={() => chapter && void runCheck(chapter.content)} disabled={!chapter || checking} className="text-xs text-blue-600 disabled:text-gray-300">
            {checking ? '检查中…' : '重新检查'}
          </button>
        </div>
        {checking && <p className="mt-1 text-xs text-gray-400">正在检查…</p>}
        {!checking && issues.length === 0 && <p className="mt-1 text-xs text-gray-400">{aiSkipped ? `已通过规则检查；${aiSkipped}` : '未发现冲突'}</p>}
        <ul className="mt-1 space-y-2">
          {issues.map((issue, i) => (
            <li key={i} className="rounded border border-red-100 bg-red-50 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-700">{issue.type}</span>
                <span className="text-gray-400">{issue.source === 'rule' ? '规则' : 'AI'}</span>
              </div>
              {issue.text && <p className="mt-0.5 text-red-600">{issue.text}</p>}
              {issue.reason && <p className="mt-0.5 text-gray-600">原因：{issue.reason}</p>}
              {issue.suggestion && <p className="mt-0.5 text-gray-600">建议：{issue.suggestion}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 p-3">
        <h3 className="text-xs font-medium text-gray-500">角色状态 · 信息差</h3>
        {(statusData?.status ?? []).length === 0 && <p className="mt-1 text-xs text-gray-400">暂无实体状态</p>}
        <ul className="mt-1 space-y-1">
          {(statusData?.status ?? []).map((s) => (
            <li key={s.id} className="text-xs text-gray-600">
              <span className="font-medium">{s.name}</span>
              <span className="text-gray-400"> · {Object.entries(s.latest).map(([k, v]) => `${k}=${String(v)}`).join(', ') || '无状态'}</span>
            </li>
          ))}
        </ul>
      </section>
```

- [ ] **Step 3: 验证并提交**

Run: `npm run lint`，Expected: 通过。mock 模式 curl：

```powershell
curl.exe -s -X POST http://localhost:3000/api/chapters/<章节id>/check -H "Content-Type: application/json" -d '{"content":"林砚按住刀柄。"}'
curl.exe -s http://localhost:3000/api/projects/<项目id>/entity-status
```

Expected: check 返回含 `rule/llm` 来源的 `issues`；entity-status 返回实体最新状态。

```bash
git add "app/api/chapters/[id]/check" components/workspace/InspectorPanel.tsx
git commit -m "feat: 一致性检查与右栏警报/角色状态"
```

### Task 8: 全量验收与收尾

**Files:** 无新增。

- [ ] **Step 1: 三项全绿**

```powershell
npm test
npm run lint
npm run build
```

Expected: `npm test` 全部 PASS（M1+M2 51 个 + 关系 2、伏笔 2、一致性 5，共 60 个用例）；lint 通过；build 成功。

- [ ] **Step 2: mock 模式浏览器验收清单**

- [ ] 左栏可新建/编辑/删除关系（好感度滑杆、类型、备注），列表展示 A→B·类型·好感度。
- [ ] 左栏可新建/编辑/删除伏笔；把回收区间上界设得小于当前章节数时出现黄色「⚠ 遗忘伏笔」。
- [ ] 右栏「角色状态」展示实体最新时间线状态。
- [ ] 修改正文保存后约 3 秒自动出现「一致性警报」；「重新检查」按钮可手动触发；无冲突时显示「未发现冲突」。
- [ ] 刷新后关系、伏笔、警报状态均持久化。

- [ ] **Step 3: 执行记录与最终提交**

在计划末尾补充「执行记录（与计划的偏差）」，然后：

```bash
git add -A
git commit -m "docs: M3 完成验收记录"
```

## M3 完成标准（DoD）

1. `npm test`、`npm run lint`、`npm run build` 三项全绿（有输出为证）。
2. mock 模式浏览器验收清单全部通过；真实密钥联调给出明确结果（可后置）。
3. 每个 Task 均有独立提交，工作区干净。
4. MVP（M1+M2+M3）全部 P0 能力交付完成；P1/P2 明确标注未实现，不虚假宣称。
