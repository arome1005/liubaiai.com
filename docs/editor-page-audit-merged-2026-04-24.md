# 写作编辑页统一体检报告（合并版）

> 生成日期：2026-04-24  
> 合并来源：`editor-page-audit-2026-04-21.md`、`editor-page-audit-2026-04-24.md` + 本轮复核与修复  
> 审计范围：`src/pages/EditorPage.tsx`、`src/components/EditorShell.tsx`、`src/components/EditorWritingSettingsSheet.tsx`、`src/components/RightRailPanels.tsx`、相关 util/hooks  
> 约束前提：**所有优化不得改变既定功能和 UI 行为（含编辑页外联动）**

---

## 0. 本轮已完成（用删除线标注）

- ~~右栏知识库 `autoSummaryStatus` 可能不刷新（依赖遗漏）~~  
  - 状态：**已修复**（`EditorPage` 右栏挂载 effect 已补 `autoSummaryStatus` 依赖）
- ~~全书搜索跳转到空章节时不触发定位/高亮（`!content` 早退）~~  
  - 状态：**已修复**（保留 `activeId` 判断，移除 `content` 阻断）
- ~~编辑宽度 key/default 常量在两处重复定义~~  
  - 状态：**已修复**（新增 `src/util/editor-layout-prefs.ts` 作为单一来源）
- ~~EditorShell 未使用导入/未使用 ref（死代码）~~  
  - 状态：**已清理**（不改 UI，不改交互）
- ~~autoSummaryQueue 订阅可能未清理~~  
  - 状态：**已复核通过（误报）**：现有实现已 `off()` + `q.cancel()`
- ~~beforeunload 闭包冻结 persisted~~  
  - 状态：**已复核通过（误报）**：当前从 `activeIdRef/contentRef/lastPersistedRef` 读取最新值
- ~~Map-ref 初始化完整性不明~~  
  - 状态：**已复核通过（低风险）**：相关 ref 使用 `useRef(new Map())`，并在读取处有基础保护
- ~~命令面板 workId 解析异步竞态（EditorShell）~~  
  - 状态：**已修复**（加入请求序号 + cleanup 取消，避免过期结果写回）
- ~~EditorShell localStorage 写入未捕获~~  
  - 状态：**已修复**（读写统一走 `safeGetLocalStorage` / `safeSetLocalStorage` + `useLocalStorageSync` hook）
- ~~EditorShell 快捷键监听分散在 4 处 useEffect~~  
  - 状态：**已修复**（合并为统一入口，bubble phase + capture phase + fullscreenchange 各一个 handler，不改键位和行为）
- ~~EditorPage `zenWriteRef` render 阶段赋值触发 lint 错误~~  
  - 状态：**已修复**（移至 `useEffect`，不影响 beforeunload 等关键 ref 同步路径）
- ~~原生 `window.confirm/prompt` 过多（12 处）~~  
  - 状态：**已修复**（新增 `ImperativeDialogProvider` + `useImperativeDialog`，基于 Radix AlertDialog；12 处全部替换，文案/按钮顺序/阻断逻辑不变）
- ~~EditorPage 保存管线内联代码过长（150+ 行）~~  
  - 状态：**已完成**（抽取为 `src/hooks/useEditorPersist.ts`，包含 saveState、bgSaveIssue、persistQueue、runPersistChapter、persistContent、resolveSaveConflict、useAutoSave）

---

## 1. 当前仍待处理的问题（按优先级）

### P1（稳定性 / 质量优化）

#### ~~1.1 右栏拖拽方向问题~~ ✅ 已确认（设计意图）

- ~~现状：代码为 `startX - clientX`；右栏在页面右侧，拖拽柄在其左边缘，向左拖 → 变宽，向右拖 → 变窄。~~
- 结论：拖拽柄位于右栏左边缘，向左拉 = 扩展右栏宽度，符合直觉。**经产品确认为设计意图，非 bug。**

#### ~~1.2 章节笔记仅 localStorage（跨设备不可同步）~~ ✅ 已完成

- ~~现状：`chapter-note` 当前为本地存储。~~
- ~~风险：中（换设备丢失）。~~
- 完成内容：
  - `Chapter` 类型新增 `chapterNote?: string` 字段（`src/db/types.ts`）；
  - Dexie v32 升级：一次性将 `localStorage liubai:chapterNote:`* 迁入 IndexedDB（`src/db/database.ts`）；
  - `chapter-notes-storage.ts` 重写：主存储走 IndexedDB，同步 API 签名不变，内部使用内存 cache + 后台异步写入，首次加载自动迁移 localStorage 残余；
  - `warmChapterNoteCache()` 在 EditorPage 章节列表加载后调用，预热缓存；
  - WritingStore 接口、IndexedDB 实现、Supabase 实现、repo.ts 均已扩展 `chapterNote` 字段；
  - UI 交互完全不变。

