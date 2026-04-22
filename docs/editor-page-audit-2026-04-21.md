# 写作编辑页深度体检报告

> 审计日期：2026-04-21  
> 审计范围：`src/pages/EditorPage.tsx`（3926行）及相关组件

---

## 一、文件规模与架构风险


| 项目                                                      | 数值         | 风险   |
| ------------------------------------------------------- | ---------- | ---- |
| EditorPage.tsx 总行数                                      | **3926 行** | 🔴 高 |
| Hook 调用数（useEffect/useState/useMemo/useCallback/useRef） | **196 处**  | 🔴 高 |
| `window.confirm / prompt` 原生弹框调用                        | **12 处**   | 🟠 中 |
| AiPanel.tsx 总行数                                         | **2195 行** | 🟠 中 |


**问题**：EditorPage 是一个"巨石组件"，承担了状态管理、副作用、UI渲染的全部职责。任何改动都有高概率引入 side-effect，测试覆盖极低（目前无单测）。

---

## 二、UX & 交互 问题清单

### 2.1 大量使用原生 `window.confirm / prompt`（🔴 严重影响体验）

以下操作都弹出浏览器原生灰色对话框，破坏产品一致性：


| 触发操作       | 类型               | 行号               |
| ---------- | ---------------- | ---------------- |
| 检测到本地草稿恢复  | `window.confirm` | 1055             |
| 流光插入重复内容检测 | `window.confirm` | 1209, 1249, 1279 |
| 历史版本恢复确认   | `window.confirm` | 1936             |
| 全部替换确认     | `window.confirm` | 1995             |
| 新建卷输入标题    | `window.prompt`  | 2096             |
| 重命名卷       | `window.prompt`  | 2111             |
| 移动章节到哪一卷   | `window.prompt`  | 2145             |
| 孤儿章节并入首卷   | `window.confirm` | 2178             |
| 侧栏重命名章节    | `window.prompt`  | 2232             |
| 删除章节确认     | `window.confirm` | 2258             |


**建议**：全部替换为 Radix Dialog / AlertDialog 组件（项目中已有 Dialog 组件可直接复用）。

---

### 2.2 导出范围输入显示"order"技术字段（🟠 易用性差）

导出全书弹窗（行 3763-3789）的范围选择器显示：

```
从 order [数字输入] — 到 order [数字输入]
```

`order` 是数据库内部排序字段（0-indexed），用户看不懂，应改为显示"第X章标题"的下拉选择器。

---

### 2.3 查找替换栏缺少快捷键触发（🟠）

- 内置查找栏（find-bar）没有 `Ctrl/Cmd+F` 快捷键绑定（只有点击图标触发）
- `Ctrl+H` 替换也未绑定
- 已有 `Ctrl+S`、`Alt+1~4` 快捷键，但**没有快捷键总览帮助入口**

---

### 2.4 章节笔记仅存 localStorage（🟠 数据孤岛）

```typescript
// src/util/chapter-notes-storage.ts line 3
const prefix = "liubai:chapterNote:";
```

章节笔记用 `localStorage` 存储，**不经过 Supabase / IndexedDB 同步层**，换设备或清除浏览器数据后全部丢失。

---

### 2.5 虚拟滚动估算高度可能失准（🟠）

```typescript
// EditorPage.tsx line 603-604
estimateSize: (i) => {
  return c.id === activeId ? 130 : 46;
},
```

展开卡片的估算高度是硬编码 `130px`。本次已把 expanded card 的 padding/gap 压缩，实际高度已变（约 120px），可能导致虚拟列表跳动。

---

### 2.6 移动卷操作用数字编号选择（🔴）

```typescript
const n = window.prompt(`移到哪一卷？\n${lines}`, "1");
const idx = Number.parseInt(n, 10) - 1;
if (idx < 0 || idx >= volumes.length) return;  // 无效输入直接静默忽略
```

用户需要输入数字（1、2、3...）来选择目标卷，极不友好，且无错误提示。

