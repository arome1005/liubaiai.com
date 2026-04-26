# 写作编辑页深度体检报告

**日期**：2026-04-24（状态更新：2026-04-24 Cursor 修复后）  
**检查范围**：EditorPage.tsx、EditorShell.tsx、EditorWritingSettingsSheet.tsx、EditorZenContext.tsx 及相关 util 文件  
**最新提交**：fdd2152 (豆包/火山 Ark 同源代理与观云推荐卡修复)

> **图例**：✅ 已修复　⚠️ 待确认　🔴 未处理

---

## Cursor 本轮修复了但本报告未捕获的问题（补录）

### 补 A — autoSummaryStatus 依赖缺失 ✅ 已修

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)

挂载右栏内容的 `useEffect` 里用了 `autoSummaryStatus`，但依赖数组漏了它，导致知识库面板的自动概要状态有概率停留在旧值不刷新。

**修复**：在依赖数组中补上 `autoSummaryStatus`。

---

### 补 B — pendingScrollRef !content 早退 ✅ 已修

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)

`pendingScrollRef` 的处理逻辑里有 `!content` 拦截条件，导致全书搜索跳转到空章节时，自动定位高亮被提前 return 掉，跳转流程不完整。

**修复**：去掉 `!content` 这个拦截条件。

---

## 1. Bug 与逻辑错误

### Bug 1.1 — 异步 ID 解析竞态条件 🔴 未处理（Medium）

**文件**：[EditorShell.tsx](src/components/EditorShell.tsx) 约第 94–103 行

`paletteWorkPathSeg` 变更时，异步 `resolveWorkIdFromRouteParam` 的回调可能在新路径已变更后才到达，将旧结果写入 `paletteWorkUuid`。

```typescript
useEffect(() => {
  if (!paletteWorkPathSeg) { setPaletteWorkUuid(null); return; }
  void (async () => {
    const internal = (await resolveWorkIdFromRouteParam(paletteWorkPathSeg)) ?? paletteWorkPathSeg;
    setPaletteWorkUuid(internal);  // ← 可能是过期的结果
  })();
}, [paletteWorkPathSeg]);
```

**修复建议**：加 AbortController 或本地版本号变量，在回调中检查是否仍为当前请求再 setState。

---

### Bug 1.2 — localStorage 写入异常未捕获 🔴 未处理（Low）

**文件**：[EditorShell.tsx](src/components/EditorShell.tsx) 约第 135–143 行

私密浏览或存储满时 `localStorage.setItem` 会抛出 `QuotaExceededError`，当前未 try-catch，会导致用户偏好设置静默丢失。

**修复建议**：为所有 `localStorage.setItem` 调用加 try-catch。

---

### Bug 1.3 — beforeunload 闭包陷阱 🔴 未处理（Critical）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx) 约第 1396–1409 行

`useEffect` 依赖项为空数组，闭包永远持有初始值。`persisted` 在关闭窗口时可能不是最新值，导致数据丢失判断失准。

```typescript
useEffect(() => {
  function onBeforeUnload(e: BeforeUnloadEvent) {
    const id = activeIdRef.current;
    const cur = contentRef.current;
    if (cur !== persisted || persistInFlightRef.current) {  // persisted 是初始闭包值
      e.preventDefault();
    }
  }
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}, []);  // ← 依赖项为空，闭包冻结了初始 persisted 值
```

**修复建议**：将 `persisted` 也存入 ref（`persistedRef`），在 beforeunload 中读 `persistedRef.current`。

---

### Bug 1.4 — ref 初始化完整性 🔴 未处理（Critical）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx) 约第 622–626 行

`chapterServerUpdatedAtRef`、`chapterTitleRef`、`chapterOrderRef` 等多个 Map-ref 在 `useEffect` 中批量更新，但在 `chapters` 数组首次加载之前如果被读取，可能访问到 `undefined`。

**修复建议**：在 `useRef(new Map())` 初始化时确认，同时在读取前加保护判断。

---

### Bug 1.5 — autoSummaryQueue 订阅可能未清理 🔴 未处理（High）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx) 约第 633–650 行

如果 `createAutoSummaryQueue().subscribe()` 返回的 `off` 函数未在 effect cleanup 中调用，会造成内存泄漏，且老订阅仍会响应新章节的事件。

**修复建议**：确认 `useEffect` 末尾有 `return () => off()` 或等价清理。

---

### Bug 1.6 — 事件监听器类型强制转换 🔴 未处理（Low）

**文件**：RightRailPanels.tsx 约第 41–42 行

```typescript
window.addEventListener(LINKED_CHAPTERS_UPDATED_EVENT, on as EventListener);
```

`as EventListener` 会掩盖类型不匹配，若 CustomEvent 结构变化，TypeScript 不会报错。

**修复建议**：定义 `CustomEvent<T>` 类型的回调，避免强制转换。

---

## 2. 性能问题

### Perf 2.1 — useState 过多，组件整体重渲 🔴 未处理（High）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx) 第 196–330 行

