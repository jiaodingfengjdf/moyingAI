# P1-E 图谱可视化 + 语义检索升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（推荐）或 executing-plans。

### Task 1: 嵌入基础

`lib/ai/embeddings.ts`：`embeddingEnabled()`（mock 或配置了 ai.embedModel+apiKey）；`pseudoEmbed(text)` 96 维字符二元组计数向量（mock/降级用）；`callEmbed(text)` OpenAI 兼容 `/embeddings`；`cosine(a,b)`。
测试：cosine 正交/相似、pseudo 确定性、两段共享二元组的文本 cosine>0。

### Task 2: 向量存储

迁移 6：`chapter_embeddings(chapterId TEXT PK REFERENCES chapter ON DELETE CASCADE, vector TEXT, model TEXT, updatedAt TEXT)`；`client.test` user_version 6。
`lib/db/embeddings.ts`：upsert/get/listVectorsByProject。
保存触发：`app/api/chapters/[id]/route.ts` PATCH 后 `void ensureChapterEmbedding(chapterId)`；`app/api/projects/[id]/reembed/route.ts` 全量重建（仅 enabled 时）。`ensureChapterEmbedding` 在 embeddings.ts：读章→embed→upsert，失败静默。

### Task 3: 语义检索与上下文接入

`lib/ai/semanticSearch.ts`：`semanticSearch(projectId, text, limit=3)` → enabled 时伪/真实嵌入 + 余弦 Top-K（chapters join volumes 过滤项目）；否则返回 []。
`context.ts`：`assembleContext` 内 `semanticSearch(...)` 非空则用之，否则回退 `searchHistory`（LIKE）。
测试：语义排序（雨夜文本 vs 无关文本），未启用时为空数组且回退路径不报错。

### Task 4: 设置与图谱 UI

设置 API/弹窗：增加可选「嵌入模型」字段（ai.embedModel），GET/PUT 返回 embedModel/embedConfigured。
`RelationGraphModal.tsx`：SWR 拉实体与关系；SVG 环形布局；边按好感度红/绿、`<title>` 提示；点击节点高亮邻边；EntityPanel 头部加「图谱」按钮。

### Task 5: 验收

`npm test`（+~7≈88）、lint、build；mock 浏览器：设置弹窗可见嵌入字段；图谱弹窗显示节点与边；单元测试覆盖语义排序。

## 执行记录

验收证据：`npm test` 86/86；lint 通过；mock 浏览器实测图谱弹窗「2 节点 / 1 边」与设置「嵌入模型」字段；reembed 路由在 mock 下 7/7 嵌入；语义检索单测覆盖排序与回退。测试修正一次（未 stub mock 环境导致空结果；语义检索过滤零相似章节，断言改为 ≥1）。另发现并规避：`npm run build` 与 dev 服务器并发共用 `.next` 会互相破坏，验收时先停 dev。
