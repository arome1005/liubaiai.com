# 写作编辑页优化方案（2026-04-19）

> **范围**：`src/pages/EditorPage.tsx` + `src/components/EditorShell.tsx` + `src/components/AiPanel.tsx` + 相关右侧栏组件  
> **目标**：在不破坏主路径功能的前提下，分批落地 UX 提升、性能改善与功能补全  
> **优先级**：P0 = 当期必做 · P1 = 下期强推 · P2 = 可选迭代  

---

## 一、现状诊断

### 1.1 组件规模


| 文件                         | 行数      | 问题                       |
| -------------------------- | ------- | ------------------------ |
| `EditorPage.tsx`           | ~2987 行 | 单文件承载 60+ useState，渲染树极深 |
| `AiPanel.tsx`              | ~1828 行 | 多重关注点混合，难以单独测试           |
| `WritingStoreIndexedDB.ts` | ~2339 行 | 存储层全在一个文件                |


### 1.2 UX 痛点（用户可感知）

1. **章节切换无过渡**：切换章节时内容区空白闪烁，无 skeleton
2. **AI 草稿区体验粗糙**：草稿只存 localStorage，刷新后虽恢复但无"恢复提示"；也没有多草稿历史
3. **右侧栏 Tab 内容加载无状态**：摘要生成中、Bible 加载中等状态缺少进度指示
4. **查找替换条**：无"匹配数/当前位置"（如 5/23 中的第 5 个），替换全部后无结果汇总
5. **章节列表**：长列表（100+ 章）无虚拟滚动，拖拽排序体验抖动
6. **字数进度条**：章节列表中每章只显示字数，无目标进度条可视化
7. **保存状态反馈**：冲突/错误状态在顶栏，但没有更显眼的 toast 二次提示
8. **snapshot（快照）列表**：只有时间戳，无字数差/内容预览，难以判断选哪个
9. **编辑器宽度调节**：Max-width 可配，但无"一键恢复默认"按钮
10. **键盘快捷键覆盖不全**：缺少章节新建（`Ctrl+Shift+N`）、快照（`Ctrl+S` 双击）、折叠侧栏快捷键

### 1.3 性能瓶颈

1. **EditorPage 全量重渲**：60+ useState 任意变更触发整页重渲；`AiPanel` 等子树跟着重算
2. **无 code splitting**：所有路由打在同一 chunk；编辑器首屏含全量 AI panel 代码
3. **参考书库数据**：`listAllReferenceExcerpts()` 在页面 mount 时全量加载入内存
4. **RAG embedding 未缓存**：每次打开编辑器都重建向量矩阵
5. **章节列表未虚拟化**：DOM 节点随章数线性增长

### 1.4 功能缺口（对照说明书）

1. **写作目标（每日/章节字数目标）**：设置与进度可视化缺失
2. **专注计时器（Pomodoro）**：沉浸模式下无计时辅助
3. **段落级进度光标**：progress cursor 只支持章级，无段落偏移
4. **AI 产物追溯**：草稿区无"基于哪些材料生成""哪个模型""粗估成本"元信息
5. **多草稿历史**：AI 历史只保留最新一条，无法对比多次生成结果
6. **全书搜索跳转高亮**：搜索命中跳转后 CodeMirror 高亮消失
7. **章节批注/笔记**：侧边栏无独立的本章笔记区（区别于 Bible）
8. **导出时封面/前言**：txt/docx 导出缺少可配置前言页

---

## 二、优化方案详细设计

### P0：当期必做

---

#### P0-A：查找/替换体验补全

**问题**：当前查找栏无"N/M"位置指示，替换全部后无反馈。

**改动文件**：`src/pages/EditorPage.tsx`（findOpen 区块），`src/components/CodeMirrorEditor.tsx`

**实施步骤**：

1. 在 `CodeMirrorEditor` 暴露 `findMatchCount(): number` 和 `currentMatchIndex(): number` 方法（通过 `SearchCursor` 遍历或 CodeMirror `search` extension 状态）
2. 在 EditorPage findOpen 区块中，每次 `findQ` 变化时调用上述方法，将结果存入 `const [matchInfo, setMatchInfo] = useState<{current:number;total:number}|null>(null)`
3. 在查找输入框右侧追加 `<span className="text-muted-foreground text-xs">{matchInfo ?` ${matchInfo.current}/${matchInfo.total} `: ""}</span>`
4. "替换全部"完成后 `toast.success(\`已替换 {n} 处)`

**验收**：输入关键词后显示"3/12"；无匹配时显示"0/0"；替换全部后弹出 toast

