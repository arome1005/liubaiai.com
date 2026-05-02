# ReferenceLibraryPage 代码结构优化方案

目前 `ReferenceLibraryPage.tsx` 曾达到近 4000 行（经 P0 Hook 拆分后主文件已显著缩减），属于典型的 "God Component"（全能组件）演进过程中的遗留形态，集成了视图渲染、状态管理、文件解析导入、AI提炼、全文检索等多种业务逻辑。

为了提升代码可维护性、降低协作冲突并优化性能，建议按照以下**优先级**顺序进行渐进式重构。

---

## 优先级 1: 抽离状态与业务逻辑至 Custom Hooks (P0)

> **P0 进度**：下列 **7** 个 Hook（`useReferenceLibrary` / `useReferenceImport` / `useReferenceReader` / `useReferenceSearch` / `useReferenceExtract` / `useExcerptEditForm` / `useReferenceWorkbench`）已全部落地，条目已在清单中划线归档。

这是**最安全、见效最快**的一步。无需大规模改动 JSX 结构，只需将巨大的业务逻辑区块抽离，能够瞬间缩减主文件 1500+ 行代码。

建议创建 `src/pages/reference/hooks/` 目录，拆分如下：

1. ~~`**useReferenceLibrary.ts`~~ (已完成 ✅)**
  - ~~**职责**: 管理藏经书目列表数据、分类过滤、排序、收藏和导出选项。~~
  - ~~**包含状态**: `items`, `loading`, `categoryFilter`, `favoriteIds`, `exportSelection`, `sortBy`, `viewMode`。~~
  - ~~**抛出方法**: `refresh`, `toggleReferenceFavorite`, `selectAllFilteredForExport`, `handleDelete` 等。~~
2. ~~`**useReferenceImport.ts`~~ (已完成 ✅)**
  - ~~**职责**: 独立处理 TXT、PDF、DOCX 等多格式文件的解析导入。~~
  - ~~**架构对齐**: 当前主文件中大量使用了 `window.prompt` 获取“书名”和“分类”，**严重违反了结构准则**。此 Hook 需抛弃阻塞式的 `window.prompt`，改用状态控制的异步流程，配合 UI 层的自定义 `<ImportConfigDialog />` 完成数据补全。~~
  - ~~**逻辑压缩**: 当前 TXT、PDF、DOCX 三段解析代码（占近1000行）存在高度重复。需要在 Hook 内部统一为 `importSingleFile(file, parser)` 与 `importBatch(files, parser)` 的模板方法模式。~~
  - ~~**包含状态**: `importProgress`, `heavyJob`, `importBusy`, `pendingImportFiles` (用于触发弹窗)。~~
  - ~~**抛出方法**: `handleFiles` (将数百行的解析逻辑从主文件中抽出), `openPicker`, `confirmImport`。~~
3. ~~`**useReferenceReader.ts`~~ (已完成 ✅)**
  - ~~**职责**: 管理右侧阅读器相关的分块加载和进度。~~
  - ~~**包含状态**: `activeRefId`, `activeTitle`, `loadedChunks`, `focusOrdinal`, `highlight`, `activeChapterHeads`。~~
  - ~~**抛出方法**: `openReader`, `loadReaderPos`, `saveReaderPos` 等。~~
4. ~~`**useReferenceSearch.ts`~~ (已完成 ✅)**
  - ~~**职责**: 管理检索模块。~~
  - ~~**包含状态**: `searchQ`, `searchHits`, `searchScopeRefId`, `refSearchMode`。~~
  - ~~**抛出方法**: `runSearch`, `switchRefSearchMode`。~~
5. ~~`**useReferenceExtract.ts`~~ (已完成 ✅)**
  - ~~**职责**: 剥离与 AI 提炼相关的所有逻辑。~~
  - ~~**包含状态**: `extractPanelOpen`, `extractStreaming`, `savedExtracts`, `extractLoading`。~~
  - ~~**抛出方法**: `handleStartExtract`, `handleImportExtract`。~~
6. ~~`**useExcerptEditForm.ts`~~ (已完成 ✅)**
  - ~~**职责**: 管理摘录列表中复杂的编辑表单状态绑定。~~
  - ~~**包含状态**: `editingExcerptId`, `editNote`, `editTagIds`, `editLinkedWorkId`, `editLinkedChapterId`, `editChapters`。~~
  - ~~**抛出方法**: `startEditing`, `saveEdit`, `cancelEdit`。~~
7. ~~`**useReferenceWorkbench.ts`~~ (已完成 ✅)**
  - ~~**职责**: 独立管理书籍详情工作台弹窗的自包含状态 and 数据加载逻辑。~~
  - ~~**包含状态**: `workbenchOpen`, `workbenchRefId`, `workbenchEntry`, `workbenchHeads`, `workbenchExcerpts`, `workbenchExtracts`, `workbenchTab`。~~
  - ~~**抛出方法**: `openWorkbench`, `closeWorkbench`。~~

---

## 优先级 2: 拆分核心视图组件 (P1)

