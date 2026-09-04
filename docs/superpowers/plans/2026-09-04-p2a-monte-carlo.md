# P2-a 蒙特卡洛剧情分支推演 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。

### Task 1: 推演库

`lib/ai/monteCarlo.ts`：

```ts
export interface Branch { title: string; immediate: string; mid: string; risk: string; probability: string; hook: string }
export function buildMcMessages(contextText: string, decision: string, count: number): ChatMessage[]
export function parseBranches(text: string): Branch[]
export function mockBranches(): Branch[]
```

测试：消息含决策与数量、parse（数组/`{branches}`/乱码兜底）、mock 固定 5 条。

### Task 2: 路由

`POST /api/ai/monte-carlo {projectId, chapterId?, contextText, decision, count?}`：mock 或 complete；空解析 502；记录 ai_request(kind='mc')。

### Task 3: UI

`MonteCarloModal.tsx`：大纲视图「分支推演」按钮打开；决策输入 + 上下文取自章大纲/场景目标；生成后卡片矩阵；卡片「复制」与「设为章大纲」（PATCH chapter outline）。
`ChapterOutlineView.tsx`：逻辑预演旁加按钮。

### Task 4: 验收

`npm test`（+3≈89）、lint、build；mock 浏览器：打开章大纲 → 推演 → 5 卡 → 设为章大纲生效。

## 执行记录

验收证据：`npm test` 88/88、lint 通过；mock 浏览器实测「分支推演 → 5 张卡片（正面强攻/借刀杀人等）→ 设为章大纲」，API 确认章大纲已更新为该分支摘要。修复一处 lint 错误（函数名 useAsOutline 被当作 Hook，改名 applyOutline）。