---

#### P0-B：快照列表增强（字数 + 内容预览）

**问题**：快照列表只显示时间，无法判断选哪个。

**改动文件**：`src/pages/EditorPage.tsx`（snapshotList 渲染区块），`src/db/types.ts`（ChapterSnapshot 类型）

**实施步骤**：

1. 检查 `ChapterSnapshot` 类型是否已有 `wordCount` 字段；若无，在 `db/types.ts` 中添加可选字段 `wordCount?: number`
2. 在 `addChapterSnapshot()` 调用处（EditorPage 手动存快照逻辑）传入当前 `wordCount(content)`
3. 快照列表行渲染：
  - 时间戳（已有）
  - 字数（`{snap.wordCount ?? "?"} 字`）
  - 内容预览：取 `snap.content.slice(0, 60).replace(/\n/g, " ")` 显示为灰色小字
4. 最新快照自动加 `<Badge>最新</Badge>` 标签

**验收**：快照列表每行显示时间 + 字数 + 前 60 字预览

---

#### P0-C：章节列表字数目标进度条

**问题**：章节字数显示为纯数字，无目标对比。

**改动文件**：`src/pages/EditorPage.tsx`（章节列表渲染），`src/util/editor-typography.ts` 或新增 `src/util/chapter-goal.ts`

**实施步骤**：

1. 新建 `src/util/chapter-goal.ts`：
  ```ts
   const KEY = "liubai:chapterGoalWords";
   export function loadChapterGoal(): number { return Number(localStorage.getItem(KEY)) || 0; }
   export function saveChapterGoal(n: number) { localStorage.setItem(KEY, String(n)); }
  ```
2. 在 EditorPage 侧栏顶部（章节模式下）加一个"目标字数"小输入，默认 0（0 表示不显示）
3. 章节列表每行：若 `chapterGoal > 0`，在字数下方渲染一条 `<progress>` 或 Tailwind `bg-primary h-0.5 rounded` 进度条，宽度 = `Math.min(100, wordCount / chapterGoal * 100)%`
4. 超过目标时进度条变绿并显示 ✓

**验收**：设置目标 3000 字，写到 1500 字时进度条 50%；超过后变色

---

#### P0-D：AI 草稿区元信息卡

**问题**：AI 生成的草稿无追溯信息。

**改动文件**：`src/components/AiPanel.tsx`，`src/util/ai-panel-draft.ts`（或新增）

**实施步骤**：

1. 在草稿存储结构中增加元信息字段：
  ```ts
   interface AiDraftMeta {
     model: string;        // e.g. "claude-sonnet-4-6"
     provider: string;     // e.g. "anthropic"
     mode: string;         // e.g. "续写" | "抽卡"
     roughTokens: number;  // 粗估 token 消耗
     generatedAt: number;  // Date.now()
     contextSources: string[]; // e.g. ["styleCard", "rag", "recentSummaries"]
   }
  ```
2. 每次生成完成时，将元信息随草稿内容一起写入 localStorage
3. 在 AiPanel 草稿区顶部渲染一个折叠式"来源信息"条：
  - 默认折叠，点击 `▸ 查看来源` 展开
  - 展开后显示：模型、模式、生成时间、粗估消耗、注入的上下文类型
4. 折叠状态用 `useState` 管理，每次新草稿生成后重置为折叠

**验收**：生成草稿后能展开查看"claude-sonnet · 续写 · 3 分钟前 · ~1200 tokens · styleCard + rag"

---

#### P0-E：全书搜索跳转后保持高亮

**问题**：从全书搜索结果点击跳转到章节后，CodeMirror 中的关键词高亮会消失。

**改动文件**：`src/pages/EditorPage.tsx`（`pendingScrollRef` 处理逻辑），`src/components/CodeMirrorEditor.tsx`

**实施步骤**：

1. 在 `CodeMirrorEditor` 中添加 `highlight(query: string, isRegex: boolean)` 方法，注入 CodeMirror `SearchQuery` 并调用 `setSearchQuery`
2. 当 `pendingScrollRef` 处理（滚动定位）完成后，同时调用 `editorRef.current?.highlight(query, isRegex)`
3. 高亮状态在用户下次编辑或手动按 Esc 时清除（监听 CM 的 `keydown` 或内容变化）

**验收**：全书搜索"第一章"，点击命中后跳转，编辑器中该词高亮；继续输入后高亮自动消失

---

### P1：下期强推

---

#### P1-A：EditorPage 状态拆分（减少重渲染）

**问题**：60+ useState 导致任意状态变更触发整页重渲。

