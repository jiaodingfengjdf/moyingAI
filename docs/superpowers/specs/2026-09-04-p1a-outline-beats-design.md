# P1-A 节拍器与大纲系统 — 设计文档

- 状态：设计已评审，待实现计划
- 日期：2026-09-04
- 依据：《墨影 AI (InkPulse AI) 智能小说创作工作台》PRD 3.4 模块三（节拍器与大纲系统）与 MVP 设计文档「后续演进」P1
- 范围：P1 第 1 个子里程碑（P1-A）；不含桌面壳打包/多端部署（用户明确排除）

## 1. 背景与目标

创作者缺少从「想法 → 结构 → 正文」的结构化中转层：大纲字段有数据无界面、没有场景粒度的工作单元、缺乏爆款网文节拍骨架引导。P1-A 交付一个可用的大纲工作台，让作者能以「卷大纲 → 章大纲 → 场景卡」三层组织故事，并可一键套用经典节拍模板或让 AI 生成骨架，对大纲做逻辑预演。

## 2. 范围

### 2.1 包含

- 场景卡（Scene）：每章下多个场景，字段为标题/目标/要点/状态，纯大纲元数据，不带独立正文区。
- 大纲视图：编辑器顶部「正文 / 大纲」切换；大纲视图编辑当前章大纲并管理场景卡；卷大纲通过侧栏弹窗编辑。
- 节拍模板库：内置 4 套模板（黄金三章、打脸逆袭、副本探索、群像悬疑），结构为「卷骨架 → 章 → 场景卡」。
- 模板应用：应用到卷（批量建章与场景卡）或应用到章（只生成场景卡）。
- AI 大纲生成：给定卷目标，生成同结构骨架，预览后一键应用；无密钥时给明确提示（mock 模式可全链路验收）。
- 情节逻辑预演：对卷/章大纲 + 场景目标做 LLM 审查，输出「因果前置不足 / 疑似机械降神」等结构化预警。
- 采纳沿用现有 `ai_request` 日志能力（骨架生成与逻辑预演均记录）。

### 2.2 不含（后续子项目）

- 场景独立正文创作区（用户确认本轮不做，升级时再说）。
- 情绪脉冲波形、文风迁移、完整角色状态机、对话演练、图谱可视化、语义向量检索（P1-B~E）。
- 蒙特卡洛推演、批量合规扫描（P2）。

## 3. 数据模型（迁移 4）

`scene` 表：

- id TEXT PK
- chapterId TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE
- title TEXT NOT NULL
- goal TEXT NOT NULL DEFAULT ''（本场景目标）
- points TEXT NOT NULL DEFAULT ''（要点，Markdown 子集文本）
- status TEXT NOT NULL DEFAULT 'draft'（draft/done）
- "order" INTEGER NOT NULL DEFAULT 0（章内排序，MVP 按创建顺序 + 可 PATCH order 调整）
- createdAt / updatedAt
- 索引 idx_scene_chapter(chapterId, "order")

`volume.summary` 与 `chapter.outline` 继续作为卷/章大纲字段（M1 已建）。

## 4. UI 与交互

- ChapterEditor 顶部标题行改为分段控件「正文 | 大纲」。
  - 正文模式：现有 TipTap 编辑器。
  - 大纲模式：渲染 `ChapterOutlineView`：
    - 章大纲 textarea，500ms 防抖 PATCH `/api/chapters/[id]`（复用 M1 自动保存模式，独立控制器）。
    - 场景卡列表（标题/目标/状态/删除）+「+ 场景」行内表单 + 编辑行内展开；场景状态在 draft/done 间切换。
    - 「套用章模板」：下拉选模板 → 生成场景卡。
    - 「AI 生成场景骨架」：输入章目标 → 预览 → 应用（若章已有场景卡则追加或确认覆盖）。
    - 「逻辑预演」按钮 + 预警列表。
