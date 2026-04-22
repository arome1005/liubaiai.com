# 右栏「AI」与「设定」拆分 — 落地规划

> 目标：把**作品级 / 长期偏好**放进第三个 Tab「设定」，让「AI」Tab 聚焦**本次生成**（模式、材料、预览、草稿），降低一屏信息密度，并与先前讨论的星月式体验对齐。

---

## 1. 原则（拍板用）


| 维度   | 放「AI」Tab         | 放「设定」Tab                                  |
| ---- | ---------------- | ----------------------------------------- |
| 时间尺度 | 本次会话、点「生成」前必看/常改 | 跨章节、跨会话默认策略                               |
| 用户心智 | 「我现在要写 / 要生成什么」  | 「这本书的写作与 AI 规则是什么」                        |
| 数据归属 | 可与章节或单次请求绑定      | 作品级 `work`、锦囊、或 `liubai:aiSettings` 类全局偏好 |


**硬约束**：迁移时**不改变**现有请求拼装语义（`assemble-context` / `run` 入参），只改 UI 挂载点与可选的「默认值来源」。

---

## 2. 现状快照（代码锚点）


| 区域       | 位置                                                           | 说明                                                                                         |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| AI 主面板   | `src/components/AiPanel.tsx`                                 | 含模型行、本次材料、运行模式、`details`：写作变量、风格卡、RAG、上下文注入、注入预览、额外要求、草稿区等                                 |
| 设定 Tab   | `WritingSettingsRightPanel`（内含锦囊预览 + 风格/写作变量）                | 见阶段 1～2                                                                                    |
| 右栏挂载     | `src/pages/EditorPage.tsx`                                   | `setTabContent("ai", <AiPanel …>)`、`setTabContent("bible", <WritingSettingsRightPanel …>)` |
| 全书风格     | `AiPanel` props `workStyle` + `onUpdateWorkStyle`            | 与 `upsertWorkStyleCard` 等 DB 同步（见 EditorPage 传入的 patch）                                    |
| 全局 AI 偏好 | `src/ai/storage.ts` → `loadAiSettings` / `liubai:aiSettings` | provider、隐私位、温度、注入阈值等                                                                      |


---

## 3. 目标信息架构（落地后）

### 3.1 「AI」Tab（瘦身后）

建议**保留**在 AI 面板顶部到底部主路径上的内容：

1. **AI模型**一行 + 选择模型 `Dialog`（保持可点选）。
2. **本次使用材料（简版）**（只读摘要）。
3. **运行模式**（续写 / 改写 / 大纲 / 抽卡等）。
4. **上下文注入 · 本次**（若采用「默认在设定」）：此处仅展示**与默认的差异**或「使用设定默认」+ 展开微调（可选二期）。
5. **本次注入预览**（发送前必看，与生成强绑定）。
6. **额外要求（可空）** + **生成 / 取消 / 重试**。
7. **AI 草稿**区及插入操作。

可选：**一行摘要**指向设定——例如「风格卡：已配置 · 去设定修改」链接，`setActiveTab("bible")`。

### 3.2 「设定」Tab（扩展后）

在现有「锦囊预览」之上，按块增加（顺序建议由上到下）：

1. **顶部操作区（保留）**
  - 「打开锦囊页」、加载/刷新预览（现有 `BibleRightPanel` 行为不变）。
2. **全书风格卡 / 调性锁**（从 `AiPanel` 迁入）
  - 与当前 `details`「风格卡 / 调性锁（全书级）」字段一致，仍通过 `onUpdateWorkStyle` 写回（由父组件注入 props，与现在一致）。
3. **写作变量 · 默认**（从 `AiPanel` 迁入，需定数据策略）
  - 故事背景、角色、角色关系、技巧预设等：  
  - **方案 A（推荐）**：作品级持久化（新表或 `work` JSON 字段 / localStorage 键 `liubai:workAiVars:${workId}`），AI Tab 打开时预填并可「恢复默认」。  
  - **方案 B（最小改动）**：仍为组件内 state，设定 Tab 与 AI Tab **共享同一状态容器**（提升到 `EditorPage` 或 `React context`），两处编辑同一引用。
4. **检索增强（RAG）默认**（从 `AiPanel` 迁入）
  - `ragEnabled`、`ragWorkSources` 等：若希望「本书统一默认」，与 `loadAiSettings` 或 per-work 存储合并（见阶段二）。
5. **上下文注入 · 默认勾选**（从 `AiPanel` 迁入）
  - 与 `AiSettings.privacy` / 面板内复选框对齐；设定页改默认，AI 页仅显示「本次覆盖」（二期可做）。
6. **锦囊预览区（保留在下方或折叠）**
  - 保持长文预览可滚动，避免挤占上方表单；可用 `details` 或 Tab 子分段：「写作偏好」|「锦囊预览」。

---



### ~~阶段 0 — 准备（0.5～1 天）~~ ✅

- ~~在 `AiPanel.tsx` 中为每个大块加稳定 `**data-section` 或拆子组件**（纯剪切移动，不改逻辑）：~~  
~~`AiPanelStyleCardSection`、`AiPanelWritingVarsSection`、`AiPanelRagSection`、`AiPanelInjectSection`（先同文件或 `src/components/ai-panel/` 目录）。~~
- ~~确认 `EditorPage` 传入 `AiPanel` 的 props 已包含迁移到设定所需的全部回调（`onUpdateWorkStyle` 已有）。~~

~~**验收**：构建通过；AI 行为与拆分前一致（快照或手测一次续写）。~~

---

### ~~阶段 1 — 「设定」Tab 容器与导航（1～2 天）~~ ✅