**方向**：将状态按关注点分组，用 `useReducer` 或拆分自定义 Hook

**实施步骤**：

1. 将编辑器 UI 状态（sidebarCollapsed、sidebarWidthPx、chapterListCollapsed、findOpen、moreOpen、snapshotOpen 等）抽为 `useEditorUIState()` Hook
2. 将加载/章节数据（work、chapters、volumes、activeId、content、saveState）抽为 `useEditorData(workId)` Hook，内部处理初始加载、章节切换、保存防抖逻辑
3. 将 AI 相关（cbGoal/cbForbid/cbPov/cbScene 等 chapter bible、style* 等）保留在 EditorPage 但集中为一个 `chapterBible` 对象，减少独立 state 数量（从 ~12 个 state 合并为 1 个对象 state）
4. 为 AiPanel 包裹 `React.memo` + 精确 props 传递（避免每次 content 变化触发 AiPanel 完整重渲）

**预期收益**：主编辑区输入时不再触发 AiPanel 重渲；章节切换时侧栏不重渲

---

#### P1-B：章节列表虚拟滚动

**问题**：100+ 章时 DOM 节点过多，拖拽卡顿。

**改动文件**：`src/pages/EditorPage.tsx`（章节列表渲染区块）

**实施步骤**：

1. 安装 `@tanstack/react-virtual`（已在常见依赖中，确认 package.json 是否已有）
2. 将章节列表改为 `useVirtualizer`，容器固定高度 = 侧栏高度减顶部控件高度
3. 每个章节行渲染不变，只有可视区域内的行有 DOM 节点
4. 拖拽排序：`dragChapterId` 状态保持，拖拽时临时关闭虚拟化，完成后重启（或用 overlay 方式）

**注意**：虚拟化与拖拽排序有冲突，需要保守实现：仅 100 章以上启用虚拟化

---

#### P1-C：多 AI 草稿历史（最近 5 条）

**问题**：当前只保留最新一条草稿，无法对比。

**改动文件**：`src/util/ai-panel-draft.ts`，`src/components/AiPanel.tsx`

**实施步骤**：

1. 修改 localStorage 存储结构：key `aiPanelDraft:{workId}` 改为存储数组 `AiDraft[]`，最多保留 5 条
2. 草稿区下方增加"历史草稿"折叠区，列出最近 5 条（时间 + 前 40 字预览）
3. 点击历史条目 → 将其内容填充到草稿区（原草稿询问是否覆盖）
4. 历史条目可单独删除

---

#### P1-D：右侧栏加载状态

**问题**：摘要生成中、Bible 加载中等状态缺少视觉反馈。

**改动文件**：`src/components/RightRailPanels.tsx`，`src/components/WritingSettingsRightPanel.tsx`

**实施步骤**：

1. 在 `SummaryRightPanel` 顶部：`isGenerating` 为 true 时显示 `<Loader2 className="animate-spin" />` + "正在生成摘要…"
2. 在 `RefRightPanel` 中：加载参考段落时显示 skeleton（3 行灰色矩形）
3. Bible 右侧栏：术语列表加载时用 `Array(3).fill(0).map(() => <Skeleton />)`
4. AiPanel 生成中：在草稿区顶部加流式进度条（已有但样式可增强 → 宽度从左到右循环动画）

---

#### P1-E：键盘快捷键补全

**问题**：缺少常用操作的快捷键。

**改动文件**：`src/pages/EditorPage.tsx`（keydown 监听），`src/util/hotkey-config.ts`

**新增快捷键**：


| 快捷键            | 操作                      |
| -------------- | ----------------------- |
| `Ctrl+Shift+N` | 新建章节                    |
| `Ctrl+Shift+[` | 章节列表折叠/展开               |
| `Ctrl+Shift+]` | 侧栏折叠/展开                 |
| `Ctrl+`        | 全书搜索                    |
| `Alt+S`        | 手动存快照                   |
| `Alt+1/2/3/4`  | 右侧栏 Tab 切换（AI/摘要/锦囊/参考） |


**实施步骤**：

1. 在 EditorPage 的 `keydown` effect 中补充上述快捷键的 `matchHotkey` 分支
2. 在 `hotkey-config.ts` 中为可配置项增加默认值
3. 在 Settings 页快捷键配置区（若存在）或编辑器设置 Sheet 中列出自定义选项

---

#### P1-F：章节批注/笔记区（独立轻量版）

**问题**：没有独立的"本章笔记"区，写作时只能在 Bible 里记。

