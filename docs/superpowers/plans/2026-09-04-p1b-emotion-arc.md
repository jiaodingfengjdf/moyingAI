# P1-B 情绪脉冲模拟 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans 逐任务执行本计划（checkbox 追踪）。

**Goal:** 为章节做 LLM 情绪分析（压抑/期待/释放 0~10 + 一句话驱动），整卷批量分析与 SVG 折线图，输出连续低迷/无效爽感预警。

**Architecture:** 迁移 5 新增 `chapter_analysis`；`lib/ai/emotion.ts` 为纯逻辑（解析/消息/mock/预警）；路由 analyze/batch/list；右栏情绪面板 + 折线图组件。

**Tech Stack:** 既有技术栈，零新增依赖。

---

## 文件结构

```
lib/db/schema.ts                (Modify) 迁移 5
lib/db/client.test.ts           (Modify) user_version 5 + chapter_analysis
lib/db/analyses.ts / .test.ts   (Create) upsert/get/list
lib/ai/emotion.ts / .test.ts    (Create) parse/messages/mock/warnings
app/api/ai/emotion-analyze/route.ts  (Create)
app/api/ai/emotion-batch/route.ts    (Create)
app/api/projects/[id]/emotion/route.ts (Create) GET 列表
components/workspace/EmotionChart.tsx (Create)
components/workspace/InspectorPanel.tsx (Modify) 情绪区
```

### Task 1: 迁移 5 与分析仓库

在 `lib/db/schema.ts` MIGRATIONS 末尾追加：

```sql
CREATE TABLE IF NOT EXISTS chapter_analysis (
  chapterId TEXT PRIMARY KEY REFERENCES chapter(id) ON DELETE CASCADE,
  buildUp REAL NOT NULL,
  anticipation REAL NOT NULL,
  release REAL NOT NULL,
  driver TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

`client.test.ts`：TABLES 加 `'chapter_analysis'`，user_version 断言改 5。

Create `lib/db/analyses.ts`：

```ts
import { getDb, type DB } from './client';

export interface ChapterAnalysis {
  chapterId: string;
  buildUp: number;
  anticipation: number;
  release: number;
  driver: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function upsertAnalysis(input: Omit<ChapterAnalysis, 'createdAt' | 'updatedAt'>, db: DB = getDb()): ChapterAnalysis {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chapter_analysis (chapterId, buildUp, anticipation, release, driver, model, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chapterId) DO UPDATE SET buildUp = excluded.buildUp, anticipation = excluded.anticipation,
      release = excluded.release, driver = excluded.driver, model = excluded.model, updatedAt = excluded.updatedAt
  `).run(input.chapterId, input.buildUp, input.anticipation, input.release, input.driver, input.model, now, now);
  return getAnalysis(input.chapterId, db)!;
}

export function getAnalysis(chapterId: string, db: DB = getDb()): ChapterAnalysis | null {
  const row = db.prepare('SELECT chapterId, buildUp, anticipation, release, driver, model, createdAt, updatedAt FROM chapter_analysis WHERE chapterId = ?').get(chapterId);
  return (row as unknown as ChapterAnalysis | undefined) ?? null;
}

export function listAnalysesByProject(projectId: string, db: DB = getDb()): (ChapterAnalysis & { title: string; volumeTitle: string })[] {
  return db.prepare(`
    SELECT a.*, c.title, v.title AS volumeTitle
    FROM chapter_analysis a
    JOIN chapter c ON c.id = a.chapterId
    JOIN volume v ON v.id = c.volumeId
    WHERE v.projectId = ?
    ORDER BY v."order" ASC, c."order" ASC
  `).all(projectId) as unknown as (ChapterAnalysis & { title: string; volumeTitle: string })[];
}
```

测试 `lib/db/analyses.test.ts`：upsert 覆盖、get、按项目列出（3 个用例）。

### Task 2: 情绪纯逻辑

Create `lib/ai/emotion.ts`：

```ts
import type { ChatMessage } from './provider';

export interface EmotionScores { buildUp: number; anticipation: number; release: number; driver: string }

function clamp(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : fallback;
}

export function parseAnalysis(text: string): EmotionScores {
  const stripped = text.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  try {
    const j = JSON.parse(stripped) as Record<string, unknown>;
    return {
      buildUp: clamp(j.buildUp),
      anticipation: clamp(j.anticipation),
      release: clamp(j.release),
      driver: typeof j.driver === 'string' ? j.driver.slice(0, 120) : '',
    };
  } catch {
    return { buildUp: 0, anticipation: 0, release: 0, driver: '' };
  }
}

export function buildAnalysisMessages(title: string, content: string): ChatMessage[] {
  return [
    { role: 'system', content: '你是网文情绪分析师。只输出 JSON：{"buildUp":0~10 压抑值,"anticipation":0~10 期待值,"release":0~10 释放度,"driver":"不超过 20 字的一句话情绪驱动说明"}。' },
    { role: 'user', content: `分析本章：${title}\n\n正文节选：\n${content.slice(-3000)}` },
  ];
}

export function mockAnalysis(content: string): EmotionScores {
  const base = content.length % 4;
  return { buildUp: 7 - base, anticipation: 6 + base, release: 5 + base, driver: '模拟驱动：危险逼近，主角必须抉择' };
}

export function emotionWarnings(rows: Array<{ release: number; buildUp: number }>): string[] {
  const warnings: string[] = [];
  for (let i = 0; i + 2 < rows.length; i++) {
    if (rows.slice(i, i + 3).every((r) => r.release <= 3)) {
      warnings.push(`第 ${i + 1}~${i + 3} 章连续低迷（release ≤ 3），存在劝退风险`);
      i += 2;
    }
  }
  rows.forEach((r, i) => {
    if (r.release >= 8 && r.buildUp <= 2) warnings.push(`第 ${i + 1} 章无铺垫高释放，疑似无效爽感`);
  });
  return warnings;
}
```

测试：parse 兜底与截断、mock 确定性、连续 3 章低迷与无效爽感预警、消息包含正文。

### Task 3: 路由

- `POST /api/ai/emotion-analyze {chapterId}`：mock→upsert；真实→config/key→complete→parse→upsert；返回 {analysis}。
- `POST /api/ai/emotion-batch {volumeId}`：取卷下章（≤20）逐章同逻辑，记录 ai_request(kind='emotion')，返回 {count, results}。
- `GET /api/projects/[id]/emotion` → {rows}。

### Task 4: 情绪面板 UI

`EmotionChart.tsx`：接收 rows（含章节标题），按序号归一化画三条 SVG 折线（buildUp 灰蓝/anticipation 琥珀/release 玫瑰），宽 360 高 120，无点文字、仅线图 + 图例。

`InspectorPanel.tsx` 在 AI 建议历史上方插入「情绪脉冲」区：当前章三条进度条与 driver；按钮「分析本章」「批量分析整卷」；批量后 mutate emotion SWR；列表行数 ≥2 显示 EmotionChart；warnings 黄色列表。

### Task 5: 验收

`npm test`（新增分析 3 + 情绪 5 ≈ 8，全量 79）、lint、build；mock 浏览器：打开章 → 分析本章出条柱与 driver → 批量分析 → 出现折线与两条预警（mock 构造 warning 场景：批量 mock 值未必触发；验证 UI 出现即可，预警函数已单测）；刷新持久化（列表来自表）。