- 侧栏卷行新增「纲」按钮 → `VolumeOutlineModal`：卷大纲 textarea + 「套用卷模板」「AI 生成卷骨架」「卷逻辑预演」。
- 生成/应用类操作在预览弹窗中确认；生成中禁用按钮并显示「生成中…」。
- 错误提示内联显示（本应用已确认不支持原生 prompt/alert/confirm，全部用内联/弹窗组件）。

## 5. 节拍模板与 AI 骨架生成

### 5.1 模板库（lib/beats/templates.ts）

```ts
interface BeatTemplate {
  id: string;
  name: string;
  description: string;
  volumeTitle?: string;
  volumeOutline?: string;
  chapters: {
    title: string;
    outline: string;
    beats: { title: string; goal: string }[];
  }[];
}
```

- 4 套模板为静态数据（黄金三章 / 打脸逆袭 / 副本探索 / 群像悬疑）。
- 提供纯函数 `applyTemplateToVolume(template)` → 生成「卷大纲文本 + chapters[] + scenes[]」的插入负载，可单测。

### 5.2 应用与生成接口

- `POST /api/beats/apply-volume`：{projectId, volumeId, templateId} → 在卷下批量建章（带 outline）与场景卡（带 goal/points），返回新章数量。
- `POST /api/beats/apply-chapter`：{chapterId, templateId} → 用模板「章级」节拍为当前章生成场景卡。
- `POST /api/ai/outline-generate`：{projectId, targetVolumeId?, targetChapterId?, prompt, level: 'chapter'|'volume'}：
  - level=volume：返回 {volumeOutline, chapters:[{title,outline,beats:[]}]}，预览后调 apply 插入。
  - level=chapter：返回 {chapterOutline, beats:[{title,goal}]}。
  - mock 模式返回确定性骨架；无密钥返回 400 提示。
  - 记录 ai_request（kind='outline'）。
- 预览数据在客户端内存中，用户点「应用」才写库。

## 6. 情节逻辑预演

- `POST /api/ai/outline-check`：{projectId, volumeOutline?, chapterOutline?, scenes?} → LLM 审查，输出 JSON 数组：
  `{type, text, reason, suggestion}`，复用 `parseConflicts` 的解析模式；mock 返回示例预警。
- 预警渲染为黄色/红色卡片（机械降神为红，因果不足为黄），附来源说明与建议。

## 7. 错误处理与测试

- 无密钥：生成/预演入口提示「未配置 AI 密钥」，不崩溃；mock 模式可全链路验收。
- LLM 输出非法 JSON：解析失败返回空列表并给出可读提示。
- 模板应用幂等：重复应用会追加（不做去重），在预览中说明数量。
- 测试：scene 仓库 CRUD/级联；模板结构校验与 apply 纯函数；AI 骨架 JSON 解析；outline-check 消息构建与解析；路由 curl 冒烟；mock 浏览器全链路。

## 8. 交付里程碑

- A1 大纲工作台：迁移 4（scene）+ 仓库/API + ChapterOutlineView + 正文/大纲切换 + 卷大纲弹窗。
- A2 模板与 AI 骨架：模板库 + 应用接口 + 生成接口 + 预览/应用 UI。
- A3 逻辑预演：outline-check 接口 + 大纲视图预警 UI + 体验打磨。
- 每个阶段结束均可运行、可验收。

## 9. P1-A 验收标准（DoD）

1. 章节可在大纲视图编辑章大纲（防抖保存）并增删改场景卡；卷大纲可在弹窗编辑。
2. 四套节拍模板可应用：应用到卷批量生成章+场景卡，应用到章生成场景卡。
3. 配置 DeepSeek 后（或 mock 模式）可生成卷/章骨架：预览含数量确认后应用，生成记录进入 ai_request。
4. 大纲逻辑预演可输出结构化预警；无密钥时给出明确提示。
5. `npm test`、`npm run lint`、`npm run build` 全绿；mock 浏览器验收清单通过；工作区干净。
