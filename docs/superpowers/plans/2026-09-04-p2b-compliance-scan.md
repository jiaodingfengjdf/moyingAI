# P2-b 批量章节敏感词与合规扫描 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。

### Task 1: 词库与扫描器

`lib/compliance/terms.ts`：分类词表（涉政/涉黄/暴力血腥/侵权线索，演示词条）+ `scanText(text)` → `Hit[]`（category/term/count/snippets）。

### Task 2: 路由

`POST /api/projects/[id]/compliance-scan {chapterIds?}`：扫描指定或全项目章节（正文非空才返回），结果 {chapterId,title,wordCount,hits[]}。

### Task 3: UI

`ComplianceModal.tsx`：顶栏「合规」按钮打开；逐章列出命中（分类徽标/词条×次数/片段）；「复制报告」。
`WorkspaceShell.tsx`：顶栏按钮与弹窗状态。

### Task 4: 验收

`npm test`（+3≈91）、lint、build；mock 浏览器：给演示章节写入含演示词文本 → 顶栏合规 → 显示命中。

## 执行记录

验收证据：`npm test`（实际全量见最终验证）、lint 通过；mock 浏览器实测：顶栏「合规」→ 扫描全项目 → 「扫描 2 章，命中 1 章 / 3 处」，逐条展示「涉政/集会示威×2/游行请愿×1」及片段。无偏差。