---

### 2.7 章节列表缺少"复制章节"功能（🟡 功能缺失）

竞品（如飞书文档、幕布）都提供复制段落/章节功能。当前侧栏的展开卡片只有"概要/约束/删除/↑↓✎/卷"，没有复制。

---

### 2.8 章节没有状态标记（🟡 功能缺失）

- 无法标记章节为"草稿/待改/完成"等状态
- 没有颜色标记或分组标签
- 进度书签（🔖）只能设置一个位置，无法标多个重要位置

---

## 三、性能问题

### 3.1 右侧栏面板每次 `content` 变化都重新挂载（🔴）

```typescript
// EditorPage.tsx line 886-919（依赖数组节选）
}, [
  workId, work, activeChapter, chapters,
  aiPanelContent,   // ← 600ms debounce，但仍触发
  chapterBibleFields, glossaryTerms, bibleCharacters,
  styleSampleSlices, aiPanelWorkStyle,
  // ... 共 25 个依赖项
]);
```

每次 `aiPanelContent` 变化（击键后 600ms），整个 `setRightRailTabContent("ai", <AiPanel .../>)` 就会重新执行，创建新的 JSX 树。虽然 React 会 diff，但 AiPanel 内部的 `sessionStorage` 草稿状态若不做幂等处理，可能产生抖动或状态丢失。

**根本原因**：4个面板（AI/知识库/书斋/参考）全部通过 `setTabContent` 注入内容，而非用稳定的 Props 传递方式。

---

### 3.2 全书章节内容全量加载进内存（🟠）

```typescript
// EditorPage.tsx line 1035-1041
const list = await listChapters(workId);
setChapters(list);
// ...
for (const c of list) {
  lastPersistedRef.current.set(c.id, c.content);  // 全部 content 进 Map
}
```

87章的小说，每章2000字，即 ~17.4万字全部常驻内存，并维护了 `lastPersistedRef` 这个额外副本。100章以上写手会遇到明显内存压力。

---

### 3.3 导出全书时对每章做 snapshot（🟠 导出缓慢）

```typescript
// EditorPage.tsx line 2350
for (const c of list) await addChapterSnapshot(c.id, c.content);
```

导出全书时串行为每一章写一条快照，87章意味着 87 次 DB 写。

---

### 3.4 全书搜索的 diff 算法限制 400 行（🟡）

```typescript
// EditorPage.tsx line 3858
const a = oldText.split("\n").slice(0, 400);
const b = newText.split("\n").slice(0, 400);
```

对比超过 400 行的章节版本时，diff 会被截断，用户看不到完整差异。

---

## 四、功能缺失清单

### 4.1 已有 CSS 但未实现的功能


| CSS 类名                                        | 含义        | 状态            |
| --------------------------------------------- | --------- | ------------- |
| `.chapter-goal-bar` `.chapter-goal-bar__fill` | 章节字数目标进度条 | 🔴 CSS 存在，无组件 |
| `.chapter-goal-input-row`                     | 目标字数输入行   | 🔴 CSS 存在，无组件 |
| `.editor-chapter-title-index`                 | 章节序号标签    | 🔴 CSS 存在，无渲染 |
| `.editor-chapter-title-sparkle`               | 章标题装饰     | 🔴 CSS 存在，无渲染 |
| `.editor-topbar-bc-chapter`                   | 顶栏章节面包屑   | 🔴 CSS 存在，无使用 |


**最重要缺失**：章节字数目标进度条（`.chapter-goal-bar`）CSS 和工具函数（`src/util/chapter-goal.ts`）都已写好，但没有接入 UI。

---

### 4.2 写作辅助功能缺失


