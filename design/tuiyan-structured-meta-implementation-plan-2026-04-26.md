# 推演结构化元数据完整实施方案
**日期**：2026-04-26  
**状态**：全部完成 ✅  
**背景**：已完成结构化字段的 UI 展示与持久化（types/state/editor 三件套），本文档描述后续两步的具体实施。

---

## 已完成部分（勿重复）

- `src/db/types.ts`：新增 `PlanningNodeStructuredMeta` 类型（含所有层级字段），`TuiyanState.planningStructuredMetaByNodeId` 字段
- `src/pages/V0TuiyanPage.tsx`：state 声明、加载/保存/update 回调、传给 editor 组件
- `src/components/tuiyan/TuiyanPlanningNodeCenterEditor.tsx`：按层级显示结构化字段 UI，可手动编辑

---

## ~~第一步：AI 生成时自动填充结构化字段~~ ✅

~~**目标**：每次点击「生成」时，AI 同时输出结构化字段，生成完成后自动回填到对应节点的 `planningStructuredMetaByNodeId`。~~

~~**涉及文件**：`src/ai/tuiyan-planning-generate.ts`、`src/pages/V0TuiyanPage.tsx`~~

~~**实际改动**：~~

~~- `tuiyan-planning-generate.ts`：扩展 `listSystemPrompt`，四个列表层级末尾各追加对应结构化字段输出格式（`核心创意：`/`世界观：` 等）；新增 `parseStructuredFields` 辅助函数用正则从文本块提取字段值；`parseListOutput` 扩展返回 `structuredMeta`，摘要截止逻辑防止字段混入摘要；`generateTuiyanPlanningDetail` 新增 JSON fence 提示，解析后把 JSON 部分从正文中剔除，返回 `{ text, structuredMeta }`~~

~~- `V0TuiyanPage.tsx`：`generatePlanningLevel` 各生成分支（总纲/大纲/卷纲/章细纲/详细细纲）在 `upsertPlanningMeta` 后，把解析出的结构化字段写入 `planningStructuredMetaByNodeId`~~

---

## ~~辅助优化：抽取 LEVEL_FIELDS 为共享常量~~ ✅

~~`STRUCTURED_FIELDS_BY_LEVEL` 常量已加到 `src/util/tuiyan-planning.ts`，`TuiyanPlanningNodeCenterEditor.tsx` 改为引用共享常量，内部只保留 UI 专属的 `placeholder`/`rows` 映射。~~

---

## ~~第二步：推送到写作页时携带结构化字段~~ ✅

### 2.1 目标

点击「推送到写作章纲」时，把 `planningStructuredMetaByNodeId` 里对应节点的数据一起打包进 `TuiyanPushedOutlineEntry`，让写作侧的 PullOutlineDialog 能展示完整结构化信息。

### 2.2 涉及文件

| 文件 | 修改类型 |
|------|---------|
| `src/db/types.ts` | `TuiyanPushedOutlineEntry` 加 `structuredMeta?` 字段 |
| `src/pages/V0TuiyanPage.tsx` | `pushPlanningTreeToWriter` 里填充 `structuredMeta` |
| `src/components/editor/PullOutlineDialog.tsx` | 预览面板展示结构化字段（只读） |

### 2.3 `src/db/types.ts` 改动

在 `TuiyanPushedOutlineEntry` 末尾加一个可选字段：

```typescript
/** 推送时携带的结构化元数据（AI 生成后用户确认过的版本） */
structuredMeta?: PlanningNodeStructuredMeta
```

### 2.4 `V0TuiyanPage.tsx` — `pushPlanningTreeToWriter` 改动

在 `planningPushCandidates.map(...)` 内，每个 entry 追加：

```typescript
structuredMeta: planningStructuredMetaByNodeId[candidate.id] ?? undefined,
```

### 2.5 `PullOutlineDialog.tsx` — 预览面板展示结构化字段

在右侧预览区 content 展示块之后，追加只读 `StructuredMetaPreview` 组件：

```tsx
{selected.structuredMeta && (
  <StructuredMetaPreview meta={selected.structuredMeta} level={selected.level} />
)}
```

`StructuredMetaPreview` 实现要点：
- 引入 `STRUCTURED_FIELDS_BY_LEVEL` 共享常量（已在 `tuiyan-planning.ts`）
- 只展示有值的字段（跳过空字符串）
- 风格：小字、浅色边框、`pre` 标签展示多行值，与 PullOutlineDialog 现有视觉一致

---

## 执行顺序

~~Step A：抽取 LEVEL_FIELDS 为共享常量到 `tuiyan-planning.ts`，更新 `TuiyanPlanningNodeCenterEditor.tsx` 引用共享常量~~ ✅

~~Step B：改造 `tuiyan-planning-generate.ts`（扩展 prompt/解析/返回类型）~~ ✅

~~Step C：`V0TuiyanPage.tsx` — `generatePlanningLevel` 各分支写入结构化字段~~ ✅

~~Step D：`src/db/types.ts` — `TuiyanPushedOutlineEntry` 加 `structuredMeta?` 字段~~ ✅

~~Step E：`V0TuiyanPage.tsx` — `pushPlanningTreeToWriter` 打包时附带 `structuredMeta`~~ ✅

~~Step F：`PullOutlineDialog.tsx` — 引入共享常量，预览面板渲染只读 `StructuredMetaPreview`~~ ✅

---

## 关键注意事项

1. **解析容错**：`parseStructuredFields` 和 JSON 解析失败时返回空对象，不抛异常，不阻断主流程。

2. **重新生成会覆盖手填内容**：当前可接受行为，与摘要重生成一致。后续如需保护手填再加标记。

3. **类型兼容**：`structuredMeta` 为可选字段，旧推送快照完全兼容，`PullOutlineDialog` 只需 `entry.structuredMeta &&` 判断。

---

## 不在本方案范围内

- 写作侧栏 AI 提示词注入（已由书斋人物库/词条库覆盖，不重复建设）
- 结构化字段的 Supabase 云同步（TuiyanState 整体云同步，新字段随之同步）
- 结构化字段的版本历史/diff