**改动文件**：新增 `src/util/chapter-notes-storage.ts`，`src/pages/EditorPage.tsx`

**实施步骤**：

1. 新建 `chapter-notes-storage.ts`：存储结构 `{chapterId: string, notes: string}`，存 IndexedDB（可复用 `db/repo` 的一张轻量表，也可先用 localStorage）
2. 在编辑器左侧栏底部（章节信息下方）增加一个可折叠的"本章笔记"区：`<Textarea placeholder="写点什么…" />`，debounce 500ms 保存
3. 笔记区有内容时，章节列表该章旁显示一个小点（•）提示

---

### P2：可选迭代

---

#### P2-A：专注计时器（Pomodoro）

**位置**：沉浸模式（zen mode）工具条

**设计**：25 分钟倒计时 → 短休息 5 分钟 → 循环；计时条显示在顶栏（沉浸时）右侧；完成后 toast 通知  
**存储**：状态仅存 memory（不持久化），页面刷新重置

**文件**：新增 `src/util/pomodoro.ts`（纯计时逻辑），在 `EditorShell.tsx` 注入

---

#### P2-B：快照字数对比 diff 视图

**设计**：点击快照 → 右侧弹出 Split 对比视图（当前内容 | 快照内容），行级高亮 diff  
**库**：使用 `diff` npm 包（已有或轻量安装）

---

#### P2-C：导出前言/结语配置

**设计**：导出 docx/txt 时增加"封面选项"Sheet：书名、作者、前言、版权声明；填写后写入导出文件头部  
**文件**：`src/storage/export-txt-docx.ts`，新增 `ExportOptions` interface

---

#### P2-D：RAG embedding 持久化缓存

**问题**：每次打开编辑器都重建向量矩阵，耗时 2-5 秒。

**设计**：将 embedding 向量存入 IndexedDB（key = `{refId}:{contentHash}`），命中缓存时跳过重算  
**文件**：`src/util/work-rag-runtime.ts`

---

#### P2-E：按章节范围导出

**设计**：导出对话框增加"全书" / "指定卷" / "指定章节范围（X～Y章）"三种选项  
**文件**：`src/storage/export-txt-docx.ts`

---

## 三、实施阶段规划

### 第一阶段（P0，约 2-3 天）


| 编号   | 任务            | 估时    |
| ---- | ------------- | ----- |
| P0-A | 查找替换 N/M 位置指示 | 0.5 天 |
| P0-B | 快照列表字数 + 预览   | 0.5 天 |
| P0-C | 章节列表字数目标进度条   | 0.5 天 |
| P0-D | AI 草稿元信息卡     | 0.5 天 |
| P0-E | 全书搜索跳转后保持高亮   | 0.5 天 |


### 第二阶段（P1，约 4-6 天）


| 编号   | 任务              | 估时    |
| ---- | --------------- | ----- |
| P1-A | EditorPage 状态拆分 | 1.5 天 |
| P1-B | 章节列表虚拟滚动        | 1 天   |
| P1-C | 多 AI 草稿历史       | 0.5 天 |
| P1-D | 右侧栏加载状态         | 0.5 天 |
| P1-E | 键盘快捷键补全         | 0.5 天 |
| P1-F | 章节批注/笔记区        | 0.5 天 |


### 第三阶段（P2，按需迭代）


| 编号   | 任务               | 说明     |
| ---- | ---------------- | ------ |
| P2-A | 专注计时器            | 沉浸模式增值 |
| P2-B | 快照 diff 视图       | 高阶用户需求 |
| P2-C | 导出前言配置           | 发布功能   |
| P2-D | RAG embedding 缓存 | 性能优化   |
| P2-E | 按章节范围导出          | 长书写作需求 |


---

## 四、验收标准汇总


| 类型   | 验收口径                               |
| ---- | ---------------------------------- |
| 功能正确 | P0 各项手测通过，原有功能无退化                  |
| 性能   | 100 章时侧栏滚动 60fps；章节切换 < 200ms 内容呈现 |
| 可访问性 | 新增 UI 元素有 aria-label；键盘可操作         |
| 构建   | `npm run build` 无新增 warning/error  |


---

## 五、不做（明确排除）

- 不引入全局状态管理库（Redux/Zustand），维持现有 Context + useState 架构
- 不做大规模 AiPanel.tsx 拆分（留给独立重构专项，避免引入回归）
- 不做 Supabase 云同步启用（后端条件未具备）
- 不做移动端适配（产品定位 PC 写作工具）

---

*文档维护：每完成一个 P0/P1 子项后，在对应行前加 ✅ 并注明完成日期。*