| 功能               | 竞品参考           | 优先级 |
| ---------------- | -------------- | --- |
| 打字机模式（光标居中）      | Ulysses / Bear | 🟠  |
| 专注模式（隐藏所有 UI）    | iA Writer      | 🟠  |
| 段落字数 / 阅读时长估算    | 多数写作工具         | 🟡  |
| 全书字数统计仪表盘        | 幕布 / Scrivener | 🟡  |
| 每日写作目标（今日新增 N 字） | 有了后端，缺前端展示     | 🟡  |
| 章节复制             | 飞书 / Notion    | 🟡  |
| 章节状态标记（草稿/完成）    | Scrivener      | 🟡  |
| 章节颜色/标签          | Scrivener      | 🟡  |


---

### 4.3 章节管理功能缺失

- **批量选择章节**操作（批量删除、批量移动到卷、批量导出选定章节）
- **章节排序方式**：目前只有正序/倒序切换，缺少"按更新时间""按字数"等排序
- **章节搜索/过滤**：章节数多时，无法在侧栏直接搜索章节名
- **章节折叠大纲视图**：章纲标签页只显示已推送纲要，没有层级结构

---

### 4.4 导出功能缺失


| 功能                 | 优先级 |
| ------------------ | --- |
| 导出为 Markdown (.md) | 🟠  |
| 按卷导出（不是全书，也不是单章）   | 🟠  |
| 导出时包含章节概要          | 🟡  |
| 导出为 ePub           | 🟡  |
| 导出时自定义章节标题格式       | 🟡  |


---

## 五、Bug / 潜在错误

### 5.1 `handleRename`（侧栏重命名）和 `saveChapterTitle`（纸面标题）逻辑重复

两套重命名逻辑（`handleRename` 用 `window.prompt`，`saveChapterTitle` 用 inline input），更新 `chapterTitleRef` 的逻辑也各自维护，容易不同步。

---

### 5.2 `setProgressChapter` 每次都全量 reload work（🟡）

```typescript
async function setProgressChapter(id: string) {
  await updateWork(workId, { progressCursor: id });
  const w = await getWork(workId);   // ← 全量重新拉取
  if (w) setWork(w);
}
```

可以直接 `setWork(prev => prev ? { ...prev, progressCursor: id } : prev)` 乐观更新。

---

### 5.3 草稿恢复弹窗在 loading 期间可能触发（🟠）

```typescript
// EditorPage.tsx line 1052-1061
if (workId && pick && first) {
  const dr = readDraft(workId, pick);
  if (dr && dr.savedAt > first.updatedAt && dr.content !== initial) {
    if (window.confirm("检测到未同步的本地草稿...")) {
```

这个 `window.confirm` 在 `load()` 异步函数中，页面还在加载时就可能弹出，给用户体验造成困扰。

---

### 5.4 流光插入的重复检测使用 `content.includes(needle)` 过于宽松（🟡）

```typescript
const needle = text.trim().slice(0, 80);
if (needle && cur.includes(needle)) { // 80字以内完全相同即触发确认
```

80字前缀完全相同就提示重复，会在某些情况下误报（如惯用开场白"他走进房间"在多章出现时）。

---

### 5.5 虚拟列表展开项高度估算与实际不符

见 3.1，当前估算 `130px`，实际约 `~118px`（压缩后），会导致滚动位置计算偏差。只影响100章以上的用户。

---

### 5.6 `handleAttachOrphansToFirstVolume` 串行等待每章（🟡 性能）

```typescript
for (const c of orphanChapters) {
  await updateChapter(c.id, { volumeId: firstVol.id }, ...);
}
await load(); // 最后全量 reload
```

20个孤儿章节会串行发出 20 个请求，可改为 `Promise.all` 或批量 API。

---

## 六、无障碍（A11y）问题


