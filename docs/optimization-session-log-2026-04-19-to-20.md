# 优化会话日志：章节概要批量 → AI 侧栏与工具栏（起点至材料简报迁移）

> **记录目的**：便于日后根据本日志做回归检查、补测与复盘。  
> **时间范围**：以「文章概要 / 章节概要」相关优化为起点（对话中图1 语境），延续至 **材料简报（▼）迁至正文工具栏** 为止。  
> **说明**：部分条目来自同一会话的连续实现；若本地分支与日志不一致，以 `git diff` / 当前文件为准。

---

## 1. 起点语境（图1）

- **产品语义**：章节概要偏「剧情要点」——便于记忆与给 AI 上文，与正文文学性复述不同；内置提示词多导向 **要点列表**（已发生事实、人物关系/立场变化、伏笔、未解决线等）。
- 后续改动均围绕 **概要批量 UI**、**概要/写作提示词选择**、**AI 侧栏布局**、**材料简报展示位置** 展开。

---

## 2. 批量生成章节概要：进度弹窗 + 完成后跳转概要编辑

### 2.1 需求摘要

- 批量生成时不再仅依赖主弹窗内小字 + 转圈，而是弹出 **「批量生成进度」** 式独立层（参考「图2」：总进度、分章状态、停止等，非像素级复刻）。
- 批量 **至少一章成功** 结束后：若用户未手动跳转，**约 5 秒** 后自动打开 **「编辑章节概要」**（按 **章节序号最先成功** 的一章）；也可 **立即打开**。
- 支持 **停止生成**（`AbortController` 中止后续请求；当前章若已在请求中可能仍会结束）。

### 2.2 新增文件


| 文件                                                    | 作用                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/components/BatchChapterSummaryProgressModal.tsx` | 进度弹窗 UI：已收藏式图例、进度条、分章列表、停止、完成态与倒计时、「立即打开章节概要」、`allowAutoNavigate` 控制是否出现自动跳转与按钮 |


### 2.3 修改文件


| 文件                                            | 变更要点                                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/BatchChapterSummaryModal.tsx` | 批量循环中维护 `batchTasks` 状态；`generateChapterSummaryWithRetry` 传入 `signal`；`bestNavRef` 记录按 `order` 最优成功章；完成后 `batchPhase` 为 `done`/`cancelled`；移除主面板内联「生成中 i/n」长文案（改为进度弹窗）；底部按钮「生成中…」保留 `Spinner`/`Loader2`（后文有图标修复） |
| `src/pages/EditorPage.tsx`                    | `BatchChapterSummaryModal` 增加 `onNavigateToSummaryEditor`：`setActiveId`、`setSummaryDraft`、`setBatchSummaryOpen(false)`、`setSummaryOpen(true)`                                                                    |


### 2.4 已知问题 / 注意点

- **运行时错误**：曾出现 `ReferenceError: Loader2 is not defined`（`BatchChapterSummaryModal` 使用 `Loader2` 但未正确导入或 HMR 不同步）。**修复**：主按钮处改为使用 `src/components/ui/spinner.tsx` 的 `Spinner`，避免该文件直接依赖 `Loader2`。
- **网络**：控制台可能出现 `generativelanguage.googleapis.com` 超时，与 UI 崩溃无关，属 API/网络环境。
- **自动跳转**：依赖 `onNavigateToSummaryEditor` 传入；未传时进度窗仍可完成，但不显示「立即打开」与 5 秒倒计时（`allowAutoNavigate`）。

---

## 3. 编辑章节概要弹窗：文案精简

### 3.1 `src/components/ChapterSummaryEditorModal.tsx`

- **删除**：标题下大段说明（「建议用要点列事实与推进…」）。
- **缩短**：底部隐私/计费说明句，改为更短版本（仍表达上传节选、隐私许可、计费依提供方）。

---

## 4. 文章概要「快捷选项」：`ArticleSummaryPromptQuickDialog`

### 4.1 需求摘要

- 去掉副标题「文章概要提示词 · …」。
- 增加三个来源：**已收藏 / 我的 / 人气**（人气按 `getPromptHeat` 本地次数，同分按 `updatedAt`）。
- 「我的」：`listGlobalPromptTemplates()` 中 `type === article_summary` 且非驳回。
- 空状态与搜索无结果分支区分；空状态文案缩短。
- 选中模板时 `bumpPromptHeat` 与提示词库热度一致。

### 4.2 后续重构（为写作侧复用）

- 抽出通用组件 `**GlobalPromptQuickDialog`**（见第 6 节），`ArticleSummaryPromptQuickDialog` 变为薄封装：`filterTypes={['article_summary']}` + 自定义空文案。

### 4.3 工具函数扩展：`src/util/article-summary-prompt-templates.ts`

- 新增：`filterPromptTemplatesByTypesAndSlots`、`loadGlobalPromptTemplatesMergedByTypes`、`listMinePromptTemplatesByTypes`（供通用快捷窗按类型 + 槽位过滤）。

### 4.4 其他

- `src/util/prompt-usage-heat.ts`：修复文件首行误插入的 `image.png` 前缀，避免潜在语法问题。

---

## 5. AI 侧栏：写作提示词（文风 / 要求）

### 5.1 需求摘要