- ~~新增 `**WritingSettingsRightPanel`**（建议路径：`src/components/WritingSettingsRightPanel.tsx`），或扩展 `BibleRightPanel` 并改名为 `SettingsRightPanel`（二选一，优先新组件以免单文件过大）。~~
- ~~面板内结构：`rr-panel` + 分段标题（与现有 `rr-block` / `rr-block-title` 一致）。~~
- ~~`EditorPage`：`setTabContent("bible", <WritingSettingsRightPanel … />)`，传入与 `AiPanel` 相同的 `workId`、`workStyle`、`onUpdateWorkStyle`、以及后续阶段迁入的 state/setter。~~
- ~~在 AI 面板增加 **「去设定编辑」** 与本书默认摘要：`rightRail.setActiveTab("bible"); rightRail.setOpen(true)`。~~

~~**验收**：设定 Tab 可见新分段占位；锦囊预览仍可滚动；无运行时错误。~~

---

### ~~阶段 2 — 迁入「风格卡」与「写作变量」（2～3 天）~~ ✅

- ~~将 `AiPanel` 中「风格卡 / 调性锁」整块 **剪切**至 `WritingSettingsRightPanel`，props 透传。~~
- ~~将「写作变量」整块迁入；**状态提升**：在 `EditorPage` 用 `useState` 管理 `storyBackground`、`characters`、`relations`、`skillPreset`、`skillText`，通过 props 同时传给 `AiPanel` 与 `WritingSettingsRightPanel`（或仅传给父级再下发）。~~  
  - ~~本地持久化：`useEffect` 防抖写入 `liubai:workAiWritingVars:${workId}`（见 `src/util/work-ai-vars-storage.ts`）。~~
- ~~`AiPanel` 内删除对应表单，保留 **只读摘要**（写作变量 / 风格卡是否已填写）+「去设定编辑」。~~

~~**验收**：风格与写作变量仅在设定编辑时，生成请求仍带上相同字段（网络面板或 log 对比）。~~

---

### ~~阶段 3 — 迁入「RAG」与「上下文注入」默认（2～4 天）~~ ✅

- ~~梳理 `ragEnabled`、`ragWorkSources`、注入相关 state 与 `loadAiSettings()` / `privacy` 的关系（读 `AiPanel` 后半与 `assemble-context.ts`）。~~
- ~~**默认**写入策略（择一）：~~ 已采用 **per-work `localStorage`**：`liubai:workAiRagInjectDefaults:v1:${workId}`（`src/util/work-ai-rag-inject-defaults-storage.ts`）；首次无键时尝试从旧全局 `liubai:ragWorkSources:v1` 迁移 `ragWorkSources`。
- ~~AI Tab 保留：**本次**临时覆盖 UI（若产品要）或仅展示「与默认一致」。~~ AI Tab：`ragQuery` / 预览 / 命中仍为本次会话；`AiPanelRagSection` 使用 `variant="sessionOnly"`；`注入本书锦囊` 仍在 AI Tab（`AiSettings`），其余注入默认在「设定」`AiPanelInjectDefaultsSection`。

~~**验收**：关开作品、刷新页面后默认选项保持；云端请求正文与迁移前一致。~~

---

### ~~阶段 4 — 体验与密度（1～2 天）~~ ✅

- ~~设定 Tab 内：**分段折叠**、首屏只展开「风格卡」或「写作变量」其一（可记 `localStorage`）。~~
- ~~AI Tab：**运行模式**与「本次材料」上移，缩短首屏路径。~~
- ~~文案：统一「全书级」「本书默认」「本次生成」用语。~~
- ~~无障碍：`aria-labelledby`、折叠 `summary` 可聚焦。~~

---

## 5. 风险与对策


| 风险                    | 对策                                                        |
| --------------------- | --------------------------------------------------------- |
| 状态提升后 `AiPanel` 重渲染变慢 | `memo` 子面板；`useCallback` 稳定 handler；大段设定懒加载 `React.lazy`。 |
| 两处可编辑同一字段导致冲突         | 单一数据源（EditorPage state）；设定与 AI 只读其一或明确「本次覆盖」仅 AI。         |
| 与全局「设置」页 AI 配置重复      | 文档标明：全局 = API/Key/隐私；右栏设定 = **本书写作与注入偏好**；必要时从设置页链到本书。    |


---

## 6. 验收清单（整体验收）

- 未登录/无作品时右栏行为与现网一致。
- 切换章节后，本书级设定不丢失；本章独有项（若有）逻辑正确。
- 续写 / 抽卡 / 注入预览 token 粗估与迁移前同量级（抽样 2～3 章）。
- 窄屏右栏抽屉：设定 Tab 可滚动、顶栏 Tab 不挤出视口（已有 `app-right` 布局）。

---

## 7. 建议排期（参考）


| 阶段           | 工作量    | 依赖                       |
| ------------ | ------ | ------------------------ |
| 0 组件边界       | 0.5～1d | 无                        |
| 1 设定容器       | 1～2d   | 0                        |
| 2 风格 + 写作变量  | 2～3d   | 1                        |
| 3 RAG + 注入默认 | 2～4d   | 2，需联调 `assemble-context` |
| 4 polish     | 1～2d   | 3                        |


**合计约 7～12 人日**（视 per-work 存储是否已存在而定）。

---

## 8. 开放问题（需产品确认）

1. **写作变量**是「本书一份」还是「每章一份」？若每章，数据结构要按 `chapterId` 分键。
2. **模型选择**是否完全迁出 AI（仅保留快捷入口）？默认建议：**保留在 AI 首行**，完整 API 配置仍在全局设置。
3. 设定 Tab 名称是否从「设定」改为「本书设定」或「写作设定」，避免与左侧「本章圣经」混淆（左侧已是章级约束）。

---

*文档版本：2026-04-17 · 与当前 `main` 代码结构对应；实施时以仓库为准微调路径与组件名。*