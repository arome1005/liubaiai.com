# EditorPage 拆分实施方案（保持功能结构与 UI 位置不变）

> 创建日期：2026-05-01  
> 适用范围：`src/pages/EditorPage.tsx`  
> 原则：**搬家式重构**——不改 DOM 层级、不改可见布局与交互路径，只提取逻辑与子组件并原样接线。

---

## 一、能做到吗？

**能。** 前提是把本轮当成「搬家」而不是「重做」：组件父子顺序、className、文案、快捷键与路由/query 行为保持不变，只把逻辑与 JSX 拆到 `hooks/`、`components/editor/`、`util/`。

---

## 二、全程遵守的约束


| 要做                       | 不要做                               |
| ------------------------ | --------------------------------- |
| 复制现有 JSX 到子组件，props 一一对应 | 顺手改布局、间距、合并按钮                     |
| Hook 返回值与页面内原先用到的变量语义一致  | 改路由、改右栏 Tab id、改 localStorage key |
| 抽函数时保持相同分支与 toast 文案     | 改默认折叠状态、默认宽度等用户已适应的行为             |
| 每步后用回归清单对照               | 大面积 memo / 同一 PR 内多处无关重构          |


---

## 三、现状数字（最新；2026-05-01 · 重构收尾版）


| 指标                                                                                             | 起点         | 当前                                       |
| ---------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- |
| `EditorPage.tsx` 总行数                                                                           | **3414** 行 | **~1232** 行（**~-2182**，约 **64%**）        |
| ~~阶段 3 全部 hook 抽取~~                                                                            | ~~待办~~     | ~~✅ 已全部完成（含 3.8 switchChapter）~~         |
| ~~阶段 5.1 键盘 hook~~                                                                             | ~~待办~~     | ~~✅ 已完成~~                                |
| ~~阶段 4.1 / 4.2 / 顶栏注入（侧栏、查找条、`useEditorTopbarMount`）~~                                         | ~~待办~~     | ~~✅ 已完成~~                                |
| ~~阶段 4.3 正文纸框 `EditorManuscriptFrame~~`                                                        | ~~待办~~     | ~~✅ 已完成~~                                |
| ~~章节 mutations `useEditorChapterMutations~~`                                                   | ~~可选~~     | ~~✅ 已完成~~                                |
| ~~导出 + 约束弹窗（`useEditorExportActions`、`EditorChapterConstraintsDialog`）~~                       | ~~可选~~     | ~~✅ 已完成~~                                |
| ~~快照 / 查找替换 / 概要保存（`useEditorSnapshotActions`、`useEditorFindReplace`、`useEditorSummarySave`）~~ | ~~可选~~     | ~~✅ 已完成~~                                |
| 结论                                                                                             | 三分之二是逻辑    | **搬家式拆分基本完成**；仅剩零散 JSX 与可选「大一统」收口（见第十五节） |


---

## 四、已有基线（禁止重复创建，优先复用）

### 已提取的 `useEditor`* hook（按时间顺序）