---

### P2（中长期结构优化，不立即动 UI）

#### ~~2.1 EditorPage 巨石组件拆分（低风险部分）~~ ✅ 已完成

- 完成内容（EditorPage 3943 → 3532 行，累计 -411 行）：
  - `simpleDiffLines` + `collapseDiff` → `src/util/text-diff.ts`
  - `downloadBlob` + `safeFilename` → `src/util/download.ts`
  - 导出全书弹窗 → `src/components/ExportBookDialog.tsx`（含 5 个表单 state 内聚）
  - 快照历史弹窗 → `src/components/ChapterSnapshotDialog.tsx`（含 diffSnapshotId state 内聚）
  - 全书搜索弹窗 → `src/components/BookSearchDialog.tsx`（含 5 个搜索 state + runBookSearch 内聚）
  - `handleRename` / `saveChapterTitle` 去重 → 共享 `commitChapterTitle` 内部函数
- 所有弹窗 className、结构、文案、按钮顺序原样保留，通过冒烟 + 回归自测。

#### 2.1b EditorPage 巨石组件拆分（高风险部分，后续自然迭代）

- 章节侧栏列表项 → `ChapterSidebarListItem` 组件（需 15+ props，中等风险）
- 章节/卷 CRUD → `useEditorChapterOps` hook（12+ state 深度耦合，高风险）
- 右栏面板挂载 → `useEditorPanelsBridge`（收益有限）
- **建议跟随功能开发逐步剥离，而非一次性大拆。**

#### 2.2 导出与章节管理能力增强（需求型）

- 现状：按卷导出、Markdown 导出、章节复制、批量操作等多为能力缺口，不属于线上 bug。
- 风险：低（属于增量能力）。
- 解决方式：
  - 以 feature flag 或迭代里程碑推进；
  - 与"稳定性修复"拆开，避免交叉回归。

---

## 2. 合并后问题总表（状态）


| 项目                           | 来源          | 状态       | 说明                                                     |
| ---------------------------- | ----------- | -------- | ------------------------------------------------------ |
| 原生 confirm/prompt 过多         | 04-21       | **已完成**  | 12 处全部替换为 Radix ImperativeDialog                       |
| 右栏 `autoSummaryStatus` 不刷新   | 本轮/04-24    | **已完成**  | 已补依赖                                                   |
| 空章节搜索跳转不定位                   | 本轮          | **已完成**  | 去掉 `!content` 早退                                       |
| 异步 workId 解析竞态               | 04-24       | **已完成**  | 已加请求序号与 cleanup 防竞态                                    |
| localStorage 写入未捕获           | 04-24       | **已完成**  | 已统一 safe get/set + hook 防异常                            |
| 快捷键治理分散                      | 04-24/本轮    | **已完成**  | 合并为统一入口，不改键位                                           |
| zenWriteRef render 赋值        | 本轮          | **已完成**  | 移至 effect，消除 lint error                                |
| 保存管线内联过长                     | 本轮          | **已完成**  | 抽取为 `useEditorPersist` hook                            |
| beforeunload 闭包陷阱            | 04-24       | **复核通过** | 当前实现使用 ref 读取最新值                                       |
| autoSummaryQueue 未清理         | 04-24       | **复核通过** | 已存在 `off + cancel`                                     |
| ref 初始化不完整                   | 04-24       | **复核通过** | 关键 Map refs 已初始化                                       |
| 编辑宽度常量重复                     | 04-24       | **已完成**  | 已抽 `editor-layout-prefs.ts`                            |
| EditorShell 死代码              | 本轮          | **已完成**  | 已清理未使用导入/ref                                           |
| 右栏拖拽方向疑问                     | 04-24       | **已确认**  | 设计意图，拖柄在左边缘向左拉变宽符合直觉                                   |
| 章节笔记本地孤岛                     | 04-21       | **已完成**  | 迁至 IndexedDB（Chapter.chapterNote），Dexie v32 自动迁移       |
| 巨石组件拆分（低风险）                  | 04-21/04-24 | **已完成**  | 3 弹窗组件 + 纯函数 + 标题去重（-411 行）                            |
| 巨石组件拆分（高风险）                  | 04-21/04-24 | 后续迭代     | 侧栏列表项 / 章节 CRUD / 面板挂载                                 |
| setProgressChapter 全量 reload | 04-21       | **已完成**  | 改为乐观更新，去掉多余 getWork 调用                                 |
| 孤儿章节归卷串行请求                   | 04-21       | **已完成**  | 串行 for-await → Promise.all 并行                          |
| 导出全书 snapshot 串行写入           | 04-21       | **已完成**  | 串行 for-await → Promise.all 并行                          |
| 事件监听器类型强制转换                  | 04-24       | **已完成**  | RightRailPanels `as EventListener` → 具体 CustomEvent 类型 |
| sessionStorage 校验逻辑冗余        | 04-24       | **已完成**  | 提取 `session-payload.ts` 共享读取/写入/清除工具                   |


