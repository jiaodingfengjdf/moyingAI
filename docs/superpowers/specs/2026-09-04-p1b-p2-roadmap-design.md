# P1-B~P2 路线图设计（情绪脉冲 / 文风迁移 / 角色状态机+对话演练 / 图谱+语义检索 / 蒙特卡洛 / 合规扫描）

- 状态：设计已评审，待实现计划
- 日期：2026-09-04
- 依据：PRD 3.3/3.5.2/3.6 与 MVP 设计文档「后续演进」
- 顺序：P1-B → P1-C → P1-D → P1-E → P2-a → P2-b（用户确认，桌面壳/多端部署除外）

## P1-B 情绪脉冲模拟

- 存储：迁移 5 新增 `chapter_analysis`（chapterId UNIQUE、buildUp/anticipation/release 各 0~10、driver 文本、model、createdAt）。
- 分析：`POST /api/ai/emotion-analyze {chapterId}`：LLM 单章分析并 upsert（复用 `complete`）；`POST /api/ai/emotion-batch {volumeId}` 批量分析整卷（≤20 章，逐章串行）；无密钥/mock 给确定性结果。
- 预警纯函数（可测）：连续 ≥3 章 release ≤3 → 「连续低迷（劝退风险）」；release ≥8 且该章 buildUp ≤2 → 「无铺垫无效爽感」。
- UI：右栏新增「情绪脉冲」区：分析本章按钮 + 三条 0~10 进度条 + driver；「批量分析整卷」；简易 SVG 折线图展示整卷三维曲线。
- 测试：解析/兜底、upsert、预警函数、消息构建、mock。

## P1-C 多平台文风迁移

- 四种目标：`qidian` 起点（设定严谨/信息密度/微幽默）、`fanqie` 番茄（超快节奏/短句断行/章末钩子）、`jinjiang` 晋江（微表情/细腻心理/张力）、`webnovel` 海外（直接句式/本地化术语）。
- 交互：选中文本悬浮菜单新增「迁移」→ 四个目标浮层 → SSE 单分支生成（复用 AIOverlay 的插入/替换语义，kind 扩展 `style`）；无选中时对光标前文做整段迁移。
- 服务端：`lib/ai/style.ts`（每目标系统指令/用户消息构建）；`POST /api/ai/style-transfer`（SSE，正文直出，mock 给示例）；记录 ai_request kind='style'。
- 测试：四种目标消息构建、kind/parse 无关、路由 curl。

## P1-D 角色状态机完整版 + 多角色对话演练

- 人物建模落位：实体卡 `fields` 增加键 want/need/flaw/moralBoundary/speech（speech 为 {口癖, 用词风格, 语速节奏, 情绪隐忍度}）；EntityForm 增加「人物驱动」与「台词指纹」分组输入（仅 character 类型显示）。
- 演练场：侧栏实体档案馆新增「演练」按钮 → DialogueStudio 弹窗：选 2~4 个人物 + 情境文本 → `POST /api/ai/dialogue {projectId, characterIds, scenario}`：
  - `lib/ai/dialogue.ts` 构建消息（注入 want/need/flaw/道德底线/台词指纹/描述）；输出 JSON 对白数组；`parseDialogue` 对非法 JSON 兜底为 `角色：台词` 行解析。
  - mock 给 4 句确定性对白；记录 ai_request kind='dialogue'。
  - UI 展示逐行对话（人物名高亮），提供「复制全部」。
- 测试：消息构建包含人物驱动与台词指纹、parseDialogue（JSON 与行式）、mock 结构。

## P1-E 图谱可视化 + 语义检索升级

- 图谱：实体档案馆新增「图谱」按钮 → RelationGraphModal：现有关系数据渲染 SVG 环形图（人物按度数排布、连线标注类型/好感度、点击节点高亮相关边），无第三方依赖；列表视图保留。
- 语义检索升级：
  - 设置新增「嵌入模型（可选，OpenAI 兼容）embedBaseUrl/embedModel/embedKey」，复用 ai.baseUrl 默认值。
  - `lib/ai/embeddings.ts`：`embed(text)` → OpenAI 兼容 `/embeddings`；mock 用确定性伪向量（字符二元组哈希 96 维）保证无密钥可测；`cosine(a,b)` 纯函数。
  - 迁移 6：`chapter_embeddings`（chapterId UNIQUE、vector TEXT、model、updatedAt）。
  - 章节保存时若嵌入可用则异步更新向量（不可用则跳过，保留 LIKE 兜底）。
  - `searchHistory` 升级：嵌入可用 → 余弦 top-K 语义检索（章节标题+正文 2000 字），否则沿用 LIKE 二元组（现有实现保留为 fallback）。
- 测试：cosine、伪嵌入确定性、嵌入消息/端到端 mock、向量 upsert 与检索排序。

## P2-a 蒙特卡洛剧情分支推演

- `POST /api/ai/monte-carlo {projectId, contextText, decision, count?=5}`：LLM 生成 count 个分支，每个含 title/即时后果/中期走向/风险/成功概率提示/一句话钩子；JSON 解析兜底。
- `lib/ai/monteCarlo.ts`：消息构建、`parseBranches`（数组或 `{branches:[...]}`）、mock 5 分支确定性输出；记录 ai_request kind='mc'。
- UI：大纲视图（章级）新增「分支推演」按钮 → MonteCarloModal：填决策点（默认取章大纲/场景目标），展示分支卡片矩阵；单卡可「设为本章大纲」或「复制」。
- 测试：消息、解析、mock、单测无外部依赖。

## P2-b 批量章节敏感词与合规扫描

- `lib/compliance/terms.ts`：内置分类词表（涉政/涉黄/暴力/侵权线索示例，中文词条，可增补）；`scanText(text)` 纯函数返回 {category, term, count, snippet[]}。
- `POST /api/projects/[id]/compliance-scan`：默认全项目章扫，或指定 chapterIds；返回逐章命中摘要与计数。
- UI：顶栏「合规」按钮 → ComplianceModal：按章列出命中（分类徽标、词条计数、示例片段），支持一键复制报告。
- 测试：scanText（命中/未命中/多词去重）、路由冒烟。

## 共同约束

- 所有 AI 调用走现有 provider（complete/streamChat），无密钥一律 400 提示不崩溃；`INKPULSE_AI_MOCK=1` 可全链路验收。
- 全部用内联表单/弹窗，无原生 prompt/alert/confirm；错误与进行中状态内联展示。
- 每个子项目独立跑 `npm test / lint / build` 与 mock 浏览器验收，独立提交；P1-A 之后的基线与验收项目（P1A验收）保留，不触碰用户正文项目。