| 文件                                                | 职责                                                 |
| ------------------------------------------------- | -------------------------------------------------- |
| `src/hooks/useEditorPersist.ts`                   | 串行保存队列、冲突、bgSaveIssue                              |
| `src/hooks/useEditorChapterViewInserts.ts`        | 章纲 Tab 时插入需等切回正文的逻辑                                |
| `src/hooks/useEditorOpenAiFromQuery.ts`           | URL 参数打开右栏 AI Tab                                  |
| `src/hooks/useEditorShengHuiHandoffNavigation.ts` | 生辉页面跳转握手                                           |
| `src/hooks/useEditorRightRailMount.tsx`           | 把四个 Tab 内容注入右栏                                     |
| `src/hooks/useWorkAiContext.ts`                   | 风格卡/变量/RAG 默认/书斋数据                                 |
| `src/hooks/useDebouncedValue.ts`                  | 通用防抖                                               |
| `src/hooks/useEditorChapterNote.ts`               | 章节笔记加载 + 防抖落盘                                      |
| `src/hooks/useEditorChapterTitle.ts`              | 章节标题就地编辑（含乐观锁）                                     |
| `src/hooks/useEditorChapterSummaryModal.ts`       | 概要弹窗 + AI 生成 abort                                 |
| `src/hooks/useEditorInspirationList.ts`           | 灵感片段加载 / 刷新                                        |
| `src/hooks/useEditorAutoSummaryQueue.ts`          | 后台自动概要队列                                           |
| `src/hooks/useEditorExternalHandoffs.ts`          | 6 段一次性 URL/state 握手                                |
| `src/hooks/useEditorWorkLoader.ts`                | 作品/章节/卷加载 + 草稿恢复                                   |
| `src/hooks/useEditorChapterRefSync.ts`            | 章节字段 → 4 个 ref 同步                                  |
| `src/hooks/useEditorPendingScroll.ts`             | 跳转后高亮 / 切章清理                                       |
| `src/hooks/useEditorDraftAutosave.ts`             | sessionStorage 防抖草稿                                |
| `src/hooks/useEditorBeforeUnloadGuard.ts`         | 关闭页拦截                                              |
| `src/hooks/useEditorMoreMenu.ts`                  | 「更多」菜单外点 / ESC                                     |
| `src/hooks/useEditorChapterBibleSync.ts`          | 章节本子 5 字段（载入/防抖落盘/ref 镜像）                          |
| `src/hooks/useEditorMiscEffects.ts`               | 偏好持久化 + 焦点归还 + 邻近池同步 + 大纲选中 + 纸色同步（多个小 hook 同文件聚合） |
| `src/hooks/useEditorWidthDrags.ts`                | 正文宽度拖拽 + 侧栏宽度拖拽                                    |
| `src/hooks/useEditorPageKeyboard.ts`              | 编辑页全局快捷键（Ctrl+Shift+N/[/]、Alt+1~4/s、Ctrl+S）        |
| `src/hooks/useEditorChapterSwitch.ts`             | switchChapter（保存→快照→bible 异步链）                     |
| ~~`src/hooks/useEditorChapterMutations.ts`~~      | ~~章节/卷增删改移、拖拽排序、进度光标等 mutation~~                   |
| ~~`src/hooks/useEditorExportActions.ts`~~         | ~~导出本章/全书 txt·docx + 导出弹窗状态~~                      |
| ~~`src/hooks/useEditorSnapshotActions.ts`~~       | ~~章节快照列表、恢复、删除、手动快照后刷新~~                           |
| ~~`src/hooks/useEditorFindReplace.ts`~~           | ~~章内查找/替换状态与 handler~~                             |
| ~~`src/hooks/useEditorSummarySave.ts`~~           | ~~概要保存（保存并关闭 / 仅保存草稿）+ 批量概要回调~~                    |


### 已提取的 `components/editor/`* 组件


| 文件                                       | 职责                                 |
| ---------------------------------------- | ---------------------------------- |
| ~~`EditorChapterSidebar.tsx`~~           | ~~⬜ 待创建~~ → **✅ 已接入 `EditorPage`** |
| ~~`EditorManuscriptFrame.tsx`~~          | ~~正文区：内联工具栏 + 纸面 + CodeMirror~~    |
| ~~`EditorChapterConstraintsDialog.tsx`~~ | ~~本章约束（本子五字段）弹窗~~                  |
| ~~`EditorFindReplaceBar.tsx`~~           | ~~查找/替换条~~                         |
| `PulledOutlineTree.tsx`                  | 章纲树展示（已有）                          |
| `PullOutlineDialog.tsx`                  | 拉取章纲弹窗（已有）                         |
| `EditorShengHuiFromWritingControls.tsx`  | 生辉工具栏菜单（已有）                        |
| `StructuredMetaPreview.tsx`              | 章纲结构化预览（已有）                        |


---

## 五、阶段 0：基线与护栏（半日～1 日）

1. **固定回归清单**：使用 `docs/editor-regression-checklist.md`（若存在）或自拟 15～20 条，至少覆盖：**开书、切章、保存、保存冲突、右栏四 Tab、查找/替换、全书搜索跳转高亮、导出 txt/docx、章节快照、章纲拉取、流光握手 URL、生辉握手、refsImport 握手**。
2. **标记当前 UI**：编辑页全屏截图（侧栏展开态 + 右栏打开态），重构中仅作对照。
3. **提交策略**：遵循仓库 Git 规则（默认 main、小步提交）。

**产出**：行为基线明确，便于每阶段验收。

---