> **P1 进度（部分）**：`<ReferenceToolbar />`、Dialog 替换 `window.prompt`（含 `<ImportConfigDialog />` / `<QuickEditDialog />` 等）、`<ReferenceLibraryList />`（含网格/列表子项与封面等）、`**<ReferenceExcerptList />`（含 `ReferenceExcerptFilters`）** 已完成，条目已划线归档。

在业务逻辑被 Hook 接管后，开始按模块将 JSX 拆分为独立的 React 组件，放入 `src/pages/reference/components/` 中。

1. ~~`**<ReferenceToolbar />`~~ (已完成 ✅)**
  - ~~顶部工具栏组件。~~
  - ~~将 `搜索框`、`分类下拉框`、`视图切换`、`导入导出按钮`、`藏经统计（小徽章）` 封装在此组件内。~~
2. ~~**Dialog 弹窗组件替换 `window.prompt` (新增强制要求)**~~ (已完成 ✅)
  - ~~`**<ImportConfigDialog />`**: 负责在用户导入文件时收集“书名”与“分类标签”。~~
  - ~~`**<QuickEditDialog />` 或类似实现**: 替换主文件中其余 12 处 `window.prompt`（例如保存摘录时的备注输入、修改已有书目分类等），完全消灭阻塞式交互。~~
3. ~~`**<ReferenceLibraryList />`~~ (已完成 ✅)**
  - ~~主列表区域组件。~~
  - ~~内部可进一步拆分为 `<ReferenceGridItem />`（网格卡片）和 `<ReferenceListItem />`（列表条目）。~~
  - ~~将负责渲染封面渐变、进度条、各类 hover 快捷操作面板的臃肿代码从主文件中剥离。~~
4. `**ReferenceReaderPanel`**
  - 右侧的阅读器容器组件。
  - **子组件**:
    - `<ReferenceReaderNav />`: 章节/段落切换控件。
    - `<ReferenceReaderContent />`: 上一段/当前段/下一段的渲染与防乱码处理 (`analyzeMojibakeRepair`)。
5. ~~`**<ReferenceExcerptList />`~~ (已完成 ✅)**
  - ~~摘录列表与过滤面板；实现见 `src/pages/reference/components/ReferenceExcerptList.tsx`（同文件导出 `ReferenceExcerptFilters`）。~~
  - ~~独立处理其内部的 `excerptTagFilterId`, `editingExcerptId` 表单绑定逻辑。~~
6. ~~`**ReferenceExtractPanel`**~~ (已完成 ✅)**
  - ~~右下侧的 AI 提炼要点面板组件。专门渲染提炼设置、流式打字机效果以及结果卡片的应用操作。~~
7. ~~`**ReferenceWorkbenchDialog`**~~ (已完成 ✅)**
  - ~~将 `workbenchOpen` 相关的巨型 Dialog 直接抽离为一个独立的弹窗组件。~~

---

## 优先级 3: 提取工具函数与动作分发器 (P2)

主文件中充斥着一些辅助纯函数、通用 Hook 和跨模块的深度跳转逻辑。

1. **抽离通用 Hook: `useConfirmDialog.ts` (新增)**
  - 提取主文件中 L333-L446 现存的 `ConfirmState` 及基于 Promise 的 `confirmOnce` 逻辑。
  - 这是一个完全业务无关的通用模式，应该放入全局 hooks 目录（`src/hooks/`），不仅服务于藏经页，也可供全站复用。
2. **拆分纯函数至 `src/util/reference-utils.ts`**
  - `countNonPunctuation`, `refCoverHue`, `highlightChunkText`, `isLinkedChapterBeforeProgress`。
3. **抽离跨模块路由流转逻辑至 `src/actions/reference-handoff.ts`**
  - 大量涉及 `writeAiPanelDraft`, `navigate` 组合调用的处理程序，例如：
  - `applyKeyCardToWork`, `applyKeyCardToAiDraft`, `jumpKeyCardToWritingHit`, `sendExcerptToWritingAsRef`。

---

## 优先级 4: 引入 Context 状态共享 (P3)

如果执行完 P1 和 P2 之后，发现 `ReferenceLibraryPage.tsx` 向下传递了过多 props（Props drilling），则建议创建 Context：

1. 创建 `ReferenceContext.tsx`
2. 注入全局必需的状态（如 `activeRefId`, `worksList`，以及 `openReader` 方法）。
3. 子组件直接通过 `useReferenceContext()` 获取状态，减少显式的属性传递，代码更加整洁。

---

## 重构执行建议

1. **第一步（严禁动 JSX）**：先建立 Hooks，把函数和 `useState` 搬运过去，主文件中直接引入 Hook。
2. **第二步（执行冒烟测试）**：每个 Hook 提取后必须验证功能不回退。参考以下验证清单：
  - 单文件导入成功
  - 批量导入不同格式成功
  - 阅读器正常渲染与翻页
  - 划选文字能成功保存摘录
  - 全库搜索并能成功跳转定位
  - AI 提炼功能正常触发
  - 提炼要点能成功应用并跳转至锦囊模块
  - 书籍详情工作台能正常展示所有 Tab 数据
3. **第三步（组件化）**：将文件拆散为组件时，遇到依赖大量外层状态的情况，就把它们暂且作为 Props 传入子组件。
4. **第四步**：清理未使用的 Imports 和优化依赖流。