单组件有 50+ 个 `useState`，包括可以合并的字段：

- `stylePov`、`styleTone`、`styleBanned` → 合并为 `styleFields` 对象
- `chapterBibleFields` 的 5 个字段 → 合并为一个对象
- 任何一个字段更新都会触发整个大组件重新渲染

**修复建议**：将相关 state 聚合为对象，或使用 `useReducer` 管理复杂状态组。

---

### Perf 2.2 — 章节笔记自动保存每次输入触发 timeout 🔴 未处理（Medium）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx) 约第 1341–1346 行

```typescript
useEffect(() => {
  if (!activeId) return;
  const t = window.setTimeout(() => saveChapterNote(activeId, chapterNote), 500);
  return () => window.clearTimeout(t);
}, [activeId, chapterNote]);  // 每敲一个字创建一个 timeout
```

虽然有 cleanup，但频繁创建/清理仍有开销。

**修复建议**：改用已实现的 `useDebouncedValue` hook。

---

### Perf 2.3 — 传入子组件的回调缺少 useCallback 🔴 未处理（Medium）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)

大量传递给子组件的回调函数未用 `useCallback` 包裹，导致父组件每次 render 都生成新函数引用，子组件 `React.memo` 失效。

**修复建议**：为所有传给子组件的函数加 `useCallback`。

---

### Perf 2.4 — 设置抽屉每次打开重新读取所有 localStorage 🔴 未处理（Low）

**文件**：[EditorWritingSettingsSheet.tsx](src/components/EditorWritingSettingsSheet.tsx) 约第 204–211 行

```typescript
useEffect(() => {
  if (open) {
    setFontSizeState(readFontSize());
    setTypographyState(loadEditorTypography());
    setThemeState(readThemePreference());
    setEditorWidthState(readEditorWidth());
  }
}, [open]);
```

**修复建议**：组件挂载时预加载，或通过 context 共享这些偏好值。

---

## 3. UX 问题

### UX 3.1 — 右侧栏拖拽方向反向 🔴 未处理（Medium）

**文件**：[EditorShell.tsx](src/components/EditorShell.tsx) 约第 147–151 行

```typescript
const dx = draggingRef.current.startX - e.clientX;  // ← 向右拖反而变窄
const next = Math.max(280, Math.min(560, Math.floor(draggingRef.current.startW + dx)));
```

向右拖（`e.clientX` 增大）使 dx 为负值，right panel 宽度减小，与用户直觉相反。

**修复建议**：改为 `const dx = e.clientX - draggingRef.current.startX;`

---

### UX 3.2 — 沉浸快捷键双通道监听 ⚠️ 待确认（Medium）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)（可配置热键）+ [EditorShell.tsx](src/components/EditorShell.tsx)（固定 Alt+Z）

同一个沉浸模式切换动作在两处分别监听，默认配置下可能触发两套逻辑。用户修改热键后，EditorShell 里固定的 Alt+Z 仍然生效。

Cursor 已标记此问题，因涉及交互习惯待确认后再动。

**修复方向**：保留 EditorShell 的 Alt+Z，但让 EditorPage 的可配置热键检查是否与 Alt+Z 重叠，重叠时跳过自身处理。

---

### UX 3.3 — 后台保存失败用户感知不足 🔴 未处理（Medium）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)

`bgSaveIssue` 状态（`conflict` / `error`）出现时，如果只用 toast 提示，用户可能错过。冲突后数据可能被覆盖。

**修复建议**：添加持久的顶部警告条，直到用户确认处理。

---

### UX 3.4 — 编辑器宽度调整无实时预览 🔴 未处理（Low）

**文件**：[EditorWritingSettingsSheet.tsx](src/components/EditorWritingSettingsSheet.tsx)

选择不同的宽度预设后需关闭抽屉才能看到效果，缺乏即时反馈。

**修复建议**：选择时立刻预览宽度变化，保持抽屉打开。

---

## 4. 代码质量

### Quality 4.1 — EditorPage.tsx 单文件 4000+ 行 🔴 未处理（High）

**文件**：[EditorPage.tsx](src/pages/EditorPage.tsx)

包含章节管理、AI 面板集成、导出、快照、笔记、快捷键等多个独立功能，难以单独优化或测试。

**修复建议**：

- 提取 `useChapterManagement`、`useEditorDraft`、`useSnapshotManager` 等 custom hooks
- 将 AI Panel 交互、快照、导出逻辑拆为独立组件

---

### Quality 4.2 — localStorage 同步逻辑重复 ✅ 部分已修（EditorShell 清理了死代码）（Low）

**文件**：[EditorShell.tsx](src/components/EditorShell.tsx) 约第 135–143 行

```typescript
useEffect(() => { localStorage.setItem(LS_RIGHT_OPEN, rightOpen ? "1" : "0"); }, [rightOpen]);
useEffect(() => { localStorage.setItem(LS_RIGHT_TAB, activeTab); }, [activeTab]);
useEffect(() => { localStorage.setItem(LS_RIGHT_W_PX, String(rightWidthPx)); }, [rightWidthPx]);
```