## 六、~~阶段 1：零 UI 的纯函数下沉~~（✅ 已完成）

**目标**：减少 `EditorPage.tsx` 行数，**不改任何渲染**。


| 优先级     | 内容                                                                    | 建议落点                                                   |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| ~~1.1~~ | ~~`flatChapterItems` 构建逻辑、orphan 章节推导、`chapterOrderCmp`~~             | ~~`src/util/editor-chapter-tree.ts`~~（侧栏内使用）           |
| ~~1.2~~ | ~~常量：`SIDEBAR_KEY`、`CHAPTER_LIST_KEY`、`CHAPTER_SORT_DIR_KEY_PREFIX`~~ | ~~`src/util/editor-page-keys.ts`~~（部分常量仍可在页面内，与当时一致即可） |
| ~~1.3~~ | ~~`FlatItem` 类型定义~~                                                   | ~~随侧栏/tree util~~                                      |


**验收**：章节列表顺序、孤儿章展示与重构前一致。

---

## 七、~~阶段 2：通用小 hook 外置~~（✅ 已完成）


| 优先级     | 内容                              | 建议落点                                 | 备注           |
| ------- | ------------------------------- | ------------------------------------ | ------------ |
| ~~2.1~~ | ~~文件顶部 `useDebouncedValue<T>`~~ | ~~`src/hooks/useDebouncedValue.ts`~~ | ~~已 import~~ |


**验收**：传给 AI 侧栏的正文防抖节奏不变（~600 ms）。

---

## 八、~~阶段 3：数据与副作用 hook~~（✅ 已全部接线）

> ~~每个 hook 单独一个 PR，避免互相干扰。~~（已全部落地于 `EditorPage`。）

### ~~3.1 `useEditorWorkLoader`~~（✅）

~~**抽取内容**：`load` 函数（含 draft 草稿恢复 confirm、章节/卷/outline 加载）、`loading`/`loaderExited` 状态、相关 `useEffect`（`void load()`）。~~  
~~**入参**：`workId`、`imperativeDialog`、`lastPersistedRef`、各 setter（`setWork`、`setChapters` 等）。~~  
~~**难点**：`imperativeDialog.confirm` 须作为外部依赖传入，不能在 hook 内直接调用 context。~~

### ~~3.2 `useEditorChapterNote`~~（✅）

~~**抽取内容**：`chapterNote`/`noteOpen` 状态、切章加载笔记的 `useEffect`、防抖保存 `useEffect`（`saveChapterNote`）。~~  
~~**入参**：`activeId`。~~  
~~**出参**：`{ chapterNote, setChapterNote, noteOpen, setNoteOpen }`。~~

### ~~3.3 `useEditorChapterTitle`~~（✅）

~~**抽取内容**：`chapterTitleEditing`/`chapterTitleDraft` 状态、`commitChapterTitle`、`saveChapterTitle`、切章重置 effect。~~  
~~**入参**：`activeChapter`、`chapterServerUpdatedAtRef`、`chapterTitleRef`、`setChapters`。~~  
~~**出参**：`{ chapterTitleEditing, setChapterTitleEditing, chapterTitleDraft, setChapterTitleDraft, saveChapterTitle }`。~~

### ~~3.4 `useEditorChapterSummaryModal`~~（✅）

~~**抽取内容**：`summaryOpen`/`summaryDraft`/`summaryAiBusy` 状态、`summaryAiAbortRef`、`runChapterSummaryAi`、打开弹窗时同步概要草稿的 effect。~~  
~~**入参**：`activeChapter`、`work`、`content`、`chapterServerUpdatedAtRef`、`setChapters`。~~  
~~**出参**：`{ summaryOpen, setSummaryOpen, summaryDraft, setSummaryDraft, summaryAiBusy, runChapterSummaryAi }`。~~

### ~~3.5 `useEditorInspirationList`~~（✅）

~~**抽取内容**：`inspirationList` 状态（`listAllReferenceExcerpts`）、初次加载 effect、`inspirationOpen` 变化时刷新 effect。~~  
~~**入参**：`workId`、`inspirationOpen`。~~  
~~**出参**：`{ inspirationList, setInspirationList }`。~~

### ~~3.6 `useEditorAutoSummaryQueue`~~（✅）

