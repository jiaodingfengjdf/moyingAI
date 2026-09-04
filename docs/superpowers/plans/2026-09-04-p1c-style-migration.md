# P1-C 多平台文风迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 executing-plans 逐任务执行。

**Goal:** 选中文本（或无选中时取光标前文）一键迁移为起点/番茄/晋江/海外 Webnovel 四种平台文风，SSE 流式输出，可插入或替换选中。

**Architecture:** `lib/ai/style.ts` 纯逻辑（目标指令/消息/mock）；`POST /api/ai/style-transfer` SSE（复用 ghostwrite 修复后的流模式）；前端扩展现有选中菜单与 AIOverlay（kind 增加 `style`）。

### Task 1: 风格库与测试

`lib/ai/style.ts`：`StyleTarget = 'qidian'|'fanqie'|'jinjiang'|'webnovel'`；`STYLE_TARGETS` 每条含 label 与 instruction；`buildStyleMessages(target, text)`；`mockStyleText(target)`。
测试：4 目标消息含正文与各自关键要求、mock 确定性。

### Task 2: SSE 路由

`POST /api/ai/style-transfer {chapterId, sourceText, target}`：校验 target；mock → 单分支 SSE（delta 文本）；真实 → complete? 需流式：用 `streamChat(buildStyleMessages)` 包 SSE（复制 rewrite 路由结构，单 reader）；记录 ai_request kind='style'。

### Task 3: 编辑器接线

- `lib/useAIStream.ts`：kind 联合类型加入 `'style'`。
- `AIOverlay`：`isSuggestion = kind==='rewrite'||kind==='style'`；标题按 kind 映射（style→「文风迁移」）；新增 `canReplace` prop 控制「替换选中」显示。
- `ChapterEditor`：选中菜单新增「文风」按钮 → 弹出四目标小浮层 → `triggerStyle(target)`：取选中文本（无选中用光标前 1500 字或全文）；设 replaceRange；`run('/api/ai/style-transfer', {chapterId, sourceText, target}, 'style', [label])`；adopt 逻辑改为「非 ghostwrite 且 replaceRange 存在则替换，否则插入」。

### Task 4: 验收

`npm test`（+2≈79）、lint、build；mock 浏览器：正文输入一段 → 选中 → 「文风」→ 番茄流 → 流式建议 → 替换选中 → 正文变化且 ai_request 有 style 记录。

## 执行记录

验收证据：`npm test` 79/79；lint/build 通过；mock 浏览器实测「选中 → 文风 → 番茄/新媒体流 → SSE 浮层 → 替换选中」正文变为番茄模拟文本，AIOverlay 标题正确（style 分支），路由 curl 输出 meta/delta。无偏差。
