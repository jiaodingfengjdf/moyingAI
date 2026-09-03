# 墨影 AI (InkPulse AI) 智能小说创作工作台 — MVP 设计文档

- 状态：设计已评审，待实现计划
- 日期：2026-09-04
- 依据：《墨影 AI (InkPulse AI) 智能小说创作工作台》产品需求文档（V1.0.0-Draft）

## 1. 背景与目标

网络文学作者在长篇连载中面临剧情连贯性断裂、爽点节奏疲软、灵感枯竭等瓶颈。本产品的 MVP 目标是交付一个**本地运行、单人使用**的 P0 写作核心闭环，让作者在一个工作台内完成「项目/卷章管理 → 写作 → AI 伴写与扩写 → 一致性校验 → 版本快照」的完整流程，先能真正用起来，再按里程碑增强。

## 2. 范围

### 2.1 MVP 包含

- 项目/卷/章三级管理，三栏写作工作台
- TipTap Markdown 编辑器，输入 500ms 防抖自动保存
- 章节快照、并排对比与回滚
- Codex 实体卡（人物/阵营/地点/体系/道具）+ 关系 + 时间线条目（章节锚点）
- 伏笔追踪闭环（埋设/发酵/回收三态，超期预警）
- AI 行内伴写（三分支：推进动作/心理剖析/环境渲染）
- 选中文本扩写/润色（扩写/五感强化/节奏加速/意境沉浸）
- 一致性校验（规则引擎 + LLM 审查），保存后静默提示、不打断写作
- DeepSeek Provider（OpenAI 兼容接口，baseUrl/model/key 可配置）
- 四层上下文装配（滑动窗口/结构/实体图谱/FTS 历史检索）

### 2.2 首版不含（P1/P2 后置）

- 节拍器与黄金三章模板、场景卡（Scene）、破局轮盘
- 角色灵魂状态机完整版、多角色对话演练场
- 情绪脉冲模拟器、毒点扫描、多平台文风迁移
- 完整图谱可视化、向量数据库、蒙特卡洛分支推演
- 多用户/云端协同、500 QPS 集群等商业化后台指标

## 3. 关键决策记录

| 决策项 | 结论 |
| --- | --- |
| 产品形态 | 本地优先、单人使用，数据存本机 |
| 技术路线 | Next.js App Router 单体全栈（方案一） |
| 编辑器 | Markdown（TipTap/ProseMirror），双回车分段贴合网文排版 |
| 模型供应商 | DeepSeek（deepseek-chat），接口 OpenAI 兼容、可配置 |
| AI 建议呈现 | 光标下方浮层 + 右栏历史记录（两者结合） |
| 结构化存储 | SQLite（优先 better-sqlite3，受阻退回 Node 内置 node:sqlite）+ 快照文件 |
| 历史检索 | MVP 用 SQLite FTS5，接口预留向量 Provider |

## 4. 技术架构

- 前端：Next.js App Router + React + TypeScript + Tailwind CSS；Zustand 管理编辑器/面板交互态，SWR 管理服务端数据。
- 后端：API Routes，覆盖 projects / volumes / chapters / entities / relationships / foreshadowings / snapshots / ai / settings。
- 数据：SQLite 单文件（默认 `./data/app.db`，路径可配置）；章节快照存 `./data/projects/<id>/snapshots/`。
- AI 层：`lib/ai/provider.ts` 定义统一 `streamChat` 接口，默认 DeepSeek 实现；密钥只存本机（`.env.local` 或设置页写入本机配置文件），不进浏览器。
- 上下文装配：`lib/ai/context.ts` 实现四层上下文组装。
- 运行方式：`npm run dev`；数据目录独立、可整体备份迁移。

## 5. 数据模型（SQLite）

- `project`：id、title、penName、description、settings(JSON)、createdAt、updatedAt
- `volume`：id、projectId、title、order、summary(大纲)
- `chapter`：id、volumeId、order、title、content(Markdown)、outline(本章大纲)、status(draft/final)、wordCount、createdAt、updatedAt
- `entity`：id、projectId、type(character/faction/location/system/artifact)、name、aliases(JSON)、fields(JSON 自由字段)、description、rules(JSON 校验规则)、createdAt、updatedAt
- `entity_timeline`：id、entityId、chapterId(章节锚点)、change(JSON 状态变更，如境界/伤势/关系)、note、createdAt
- `relationship`：id、projectId、fromEntityId、toEntityId、type、strength(-100~100)、chapterAnchorId、note
- `foreshadowing`：id、projectId、title、status(planting/simmering/payoff)、plantChapterId、simmerRangeStart、simmerRangeEnd、payoffChapterId、relatedEntityIds(JSON)、note、createdAt、updatedAt
- `chapter_snapshot`：id、chapterId、version、content、label、branchId、createdAt
- `ai_request`：id、projectId、chapterId、kind(ghostwrite/expand/polish/check)、prompt、model、accepted、createdAt
- `setting`：key、value（本机级配置，含模型密钥与模型名）