~~**抽取内容**：`autoSummaryStatus` 状态、`autoSummaryQueueRef`、队列创建/subscribe/cancel 的 effect（含切章时 cancel 的 effect）。~~  
~~**入参**：`activeId`、`setChapters`、`chapterServerUpdatedAtRef`、`chapterOrderRef`。~~  
~~**出参**：`{ autoSummaryStatus, autoSummaryQueueRef }`。~~  
~~**注意**：与 `useEditorPersist` 共用 `autoSummaryQueueRef`——抽出后，该 ref 改由本 hook 创建并传给 `useEditorPersist`，方向不能反。~~

### ~~3.7 `useEditorExternalHandoffs`~~（✅）

~~**抽取内容**：以下几段各自消费一次性 URL 参数的 effect：~~

- ~~`?chapter=` deep link（概要总览跳转）~~
- ~~`?refsImport=1`（参考材料导入）~~
- ~~`?hit=1`（搜索命中定位）~~
- ~~`?liuguangInsert` / `liuguangAppend` / `liuguangDraft`（流光）~~
- ~~`location.state.applyUserHint`（锦囊 prompt 跳转）~~

~~**入参**：`workId`、`chapters`、`switchChapterRef`、setter 集合、`setRightRailOpen/ActiveTab`。~~  
~~**禁止**：query 参数名、`window.history.replaceState` 时机、`clearXxx` 调用顺序不得改变。~~

### ~~3.8 `useEditorChapterSwitch`~~（✅）

~~**抽取内容**：`switchChapter` callback（含：保存当前章正文 → 快照 → 锦囊 bible → 切换内容）、`switchChapterRef`。~~  
~~**难点**：该函数同时依赖 `enqueueChapterPersist`（来自 `useEditorPersist`）、`runPersistChapter`、`upsertChapterBible`、`cbStateRef`（锦囊当前值）、`setBgSaveIssue`——依赖最复杂，建议等上面各 hook 稳定后再动，否则依赖链容易断。~~  
~~**验收重点**：切章后正文同步、旧章保存不丢、锦囊回写正确。~~

**另已完成（原方案写在其它小节，此处一并划线）**：~~`useEditorChapterBibleSync`、`useEditorMiscEffects`、`useEditorWidthDrags`、`useEditorPendingScroll`、`useEditorDraftAutosave`、`useEditorBeforeUnloadGuard`、`useEditorMoreMenu`、`useEditorChapterRefSync`、`useDebouncedValue`~~。

---

## 九、~~阶段 4：大块 JSX 原样迁入子组件~~（✅ **4.1～4.4 全部完成**）

原则：子组件为「带 props 的切片」，父组件仍在同一布局容器内拼装，**不改 DOM 包裹层级**。


| 优先级     | UI 区块                                                        | 建议组件路径                                                              | 预估行数      |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | --------- |
| ~~4.1~~ | ~~左侧：侧栏宽度拖拽、折叠、章节/章纲 Tab、章节列表（含虚拟列表）、卷头行~~                   | ~~`EditorChapterSidebar.tsx`~~                                      | ~~✅ 已接线~~ |
| ~~4.2~~ | ~~查找/替换条（findOpen 展开后整个条带）~~                                 | ~~`EditorFindReplaceBar.tsx`~~                                      | ~~✅ 已接线~~ |
| ~~4.3~~ | ~~正文区外层（纸纹容器、宽度拖拽条、`CodeMirrorEditor` 包裹、ShengHui surface）~~ | ~~`EditorManuscriptFrame.tsx`~~                                     | ~~✅ 已接线~~ |
| ~~4.4~~ | ~~顶栏注入（pills + 保存状态条）~~                                      | ~~落点为 `useEditorTopbarMount.tsx`（非原方案的 `EditorTopbarActions` 文件名）~~ | ~~✅ 已接线~~ |


**验收**：同断点下侧栏、正文、顶栏占位与重构前一致；侧栏拖拽宽度与折叠状态正常持久化。

---

## 十、~~阶段 5：事件与快捷键收口~~（✅ 已完成；拆为多 hook）

~~中风险，建议后期~~ → 已实现为独立模块，未合并为单一 `useEditorPageLifecycle`。