三处相同模式，且均无异常处理。Cursor 本轮已清理未使用导入/ref，但这个重复模式本身未封装。

**修复建议**：封装 `useLocalStorageSync(key, value)` hook。

---

### Quality 4.3 — 编辑器宽度预设常量重复定义 ✅ 已修（Low）

**文件**：[EditorWritingSettingsSheet.tsx](src/components/EditorWritingSettingsSheet.tsx)、[editor-layout-prefs.ts](src/util/editor-layout-prefs.ts)

Cursor 已将宽度相关 key/default 抽成单一来源 `editor-layout-prefs.ts`，两处重复问题已解决。

---

### Quality 4.4 — sessionStorage 校验逻辑冗余 🔴 未处理（Low）

**文件**：[editor-hit-handoff.ts](src/util/editor-hit-handoff.ts) 和 [editor-refs-import.ts](src/util/editor-refs-import.ts)

两处都有相同的 JSON 结构校验：

```typescript
if (!j || typeof j !== "object") return null;
if (j.v !== 1) return null;
if (typeof j.workId !== "string" || !j.workId) return null;
```

**修复建议**：提取为共享的 `validateSessionPayload(j)` 工具函数。

---

## 5. 安全问题

### Security 5.1 — CSS 变量注入隐患 🔴 未处理（Low，潜在）

**文件**：[editor-typography.ts](src/util/editor-typography.ts) 约第 76–117 行

字体栈直接写入 CSS 变量，当前安全，但若未来开放用户自定义字体名称需严格校验。

**修复建议**：保持白名单校验，用户自定义字体时在写入前做字符集过滤。

---

### Security 5.2 — OTP 速率限制 🔴 未处理（Medium）

**文件**：[backend/server.js](backend/server.js)

`OTP_MAX_ATTEMPTS` 可能被同 IP 绕过（刷新后重置），缺少 IP 级速率限制。

**修复建议**：加 IP-based rate limiting（如 express-rate-limit + Redis）。

---

### Security 5.3 — sessionStorage 内容在 XSS 下暴露 🔴 未处理（Medium）

**文件**：[editor-hit-handoff.ts](src/util/editor-hit-handoff.ts)、[editor-refs-import.ts](src/util/editor-refs-import.ts)

sessionStorage/localStorage 中存有章节查询信息和参考资料内容，XSS 攻击可全量读取。

**修复建议**：敏感数据加密存储；定期清理过期 session 数据；严格 CORS 和 CSP 头。

---

## 当前状态汇总


| 条目                                | 严重度          | 状态     |
| --------------------------------- | ------------ | ------ |
| 补A — autoSummaryStatus 依赖缺失       | High         | ✅ 已修   |
| 补B — pendingScrollRef !content 早退 | Medium       | ✅ 已修   |
| Quality 4.3 — 宽度常量重复              | Low          | ✅ 已修   |
| Quality 4.2 — EditorShell 死代码     | Low          | ✅ 部分已修 |
| UX 3.2 — 快捷键双通道                   | Medium       | ⚠️ 待确认 |
| Bug 1.3 — beforeunload 闭包         | **Critical** | 🔴 未处理 |
| Bug 1.4 — Map-ref 初始化             | **Critical** | 🔴 未处理 |
| Bug 1.5 — autoSummaryQueue 订阅泄漏   | High         | 🔴 未处理 |
| Perf 2.1 — useState 过多            | High         | 🔴 未处理 |
| Quality 4.1 — 组件过大                | High         | 🔴 未处理 |
| Bug 1.1 — 竞态条件                    | Medium       | 🔴 未处理 |
| Perf 2.2 — 笔记保存防抖                 | Medium       | 🔴 未处理 |
| Perf 2.3 — 缺少 useCallback         | Medium       | 🔴 未处理 |
| UX 3.1 — 拖拽方向反向                   | Medium       | 🔴 未处理 |
| UX 3.3 — 保存失败反馈                   | Medium       | 🔴 未处理 |
| Security 5.2 — OTP 速率限制           | Medium       | 🔴 未处理 |
| Security 5.3 — sessionStorage XSS | Medium       | 🔴 未处理 |
| Bug 1.2 — localStorage 异常         | Low          | 🔴 未处理 |
| Bug 1.6 — 类型强制转换                  | Low          | 🔴 未处理 |
| Perf 2.4 — 设置抽屉预加载                | Low          | 🔴 未处理 |
| UX 3.4 — 宽度无实时预览                  | Low          | 🔴 未处理 |
| Quality 4.4 — sessionStorage 校验冗余 | Low          | 🔴 未处理 |
| Security 5.1 — CSS 变量注入           | Low          | 🔴 未处理 |


---

*报告生成：Claude Sonnet 4.6 · 审计基于源码静态分析，未覆盖运行时行为*