范围说明：MVP 不建 Scene 表；卷/章大纲以自由文本字段承载。

## 6. 界面与交互（三栏工作台）

- 顶栏：项目名、自动保存状态、字数统计、快照、设置入口。
- 左栏：目录树（卷/章增删改排序）、实体档案馆（按类型分组）、伏笔跟踪器（未回收计数与超期预警）。
- 中栏：章节标题 + TipTap 写作画布；选中文本弹出悬浮菜单（扩写/五感/节奏/意境/诊断）；AI 三分支结果以光标下方浮层即时呈现，同时写入右栏历史，支持插入/替换/合并；`Tab` 采纳补全、`Alt+/` 触发伴写。
- 右栏：角色状态与信息差（MVP 为实体卡只读简化版）、AI 建议历史、一致性警报；情绪脉冲走势先做占位，随 P1 落地。
- 自动保存：输入 500ms 防抖；断网时 pending 变更暂存 localStorage，服务恢复后同步（本地同机服务，MVP 只做轻量兜底）。

## 7. AI 编排与上下文装配

每次生成按四层装配上下文：

- L1 即时窗口：光标前 2000 字 + 光标后 300 字。
- L2 结构上下文：本卷大纲 + 本章大纲与目标。
- L3 实体图谱：对光标段落用实体词典做轻量匹配（MVP 用别名精确/模糊匹配代替重 NER），取命中实体的卡与最近时间线状态，字段裁剪防上下文污染。
- L4 历史记忆：SQLite FTS5 检索相关历史章节与伏笔原文/摘要。

输出经 SSE 流式返回；三分支并行/顺序生成；采纳动作记录到 `ai_request`。超时 60s，指数退避重试 2 次；流式中断保留已生成部分并提供重试。

## 8. 一致性校验

- 规则引擎（确定性）：实体存在性、境界/数值越界、死而复生、地点矛盾等，依据实体卡 rules 与时间线状态判定。
- LLM 审查（Continuity Agent）：输入新增段落 + 相关实体卡 + 近文，输出结构化冲突列表（冲突点/来源/建议）。
- 触发与呈现：保存后静默后台执行，右栏红色警报展示冲突来源与建议；MVP 仅提示，不自动打回重写（P1 再做熔断拦截）。

## 9. 自动保存与版本快照

- 自动保存：输入 500ms 防抖写入 SQLite。
- 快照：手动或定时创建（正文 + 标签 + 分支 id），支持并排 diff 与一键回滚。
- 备份：启动时数据库一致性检查；每日备份 `data/` 目录。

## 10. 错误处理

- 密钥未配置：AI 按钮置灰，设置页引导配置，不崩溃。
- LLM 超时/限流：指数退避重试 2 次，仍失败给出明确错误与重试按钮。
- 流式中断：保留已生成内容，可续写或重试。
- 存储：启动一致性检查；写入失败提示并保留内存副本；日志记录便于排查。

## 11. 测试策略

- Vitest 单元测试：四层上下文装配、实体匹配与字段裁剪、伏笔状态机、Markdown 序列化。
- 服务端集成测试：AI 相关路由使用 mock provider，验证参数装配、流式转发、采纳日志。
- 手工验收：每里程碑配验收清单；MVP 关键链路冒烟测试（创建项目→写作→自动保存→AI 生成→采纳→快照→回滚）。

## 12. 交付里程碑

- M1 基础工作台：脚手架、数据模型、项目/卷/章管理、三栏 UI、TipTap 编辑器、自动保存与快照回滚（暂不接 AI，纯写作可用）。
- M2 AI 闭环：Provider 配置、四层上下文装配（实体卡读取 + FTS 历史检索）、行内伴写三分支、选中文本扩写/润色、采纳与日志；同时开放基础实体卡录入（列表 + 表单），保证 L3 实体层有数据可用。
- M3 记忆与质检：实体关系与伏笔看板、一致性校验与警报、体验打磨与验收。

每个里程碑结束均可运行、可演示。

## 13. MVP 验收标准（DoD）

1. 可创建项目/卷/章并写作，正文自动保存、重启后恢复。
2. 快照可创建、对比、回滚。
3. 实体卡与关系可增删改查，伏笔可埋设/标记回收，超期有预警。
4. 配置 DeepSeek 密钥后：行内伴写流式输出三分支；选中文本可扩写/五感/节奏/意境；结果可插入/替换/合并。
5. 一致性校验可输出冲突来源与建议（含确定性规则与 LLM 两类）。
6. 无密钥时功能置灰不崩溃；网络错误有重试与提示。

## 14. 后续演进

- P1：节拍器与黄金三章、情绪脉冲模拟、多平台文风迁移、完整角色状态机、图谱可视化、向量检索升级。
- P2：蒙特卡洛分支推演、多角色对话演练场、批量合规扫描。
- 交付：桌面壳打包、多人协同与云端部署。