- 在 **上下文注入** 与 **注入预览** 之间增加一行 **「写作提示词」**：**文风**、**要求** 两个入口。
- 交互对齐概要侧「快捷选项」：**已收藏 / 我的 / 人气**、搜索、右侧最近 7 天等（由 `GlobalPromptQuickDialog` 实现）。
- **文风**：`PromptType` 仅 `style`，槽位 `PROMPT_PICKER_WRITER_SLOTS`。
- **要求**：`continue`、`opening`、`character`、`worldbuilding`，同槽位过滤。
- 与底部 **「额外要求」** 文本框合并为发送给模型的 `userHint`：`【文风】` / `【要求】` / 自由文本，段落间空行拼接（`composedUserHint`）。

### 5.2 新增文件


| 文件                                                     | 作用                                                       |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `src/components/ai-panel/AiPanelWritingPromptsRow.tsx` | 两个按钮 + 两个 `GlobalPromptQuickDialog`；「更多提示词」跳转 `/prompts` |


### 5.3 修改文件


| 文件                                | 变更要点                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/AiPanel.tsx`      | 状态：`writingStyleInject`、`writingReqInject`、选中模板 id/标题；`composedUserHint`；`promptRenderVars` + `renderPromptTemplate`；侧栏 **移除** 原 `PromptPicker`（+选模板）；**移除** 「本书默认 · 风格卡与写作变量」整块（仅摘要+去设定，数据仍由 props 注入装配） |
| `src/components/PromptPicker.tsx` | 导出 `PROMPT_PICKER_WRITING_STYLE_TYPES`、`PROMPT_PICKER_WRITING_REQUIREMENT_TYPES`                                                                                                                          |


### 5.4 删除 / 弃用

- `useRightRail` 在 `AiPanel` 中仅用于已删「去设定编辑」按钮，已一并移除相关 import。

---

## 6. 通用快捷窗组件

### 6.1 `src/components/prompt-quick/GlobalPromptQuickDialog.tsx`

- 接收 `filterTypes`、`filterSlots`、可选 `labels`（空列表文案）、`onOpenBrowse`。
- `ArticleSummaryPromptQuickDialog.tsx` 改为 re-export 封装，批量概要弹窗引用路径不变。

---

## 7. 材料简报：从 AI 侧栏迁至正文工具栏（▼）

### 7.1 需求摘要

- 侧栏 **不再展示** 「本次生成 · 使用材料（简版）」折叠块（认为占用大、价值有限）。
- 正文 **星月式工具栏**（`editor-xy-inline-toolbar`）在 **参考 ⌗** 与 **AI ✦** 之间增加 **▼**，悬停展示 **与原先侧栏同源** 的简报列表。

### 7.2 删除文件


| 文件                                                    | 说明             |
| ----------------------------------------------------- | -------------- |
| `src/components/ai-panel/AiPanelMaterialsSection.tsx` | 原侧栏材料简版 UI，已删除 |


### 7.3 修改文件


| 文件                           | 变更要点                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/AiPanel.tsx` | 保留 `materialsSummaryLines` 的 `useMemo`；`useEffect` 调用 `onMaterialsSummaryLinesChange(materialsSummaryLines)`；新增可选 prop `onMaterialsSummaryLinesChange`  |
| `src/pages/EditorPage.tsx`   | 状态 `aiMaterialsBriefLines`；`onAiMaterialsSummaryLinesChange`；传给 `AiPanel`；工具栏 `HoverCard` + `HoverCardTrigger`/`HoverCardContent`；无数据时提示「等待右侧 AI 面板同步…」 |
| `src/index.css`              | `.editor-xy-inline-icon--materials` 略缩小 ▼ 字号                                                                                                            |


### 7.4 已知注意点

- 简报依赖 **AiPanel 已挂载**（右侧 AI 面板由 `setRightRailTabContent` 注入）；未同步时 Hover 内容为等待文案。
- **触控**：当前以 Radix **HoverCard** 为主（桌面悬停友好）；纯触控设备若需「点击展开」，可后续改为 Popover 或受控 `open`。

---

## 8. 回归检查清单（供白天复查）

- 批量概要：进度弹窗、停止、失败/跳过、成功后的 5 秒自动打开概要编辑、立即打开。
- 概要快捷选项：三 tab、搜索、热度、批量窗仍正常。
- 写作侧栏：文风/要求选词、合并进 `composedUserHint`、生成请求是否仍正确带上下文。
- 工具栏 ▼：悬停简报与侧栏删除前内容一致（模型、风格卡、锦囊、RAG、粗估 token 等行）。
- 无章节 / 未选章：`materialsSummaryLines` 仍为「未选择章节时不会组装请求。」等边界。
- `npm run build` 通过（日志撰写时已通过）。

---

## 9. 主要文件路径速查

```
src/components/BatchChapterSummaryProgressModal.tsx
src/components/BatchChapterSummaryModal.tsx
src/components/ChapterSummaryEditorModal.tsx
src/components/article-summary-prompts/ArticleSummaryPromptQuickDialog.tsx
src/components/prompt-quick/GlobalPromptQuickDialog.tsx
src/components/ai-panel/AiPanelWritingPromptsRow.tsx
src/components/AiPanel.tsx
src/pages/EditorPage.tsx
src/util/article-summary-prompt-templates.ts
src/util/prompt-usage-heat.ts
src/components/PromptPicker.tsx
src/index.css
```

---

*本日志由开发会话整理，若需与仓库完全一致，请结合 `git log` / `git diff` 核对。*