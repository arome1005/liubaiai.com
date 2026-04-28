# 推演页 · 五层规划生成可终止（2026-04-28）

> 本目录统一说明见 [README.md](./README.md) · 新条目请抄 [_template.md](./_template.md)。

供复查用：本文件记录**做了什么、怎么做的、涉及哪些文件**。

## 目标

- 在推演（V0 推砚）**详情**里，从「生成总纲」到各层章纲/细纲生成时，主按钮在「生成中」状态下应**可被用户终止**。
- 不往 `EditorPage.tsx` / `AiPanel.tsx` 堆业务逻辑；遵守 `liubai-react-structure.mdc` 与 v0 推演页拆分习惯。

## 背景（实现前已存在的能力）

- `useTuiyanPlanningActions` 在每次 `generatePlanningLevel` / `regenerateCurrentVolume` 开始时已：
  - `planningAbortRef.current?.abort()` 取消上一段；
  - `new AbortController()` 赋给 `planningAbortRef`；
  - 将 `signal` 传给 `generateTuiyanPlanningList`、`generateTuiyanPlanningDetail`（见 `src/ai/tuiyan-planning-generate.ts` → `generateWithProviderStream` → `src/ai/providers.ts` 各 provider 流式实现）。
- `catch` 中对 `AbortError` / 门禁取消已静默处理；`finally` 会 `resetProgress` 或 `completeProgress` 并 `setPlanningBusyLevel(null)`、清空 `planningAbortRef`。
- **缺的是：没有从 UI 调用 `abort()`。**

## 本次改动

### 1. Hook 暴露「终止」入口

- **文件**：`src/hooks/useTuiyanPlanningActions.ts`
- **内容**：
  - 在返回对象中增加 `cancelPlanningGeneration: () => void`。
  - 实现为 `planningAbortRef.current?.abort()`（与 ref 同闭包，无新状态机）。
- **类型**：`UseTuiyanPlanningActionsResult` 中补充了上述方法说明。

### 2. 页面接线

- **文件**：`src/pages/V0TuiyanPage.tsx`
- **内容**：
  - 从 `useTuiyanPlanningActions` 解构 `cancelPlanningGeneration`；
  - 传给 `unifiedPanelProps`：`onCancelPlanningGeneration: cancelPlanningGeneration`。
- **行数**：约 +2 行，未扩大页面内业务逻辑块。

### 3. 右侧详情统一面板 UI

- **文件**：`src/components/tuiyan/TuiyanPlanningUnifiedPanel.tsx`
- **内容**：
  - Props 增加可选 `onCancelPlanningGeneration?: () => void`（不传时行为与旧版一致，无主「终止」按钮）。
  - 当 `planningBusyLevel !== null` 且提供了 `onCancelPlanningGeneration` 时：
    - 主操作区由**单按钮**改为**双列**：左侧 `flex-1`、文案为原 `primaryAction` 的「生成中」态（`disabled`）；右侧为「终止」`Button variant="outline"`，`onClick` 调 `onCancelPlanningGeneration`。
  - 未在生成时：保持**整行**主按钮（`disabled` / `onClick` 与原先 `primaryAction` 一致）。
  - 将各层主按钮/进度区文案中「生成中...」等统一为 **「生成中」**（与需求表述一致；进度条旁为「某层生成中」）。

## 未改动范围

- `EditorPage.tsx`、`AiPanel.tsx`：**未**修改。
- `TuiyanRightDetailTab.tsx`：仍只 spread `unifiedPanelProps`，**未**改组件签名（新能力通过可选 prop 透传）。

## 验证建议（给复查）

1. 选作品、填构思，点「生成总纲」→ 应出现「生成中」+「终止」；点「终止」后 busy 状态结束，无错误 toast（与 Abort 处理一致）。
2. 在树中依次触发一级大纲、卷纲、章纲、详细细纲、重生卷等 → 同一条「终止」应对应当前这一次 `AbortController`。
3. `npx tsc --noEmit` 通过（提交前已在本地跑过）。

## 相关文件清单


| 文件                                                     | 角色                              |
| ------------------------------------------------------ | ------------------------------- |
| `src/hooks/useTuiyanPlanningActions.ts`                | 暴露 `cancelPlanningGeneration`   |
| `src/pages/V0TuiyanPage.tsx`                           | 接线 `onCancelPlanningGeneration` |
| `src/components/tuiyan/TuiyanPlanningUnifiedPanel.tsx` | 主按钮区「生成中」+「终止」                  |


（底层流与 abort 传播仍以 `tuiyan-planning-generate` / `client` / `providers` 为准。）