| 优先级          | 内容                                          | 建议落点                                                                                          |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ~~5.1~~      | ~~全局 `keydown`（查找热键、保存快捷键、右栏 Tab 切换、新建章等）~~ | ~~`useEditorPageKeyboard.ts`~~ · ✅                                                            |
| ~~5.2~~      | ~~`beforeunload` 未保存拦截~~                    | ~~`useEditorBeforeUnloadGuard.ts`~~ · ✅                                                       |
| ~~（等同 5.2）~~ | ~~焦点归还编辑器 / zen 聚焦~~                        | ~~`useEditorMiscEffects` 内 `useEditorFocusReturnOnActive` / `useEditorFocusReturnOnZen`~~ · ✅ |


**验收**：每一项快捷键行为一致；Alt+Z 与 EditorShell 的分工不变（无双重触发）。

---

## 十一、~~阶段 6：Dialog 胶水收口~~（**部分已完成**，大一统仍为可选）

~~以下已从 `EditorPage` 抽出（行为不变）：~~

- ~~**导出**：`useEditorExportActions`（含全书导出弹窗 open/format）~~  
- ~~**本章约束弹窗**：`EditorChapterConstraintsDialog~~`  
- ~~**章节快照**：`useEditorSnapshotActions~~`  
- ~~**章内查找/替换**：`useEditorFindReplace~~`  
- ~~**概要保存（含批量概要回调）**：`useEditorSummarySave~~`

仍留在页面内的 Dialog：**全书搜索**、`StudyLibraryDialog`、`PullOutlineDialog`、`ChapterSummaryEditorModal`/`BatchChapterSummaryModal` 等——若需再减行数，可后续收成单一 `useEditorModals`（可选）。  
**不改** Dialog trigger 在页面上的位置与触发条件。

---

## 十二、推荐总顺序（一句话）

~~**常量/纯函数 → useDebouncedValue → 独立状态 hook（笔记/标题/概要/灵感）→ 复杂状态 hook（loader/handoff/autoSummary）→ 左侧栏/正文框架 JSX → 键盘 → switchChapter（最后）。**~~  
~~**正文纸框、章节 mutations、导出/约束/快照/查找/概要保存 glue** 均已落地。~~

**剩余可选（收益递减）**：单独收成 `**useEditorModals`**（把仍留在页面里的若干 Dialog open/handler 再聚一层），或维持现状。

---

## 十三、每阶段完工检查（通用）

1. 手动跑回归清单。
2. 对照截图：侧栏开/合、右栏四 Tab、沉浸模式、切章、保存状态条。
3. 重点验「切章」「从外链带参数进入」「保存冲突」三条最容易被重构影响的路径。

---

## 十四、易违背「不改 UI」的行为（禁止）

- 合并/拆分可视区域（如把查找条塞进折叠菜单）。  
- 修改 `EditorShell` 右栏结构或 Tab 顺序/id。  
- 「重构顺便」改默认侧栏宽度、默认 Tab、localStorage key。  
- 在 `useEditorChapterSwitch` 之前抽它的任何依赖 hook 时，改变 ref 传递方向（尤其 `cbStateRef`）。

---

## 十五、剩余工作（相对 2026-05-01 收尾版）

- **当前 `EditorPage.tsx` ≈ 1232 行**（起点 3414 行）。
- ~~**阶段 4.3** `EditorManuscriptFrame~~` → ~~✅~~  
- ~~**章节 mutations** `useEditorChapterMutations~~` → ~~✅~~  
- ~~**导出 + 约束弹窗** `useEditorExportActions`、`EditorChapterConstraintsDialog~~` → ~~✅~~  
- ~~**快照 / 查找替换 / 概要保存** 三个 hook~~ → ~~✅~~  
- **仍可选（非必须）**：把剩余 Dialog（全书搜索、书斋、`PullOutlineDialog`、概要双 Modal 等）open/handler **收成一层 `useEditorModals`**，进一步压缩页面；不改 UI 触发位置前提下可做。

---

## 十六、相关文档

- `.cursor/rules/editor-page.mdc`：行数预算与拆分落点（项目规则）
- `.cursor/rules/liubai-react-structure.mdc`：全局落点决策表  
- `docs/editor-regression-checklist.md`：回归清单（若存在）  
- `docs/editor-page-optimization-plan-2026-04-19.md`：历史 UX/性能方案（可与本方案并行，勿混为同一批次大改）