---

## 3. 本轮新增/修改的文件清单


| 文件                                              | 变更类型 | 说明                                                              |
| ----------------------------------------------- | ---- | --------------------------------------------------------------- |
| `src/components/ImperativeDialog.tsx`           | 新增   | Radix AlertDialog 的命令式 confirm/prompt 适配层                       |
| `src/hooks/useEditorPersist.ts`                 | 新增   | 保存管线 hook（saveState / persistQueue / runPersist / autoSave）     |
| `src/util/editor-layout-prefs.ts`               | 新增   | 编辑宽度相关常量单一来源                                                    |
| `src/pages/EditorPage.tsx`                      | 修改   | 12 处弹框替换 + 保存管线抽取 + 依赖修复 + ref lint 修复                          |
| `src/components/EditorShell.tsx`                | 修改   | 竞态修复 + 存储容错 + 快捷键集中 + 死代码清理 + Provider 挂载                       |
| `src/components/EditorWritingSettingsSheet.tsx` | 修改   | 改用共享常量                                                          |
| `src/util/chapter-notes-storage.ts`             | 重写   | 主存储从 localStorage → IndexedDB，新增内存 cache + warmChapterNoteCache |
| `src/db/types.ts`                               | 修改   | Chapter 类型新增 `chapterNote?: string`；SCHEMA_VERSION 31→32        |
| `src/db/database.ts`                            | 修改   | 新增 Dexie v32 升级（localStorage → IndexedDB 一次性迁移）                 |
| `src/db/repo.ts`                                | 修改   | updateChapter Pick 扩展 `chapterNote`                             |
| `src/storage/writing-store.ts`                  | 修改   | WritingStore 接口 updateChapter Pick 扩展 `chapterNote`             |
| `src/storage/writing-store-indexeddb.ts`        | 修改   | updateChapter Pick 扩展 `chapterNote`                             |
| `src/storage/writing-store-supabase.ts`         | 修改   | updateChapter Pick + row mapping 扩展 `chapterNote`               |
| `src/storage/supabase-writing-rows.ts`          | 修改   | parseChapterRow / toChapterInsert 扩展 `chapter_note` 字段          |
| `src/util/session-payload.ts`                   | 新增   | sessionStorage v1 payload 读取/写入/清除共享工具                          |
| `src/util/editor-hit-handoff.ts`                | 重构   | 使用 session-payload 共享工具去重                                       |
| `src/util/editor-refs-import.ts`                | 重构   | 使用 session-payload 共享工具去重                                       |
| `src/components/RightRailPanels.tsx`            | 修改   | 事件监听器类型转换修复（CustomEvent 类型化）                                    |
| `src/util/text-diff.ts`                         | 新增   | simpleDiffLines + collapseDiff（从 EditorPage 提取）                 |
| `src/util/download.ts`                          | 新增   | downloadBlob + safeFilename（从 EditorPage 提取）                    |
| `src/components/ExportBookDialog.tsx`           | 新增   | 导出全书弹窗组件（含 5 个表单 state 内聚）                                      |
| `src/components/ChapterSnapshotDialog.tsx`      | 新增   | 快照历史弹窗组件（含 diff 渲染）                                             |
| `src/components/BookSearchDialog.tsx`           | 新增   | 全书搜索弹窗组件（含搜索 state + 逻辑）                                        |


---

## 4. 下一步建议

- 迭代 A（后续自然迭代中）：
  - EditorPage 章节 CRUD / 面板挂载进一步拆分（跟随功能开发逐步剥离）
  - 旧弹窗系统（`modal-overlay` + `modal-card`）全面迁移到 Radix Dialog（全书搜索、快照、导出）
  - 传给子组件的回调补 `useCallback`（需逐一评估依赖项）
  - 虚拟列表展开项高度估算微调（130 → 实际值，需真机测量）

---

*备注：本报告已吸收两份历史报告并对关键项做源码复核；"已完成/复核通过"项已显式标注，便于后续持续跟踪。*