| 问题                                      | 位置                         | 严重度 |
| --------------------------------------- | -------------------------- | --- |
| 章节卡片 ↑↓✎ 按钮只有 `title` 属性，无 `aria-label` | `renderChapterSidebarItem` | 🟠  |
| 全书搜索弹窗不是 `<dialog>` 元素，无 `aria-modal`   | BookSearch modal           | 🟠  |
| 快照历史弹窗同上                                | Snapshot modal             | 🟠  |
| 导出弹窗同上                                  | Export modal               | 🟡  |
| 内联工具栏图标按钮 `↶↷⧉` 等纯符号，无文字说明              | inline-toolbar             | 🟡  |
| 查找栏 Enter 仅在 onKeyDown 处理，Tab 键焦点序不清晰   | find-bar                   | 🟡  |


---

## 七、代码质量问题

### 7.1 `EditorPage` 过于庞大（首要优先级）

建议拆分为以下子模块：

- `useEditorState` — 所有 useState
- `useEditorPersist` — 保存/快照/草稿相关副作用
- `useEditorChapterOps` — 章节增删改排序
- `ChapterSidebarPanel` — 左侧栏 JSX
- `EditorPaperArea` — 正文纸面 JSX
- `EditorModals` — 所有弹窗集合

### 7.2 两套弹窗系统并存

- 旧系统：`<div className="modal-overlay">` + `<div className="modal-card">`（全书搜索、快照、导出）
- 新系统：Radix UI `<Dialog>`（约束弹窗、章节关联等）

混用造成 z-index 管理复杂，建议全面迁移到 Radix Dialog。

### 7.3 `onSaveAndClose` 和 `onSaveDraft` 代码完全重复

`ChapterSummaryEditorModal` 的两个回调（`onSaveAndClose` 和 `onSaveDraft`）在 EditorPage 中的实现几乎一字不差，差异仅在最后是否执行 `setSummaryOpen(false)`，应合并。

---

## 八、功能完整度总评


| 维度      | 评分    | 说明                   |
| ------- | ----- | -------------------- |
| 核心写作功能  | ⭐⭐⭐⭐☆ | 保存/快照/查找替换/全书搜索完备    |
| AI 辅助功能 | ⭐⭐⭐⭐⭐ | 续写/抽卡/概要/批量概要齐全      |
| 章节管理    | ⭐⭐⭐☆☆ | 缺复制、状态标记、批量操作、侧栏搜索   |
| 导出功能    | ⭐⭐⭐☆☆ | 缺 Markdown/ePub/按卷导出 |
| 交互体验    | ⭐⭐⭐☆☆ | 12处原生弹框破坏一致性         |
| 性能      | ⭐⭐⭐☆☆ | 全量内存加载、面板频繁重建        |
| 无障碍     | ⭐⭐☆☆☆ | 多处缺 aria 属性          |
| 代码可维护性  | ⭐⭐☆☆☆ | 单文件近4000行，急需拆分       |


---

## 九、优先修复建议（按影响排序）


| 优先级   | 项目                                               | 工作量 |
| ----- | ------------------------------------------------ | --- |
| 🔴 P0 | 用 Radix AlertDialog 替换所有 `window.confirm/prompt` | M   |
| 🔴 P0 | 接入已写好的章节字数目标进度条                                  | S   |
| 🟠 P1 | 章节笔记改为存 IndexedDB（同步到云端）                         | M   |
| 🟠 P1 | 导出范围改为章节名称下拉，而非 order 数字                         | S   |
| 🟠 P1 | 虚拟列表展开项高度估算修正（130→118）                           | XS  |
| 🟠 P1 | 补充 Ctrl+F 打开查找栏的快捷键                              | XS  |
| 🟡 P2 | 章节侧栏添加搜索/过滤输入框                                   | S   |
| 🟡 P2 | 章节复制功能                                           | S   |
| 🟡 P2 | 导出支持 Markdown 格式                                 | S   |
| 🟡 P2 | 全书字数统计面板（今日/本章/全书）                               | M   |
| 🟡 P2 | 打字机模式                                            | M   |
| 🟡 P3 | EditorPage 拆分为多个子模块                              | XL  |


---

*报告生成：Claude Sonnet 4.6 · 审计基于源码静态分析，未覆盖运行时行为*