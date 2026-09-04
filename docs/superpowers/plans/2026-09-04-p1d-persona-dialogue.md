# P1-D 角色状态机 + 多角色对话演练 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。

**Goal:** 人物实体卡支持 Want/Need/Flaw/道德底线与台词指纹；侧栏「演练」可对 2~4 个人物按情境生成保持人设的逐行对白。

### Task 1: 实体表单人物建模

`EntityForm.tsx`：type=character 时显示「人物驱动」（want/need/flaw/moralBoundary）与「台词指纹」（口癖/用词风格/语速节奏/情绪隐忍度）8 个输入，分别写入 fields.want… fields.speechTic… 等扁平键。

### Task 2: 对话库与测试

`lib/ai/dialogue.ts`：

```ts
export interface DialogueLine { speaker: string; line: string }
export function personaFields(e: { fields: Record<string, unknown> })  // 读 want/need/flaw/moralBoundary/speech*
export function buildDialogueMessages(characters: Entity[], scenario: string): ChatMessage[]
export function parseDialogue(text: string): DialogueLine[]
export function mockDialogue(names: string[]): DialogueLine[]
```

测试：消息含每个人名/want/口癖与情境；parse 纯 JSON、围栏、`名字：台词` 行式兜底；mock 行数=人数。

### Task 3: 路由

`POST /api/ai/dialogue {projectId, characterIds, scenario}`：校验人数 2~4、实体须属该项目且 type=character；mock 或 complete → parse → 空则 502；记录 ai_request(kind='dialogue')；返回 {lines}。

### Task 4: 演练场 UI

`DialogueStudio.tsx`（弹窗）：SWR 拉项目人物；勾选 2~4 人；情境 textarea；生成 → 逐行展示（speaker 高亮）；「复制全部」写入剪贴板；错误与进行中状态内联。
`EntityPanel.tsx`：头部加「演练」按钮与弹窗。

### Task 5: 验收

`npm test`（+4≈83）、lint、build；mock 浏览器：给 P1A 验收项目建两个人物并填驱动/口癖 → 勾选两人 + 情境 → 生成对白 → 复制。

## 执行记录

验收证据：`npm test` 81/81（对话 2 个用例）、lint 通过；mock 浏览器实测：实体表单新增人物驱动/台词指纹 8 输入（character 类型显示），演练场勾选「林峰/苏晚」→ 输入情境 → 生成 2 句对白且 speaker 正确。测试断言修正一次（人设注入在 user 消息而非 system）并 amend。
