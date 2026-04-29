# 生辉 · 仿写工作台自检报告

> 生成日期：2026-04-28
> 范围：生辉页与 `sheng-hui` 组件、[src/ai/sheng-hui-generate.ts](../src/ai/sheng-hui-generate.ts)、[src/util/sheng-hui-deeplink.ts](../src/util/sheng-hui-deeplink.ts)、[src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)、[src/hooks/useTuiyanDeepLink.ts](../src/hooks/useTuiyanDeepLink.ts)、[src/hooks/useShengHuiWorkspacePrefs.ts](../src/hooks/useShengHuiWorkspacePrefs.ts) 等（推演页深链以第四节表为准）
> 关联参考：[src/v0-modules/shenghui-module.tsx](../src/v0-modules/shenghui-module.tsx) (v0 设计稿)、[docs/sheng-hui-improve-plan.md](sheng-hui-improve-plan.md)

> **文档状态（本轮）**：凡已在代码中闭环的需求，用 **删除线** `~~…~~` 标出；未划线的仍视为待办或仅部分缓解。F/W 见第五节。  
> **末次修订**：2026-04-28（三稿）— 二稿基础上增加第二节红框 M1：词元并排 diff、按块写回正文、成稿 AI 复盘；文内行号以仓库为准。

类型检查：`tsc --noEmit -p tsconfig.app.json` 在 `/sheng-hui` 活动路径**无错误**；只有 `src/v0-modules/shenghui-module.tsx` 报告的未使用 import（v0 参考稿，不入产品）。

---

## 一、Bug 与隐患（按严重度排序）

### A. 高 — 数据丢失/错位类

~~1. **跨章节生成的快照错位（race）** — [ShengHuiPage.tsx:806-814](../src/pages/ShengHuiPage.tsx#L806-L814)（行号以当时为准，现逻辑在 `useShengHuiGenerationLifecycle`）~~
  ~~流式生成期间用户切换章节，`runGenerate` 的 `finally` 调用 `appendShengHuiSnapshot(workId, chapterId, …)`，使用的是闭包外**当前**的 `chapterId`（已变）。结果：快照被写到新章节的桶里，但内容是旧章节生成出来的。~~
  ~~建议：在 `runGenerate` 起始时把 `workId/chapterId` snapshot 进局部常量，或者在切章时 `abortRef.current?.abort()`。~~

**已处理（F1）**：`useShengHuiGenerationLifecycle` 内 `runWorkId/runChapterId` + `latestTargetRef` 守卫，切目标时 abort。

1. ~~**手动编辑主稿 / 快照策略**~~
  - ~~**子问题 A**：用户改了主稿、切章再切回，只剩生成时的旧版本（已编辑内容丢失）。~~ **已部分处理（W1）**：`useShengHuiMainDraftPersistence`。
  - ~~**子问题 B/C**：`markSnapshotAdopted` 与脏主稿不同步。~~ **已处理（A.2/A.3）**：`appendAndAdoptShengHuiSnapshot`（`sheng-hui-snapshots.ts`）+ `useShengHuiMarkAdoptedSnapshot` 接收 `currentOutput` / `outlinePreview`；若 `output !== selectedSnapshot.prose`，自动先存新快照再标 adoptedId。
2. ~~**采纳的快照与主稿可能不同步**~~ **已处理（A.2/A.3，同上）**。
3. ~~**写回不进 AiPanel 草稿历史** — [ShengHuiPage.tsx:848-859](../src/pages/ShengHuiPage.tsx#L848-L859) vs [components/AiPanel.tsx:926~~](../src/components/AiPanel.tsx#L926)
  ~~`handleWriteBack` 只 `writeAiPanelDraft`（覆盖当前草稿槽），不调 `pushDraftHistory`。在写作页 AI 侧栏的"草稿历史"里看不到从生辉来的版本，只能看到 chat / outline-body / 推演 推过来的。~~
  ~~建议：写回时同时 `pushDraftHistory(workId, chapterId, output)`。~~

**已处理（F3）**：`writeAiPanelDraftWithHistory`（`ai-panel-draft.ts`）。

1. ~~**生成期间作品/章节切换不取消请求**~~
  ~~`useEffect([workId])` 与 `useEffect([workId, chapterId])` 都不会调用 `abortRef.current?.abort()`。后台流仍在烧 token，并叠加上面的 race。~~
  ~~建议：useEffect cleanup 中统一 abort + 重置 `accRef.current = ""` + `setBusy(false)`。~~

**已处理（F1）**：`useShengHuiGenerationLifecycle` 内 `workId/chapterId` 变化时 cleanup 调用 `abortRef.current?.abort()`。

### B. 中 — 取消/可中断性

1. ~~**风格提炼/场景提取无法取消**~~ **已处理（B.1）**：`useShengHuiRagStyleFeatures` 每个 chunkId 一个 `AbortController`（`stopStyleFeatureExtract`）；`useShengHuiSceneStateExtract` 有 `abortRef` + `stopSceneStateExtract`；`ShengHuiRightMaterialsBlock` 均已接入「停止」按钮。
2. ~~`**runGenerate` 的取消错误判断脆弱** — [ShengHuiPage.tsx:803](../src/pages/ShengHuiPage.tsx#L803)~~
  ~~用 `e.name === "AbortError" || /abort/i.test(e.message)` 判取消。流式 wrapper 抛错文案变更就漏判，会把"用户取消"显示成红色错误。建议封装 `isAbortError(e)` 并集中维护。~~

**已处理（F4）**：`src/util/is-abort-error.ts`；生辉 `useShengHuiGenerationLifecycle`、侧栏 `useAiPanelStreamingRun` / `AiPanel` 已接入。

1. ~~**首关 Gate 取消后清空 output 不优雅** — [ShengHuiPage.tsx:670-672](../src/pages/ShengHuiPage.tsx#L670-L672)~~
  ~~用户在弹出"是否注入云端"时点取消，`setOutput("")` 已经先执行，原有内容丢了。~~
  ~~建议：把 `setOutput("")` 移到 confirm 通过之后（即 `confirmInjectionPrompt` 返回 true 之后才清空）。~~

**已处理（F2）**：`useShengHuiGenerationLifecycle` 在确认通过后再 `setOutput("")` / 清 `accRef`。

### C. 中 — Prompt/上下文边界

1. ~~`**continue` 模式不要求 outline 也不要求 draft** — [ShengHuiPage.tsx:650-661](../src/pages/ShengHuiPage.tsx#L650-L661)~~
  ~~页面层只对 `write/skeleton/dialogue_first` 和 `rewrite/polish` 各自做了校验，`continue` 漏掉。运行后到 `buildShengHuiChatMessages` 才抛错。建议在 UI 层就 disable 生成按钮且给出灰提示。~~
  **已处理**：`ShengHuiRightComposeBlock` 的 `continueNeedsContext`：续写时大纲与主稿皆空则禁用生成并灰提示，与装配层一致。
2. ~~`assertShengHuiPrivacy` 强制 `allowChapterContent~~  `**已处理（C.2 + 第四节）**：`includeBodyContent`为真时才强制；纯大纲/段工具/节拍重生等子流不再因未开`allowChapterContent `被拦（与注释「纯 outline 路径」一致）；`useShengHuiBuildGenerateArgs`与`generateShengHuiProseStream*` 调用点已传参。
3. ~~`detectCharactersInOutline` 是裸子串匹配~~ **已处理（C.3，既有）**：`findOutlineMentionedCharacterNames`（`sheng-hui-outline-character-detect.ts`）已实现长名优先 + 非重叠覆盖 + 忽略单字名。
4. **多窗口写 localStorage 的 last-write-wins**（见 L1 远期，暂不处理）
5. ~~`takeTailByParagraphs("all")` 只走字符数~~ **已处理（C.5）**：`"all"` 改为从末尾累加整段直至超 `maxChars`，截断只在段间。
6. ~~`extractSceneStateFromLatestSnapshot` 解析脆弱~~ **已处理（C.6）**：`parseSceneStateResult`（`useShengHuiSceneStateExtract.ts`）兼容全角冒号（：）/ 半角 / Markdown 粗体标题前缀 / 多别名（地点/场所 等）。

### D. 低 — UX/工程清洁度

1. ~~**错误显示在 Compose tab 内** — [ShengHuiPage.tsx:248-252](../src/pages/ShengHuiPage.tsx#L248-L252)~~
  ~~切到"素材/版本/说明"看不到错误。建议错误吐到主稿栏顶部 inline notice，或顶栏 Sonner toast。~~

**已处理（F6）**：`ShengHuiCenterManuscriptColumn` 主稿区顶部 `generateError` + `AiInlineErrorNotice` + 关闭；仿写区仍保留原条。

1. `**HubAiSettingsHint` 嵌在素材 tab 底部** 新用户找不到。建议放进顶栏右侧（紧贴模型选择器）。
2. ~~**冗余的动态 import** — [ShengHuiPage.tsx:554-555,609-611](../src/pages/ShengHuiPage.tsx#L554-611)~~
  ~~`await import("../ai/client")` / `await import("../ai/storage")` 在两处出现，但这俩模块已被本文件静态 import（`getProviderConfig`、`loadAiSettings` 等）。多余的延迟路径。建议改为静态调用 `generateWithProviderStream`。~~

**已处理（F5）**：`ShengHuiPage` 对 `client`/`storage` 相关调用改为静态 `generateWithProviderStream`、`getProviderConfig`（场景状态提取等）。

1. ~~**高频写 session / 大稿卡顿**~~ **已处理（D.4）**：`useShengHuiOutlineSessionForPage` 写 `sessionStorage` 改为 400ms debounce（`OUTLINE_DEBOUNCE_MS`），effect cleanup 清除定时器。
2. **小屏左栏/右栏**：主稿 + 底栏开 `Sheet` 已做；顶栏抽屉等可再 polish。

---

## 二、作为"专业仿写编辑页"还缺什么

按重要度（★★★ = 最影响仿写质量；★★ = 显著影响效率/手感；★ = 锦上添花）

### 工作流核心

- ~~★★★ **节拍/章节子结构**（历史描述）~~：**已部分落地（W7）**：`skeleton` 产出节拍列表 + `ShengHuiSkeletonBeatsPanel` 单节拍重生；**仍缺**：全局「大纲节点树」与任意节点一键生成（见 L2）。
- ~~★★★ **目标字数 vs 实时字数对比条**（历史描述）~~：**已落地（W4）**：`ShengHuiManuscriptStatusBar` 含主稿字数、目标字数与百分比等（±20% 高亮可再加强）。
- ~~★★★ **段落级再生与定向修改**（历史描述）~~：**已落地（N2）**：`ShengHuiManuscriptParagraphToolbar` + `useShengHuiParagraphToolbarStream`（主稿内 hover 段工具；停止与主栏并账见第四节）。
- ~~★★★ **风格漂移检测**（历史描述）~~：**已部分落地**：`useShengHuiToneDrift` → `ShengHuiToneDriftBar` 与主稿同屏提示；**仍可增强**：生成结束自动跑分、阈值弹窗与「重对锚」一键。
- ~~★★ **A/B 双生成（同时跑两条温度/参数）**（历史描述）~~：**已落地（N3）**：`ShengHuiAbCompareDialog` + `useShengHuiAbCompareStream`。
- ~~★★ **Diff 视图升级~~** **已接（M1）**：`ShengHuiSnapshotDiffPanel` 词元级 LCS + **并排**双栏；过长自动回退 `lineDiffRows` 行内联。见 `sheng-hui-token-diff.ts` + `ShengHuiRightVersionsBlock`。
- ~~★★ **章节正文与最新快照「按块写回」~~** **已接（M1）**：对比选「当前正文（章节内容）」时列出 `mergeShengHuiHunksFromOps` 合并块，单块 **写回** 调 `updateChapter` + `setChapters` 合并，非整段覆盖。见 `applyShengHuiHunks`。
- ~~★★ **AI 自检/复盘~~** **已接（M1）**：`buildShengHuiSelfReviewMessages` + `useShengHuiSelfReview` + `ShengHuiSelfReviewSection`；任务名 `生辉·成稿复盘`，参照笔感卡摘要；锦囊位预留 `bibleHint`（当前可空）。
- ~~★★ **快照标签/收藏**（历史描述）~~：**已落地（W5）**：短名 + ⭐ 收藏（见 `ShengHuiSnapshotListItem` / 版本区文案）。

### 上下文 / 资料

- ~~★★★ **上下文成本可视化（token 树）**（历史描述）~~：**已落地（N5）**：`ShengHuiContextTokenTreePanel` + `useShengHuiContextTokenTree`（素材侧展示块级估算；细粒度可继续 polish）。
- ★★ **风格指纹扩展**（`docs/sheng-hui-improve-plan.md` ~~第 5 项尚未实现~~，~~已随计划第 5 项落地~~）：`sentenceRhythm`、`punctuationStyle`、`dialogueDensity`、`emotionStyle`、`narrativeDistance` 等已由 `workStyleCardToWritingSlice` 等与写作侧笔感卡对齐注入。这是仿写第一道护栏。
- ★★ **历史相邻章衔接**：当前续接末尾只看本章正文。但作者其实想"续接上一章末尾 5 段"。建议续接末尾 selector 增加"上一章末尾"选项。
- ★★ **人物声音锁的"原型示例"**：当前注入"口吻/禁忌"短语；可选地把锦囊里这个人物的"经典台词样例 1-3 条"也注入（如果存在），让模型直接学声音。
- ★ **场景状态卡全章快速预览**：可以把章内每段写完后的 4 字段做时间轴，让作者一眼看出节奏。

### 与其他模块的联动

- ~~★★★ **写作页 → 生辉「单段调用」入口**（历史描述）~~：**已落地（W2）**：`EditorShengHuiFromWritingControls` / `useEditorShengHuiHandoffNavigation` 等。
- ★★ **采纳→写回→合并 一键化**：目前需要：标采纳 → 写回侧栏草稿 → 跳写作页 → 合并到正文。三跳。建议保留现有保守路径，同时增加"直接替换章节正文"按钮（带 confirm）。
- ~~★★ **从藏经直跳生辉的素材锁定**（历史描述）~~：**已落地（W3）**：`ReferenceSearchHitShengHuiRow`「以此段开始仿写」。
- ★ **生辉记录用量到推演侧统计**：推演有 `usageLog`；生辉的 task 名是 `生辉·仿写`/`生辉·笔法提炼`/`生辉·场景状态`，应在创作中心"用量洞察"里专门一行（看是否已经聚合）。

### 引导 / 教学

- ★ **第一次进入的"演示稿"模式**：现在没作品就跳作品库。建议提供 demo 作品+示例 outline+一段已生成稿，用户能"看一遍流程"再进真实创作。
- ★ **快捷指令面板**：v0 设计稿的 quickPrompts 是关键体验。建议主稿区上方加一行 chip：续写段落 / 重写选中 / 扩展细节 / 优化对话 / 收紧 30%。

---

## 三、UI 升级方向（怎么往更高级走）

### 1）布局层

- ~~**顶栏信息密度升级**（首版问题描述）~~ **已部分落地**：
  - ~~面包屑：作品名 › 章节名（点击下拉）~~ **已接**：`ShengHuiWorkspaceTopBar` 导航下拉里切换作品/章节
  - ~~状态徽章 + 粗估/用时~~ **已接**：`ShengHuiTopBarMetricsRow`（生成中、用时、粗估 tokens）
  - ~~用量徽章：今日约 token / 日预算 + 进设置~~ **已接**：同行展示，链至 `/settings`
- ~~**小屏（<lg）抽屉化**（首版问题描述）~~：已用底栏 + `Sheet` 打开左/右；顶栏汉堡等可再迭代。
- ~~**专注模式（F11 / `Cmd+\\`）** 首版「无专注 + 小字」~~ **已落地**：`useShengHuiWorkspacePrefs` 绑定 F11 与 `Cmd+\\` 切换专注 + 主稿栏放大；Tooltip 已标注快捷键。
- ~~**左栏章节项加 `状态点 + 字数`（v0 `wordCurrent/wordTarget`）**~~ **已接**：`ShengHuiLeftChapterRail` 的 `targetWords` + 状态点配色。

### 2）主稿区视觉

- **主稿改富文本（或 Markdown）渲染 + 编辑双模**：**仍缺架构级**；~~已有~~ **阅读/编辑双态**（`ShengHuiManuscriptDualModeBody`）+ 流式时外框动效。建议中「默认渲染段落 / 限宽 38em」可继续合并进阅读态。
- ~~**段落微交互**：hover 段工具栏~~ **已落地（N2）**：`ShengHuiManuscriptParagraphToolbar` + `useShengHuiParagraphToolbarStream`。
- ~~**流式生成**~~ **已部分落地**：`sheng-hui-manuscript-surface--streaming` 外圈动画（逐字「typing」可再加）。
- **主稿底色按情绪温度变化**：~~未接~~ **已部分落地**：`ShengHuiCenterManuscriptColumn` 中 `sheng-hui-paper` 冷暖 class + `paperTint`。

### 3）右栏分区视觉

- ~~**统一卡片节奏**~~ **已部分落地**：`ShengHuiRightPanel` tab 用专用 class；`ShengHuiRightMaterialsBlock` 等套 `sheng-hui-rail-section` 样式示例，**各 section 全面统一可继续铺**。
- **采用渐变玻璃质感**：`ShengHuiRightComposeBlock` 等已有 `sheng-hui-glass-section`；**全右栏**可再对齐一版设计 token。
- ~~**状态色板（oklch）**~~ **已部分落地**：`index.css` 中 `sheng-hui-*-ok` 等工具类 + 左栏状态点；**采纳/生成中**等语义色可再全站对齐 v0。

### 4）控件升级

- ~~**模式选择改 segmented control 或 dropdown 分组**（首版问题）~~ **已落地（W6）**：`ShengHuiComposeModePicker`（`ToggleGroup` + 高级 `DropdownMenu`）。tooltip/ Safari 仍可按需加强。
- ~~**滑动条加刻度小图标**（情绪温度 1-5）~~ **已接**：`ShengHuiEmotionTemperatureRow` 下 1/3/5 雪花/圆点/火焰小标。
- ~~**目标字数加预设按钮**~~ **已落地**：`ShengHuiRightComposeBlock` 中 `PRESET_WORDS` chip + 数字框。
- ~~**"换模型"按钮加 mini 指标**~~ **已接**：`ShengHuiModelTrigger` 增加 `modelDisplayName` + `model` 行，保留原有 metric 行。

### 5）反馈层

- ~~**每次生成后的小总结卡**~~ **已接**：`useShengHuiGenerationCompleteCard` + `ShengHuiGenerationCompleteCard`（约 7.5s 自关、再来一稿）。
- ~~**token 进度环**~~ **已接**：`ShengHuiTokenBudgetRing` 双弧 + 条带（`sheng-hui-token-budget-constants` 为示意上限）。
- **粗估超出阈值预警**：~~首版无~~ **已部分落地**：`highCost` 时按钮强调 + `⚠`（与 v0 二次弹窗可再对齐）。

### 6）色彩 / 排版品质

- **正文主稿采用衬线 + 西文混排**：**已部分落地** — `sheng-hui-latin-mixed`（`ShengHuiManuscriptReadView` / 双模 body 阅读与编辑域）；**中文书宋/完整排版方案**可再收。
- ~~**氛围层做"纸质纹理"**~~：~~可叠 `paper-grain~~ `**已叠**：`ShengHuiAmbientBg`保持 blur 圆 +`public/images/paper-grain.png`；主稿面另叠` ShengHuiManuscriptPaperGrain`。
- ~~**专业仿写台必备：字号阶梯**~~ **已接**：`.sheng-hui-workspace` 内标题 18→16→14→12→11（`sheng-hui-t1`…`sheng-hui-eyebrow`）、正文 16 / 1.85、元信息 `sheng-hui-type-meta`。

---

## 四、关联功能完整性核查


| 关联点                           | 现状                                                                      | 完整度 | 说明                                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **推演 → 生辉**                   | TuiyanTopBar 有"进入生辉"按钮带 deep link                                       | ✅   | [src/components/tuiyan/TuiyanTopBar.tsx](../src/components/tuiyan/TuiyanTopBar.tsx)                                                                            |
| **生辉 → 推演**                   | ~~顶栏 `Link to="/logic"~~ ``buildTuiyanWorkbenchUrl`+`useTuiyanDeepLink` | ✅   | ~~只跳转~~ **已接**：与生辉同 query（`work` / `chapter`），推演页消费后 strip（[useTuiyanDeepLink.ts](../src/hooks/useTuiyanDeepLink.ts)）                                          |
| **生辉 → 写作页（带 AI 侧栏打开）**       | `buildWorkEditorUrl(work, chapterId, true)`                             | ✅   | [src/util/sheng-hui-deeplink.ts:27](../src/util/sheng-hui-deeplink.ts#L27)                                                                                     |
| **生辉 ← 写作页**                  | ~~写作页**没有**进生辉的入口~~ 已有工具栏/选区接 `buildShengHuiUrl` handoff                | ✅   | W2：`EditorShengHuiFromWritingControls` 等                                                                                                                       |
| **生辉 ← 藏经**                   | ~~藏经无入口~~ 搜索命中行「以此段开始仿写」                                                | ✅   | W3：`ReferenceSearchHitShengHuiRow`                                                                                                                             |
| **AI 写作侧栏 ← 生辉写回**            | `writeAiPanelDraftWithHistory` 写槽并推历史                                   | ✅   | ~~原：`pushDraftHistory` 未接~~（F3 已接）                                                                                                                             |
| **GlobalCommandPalette → 生辉** | 已有 `path: "/sheng-hui"`                                                 | ✅   | [src/components/GlobalCommandPalette.tsx:149](../src/components/GlobalCommandPalette.tsx#L149)                                                                 |
| **AppShell 导航**               | 顶部 Tab + 侧栏菜单都有                                                         | ✅   | [src/components/AppShell.tsx:331](../src/components/AppShell.tsx#L331)                                                                                         |
| **DeepLink**                  | `?work=&chapter=` 消费并 strip                                             | ✅   | [src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)                                                                                        |
| **Tuiyan 文策导入**               | 按 chapterId 过滤导入                                                        | ✅   | [ShengHuiPage.tsx:825-846](../src/pages/ShengHuiPage.tsx#L825-L846)                                                                                            |
| **Bible / 风格卡 / 标签注入**        | 完整                                                                      | ✅   | 设定索引、章节锦囊、风格卡、标签 profile 都接                                                                                                                                    |
| **RAG 藏经**                    | 完整，含笔法提炼                                                                | ✅   | 提炼按钮、自动勾选、合并上限均有                                                                                                                                               |
| **隐私 Gate**                   | ~~严格~~ 已按 C.2 + 第四节放宽                                                   | ✅   | ~~过严~~ **已处理**：`includeBodyContent` 为真才强制 `allowChapterContent`；子流/纯大纲不再误拦（见 [sheng-hui-generate.ts](../src/ai/sheng-hui-generate.ts) `assertShengHuiPrivacy`） |
| **粗估 + 注入确认**                 | 已接 `confirmInjectionPrompt`                                             | ✅   | 显示输入/输出/合计 token                                                                                                                                               |
| **本地 Provider**               | 已接 `isLocalAiProvider`                                                  | ✅   | 跳过隐私校验、跳过 metadata 限制                                                                                                                                          |
| **用量计入**                      | `addTodayApproxTokens(rough.totalApprox)`                               | ✅   | 与首页用量洞察打通                                                                                                                                                      |
| **流式取消**                      | ~~仅主 runGenerate~~ 主 + 子流并账                                             | ✅   | **主生成** `stop`；**段工具/节拍** `stopParagraphToolbarStream` + `stopSkeletonBeatRegen` 与右栏「停止」合并（`stopAllShengHuiStreams`）；**提炼/场景** 见 B.1（#6）                       |


**结论**：单向链路（推演→生辉→写作）通。~~「写作/藏经进生辉无入口」~~ 已通过 **W2 / W3** 接上（见上表 **生辉 ← 写作/藏经**）。~~「生辉写回仅覆盖槽、草稿历史无生辉版」~~ 已在 **F3** 中改为 `writeAiPanelDraftWithHistory`（`liubai:aiDraftHistory` 最近 5 条）。~~「生辉 → 推演无 deep link」~~ 已在 **第四节** 用 `buildTuiyanWorkbenchUrl` + `useTuiyanDeepLink` 闭环。~~「隐私过严 / 子流不可停」~~ 已随 **C.2 + 第四节** 与 **stopAllShengHuiStreams** 更新上表。

---

## 五、推荐执行计划（按 ROI）

### 立刻修（< 0.5 天，纯 bug）

已落地项以下划线/删除线标出（代码侧已合并）。

- ~~**F1**：生成中切作品/章节自动 abort + 局部捕获 ids 防快照错位（#1、#5）~~
- ~~**F2**：confirm 取消时不要清空 output（#8）~~
- ~~**F3**：写回侧栏同时 `pushDraftHistory`（#4）~~
- ~~**F4**：用 `isAbortError` 工具函数集中判取消（#7）~~
- ~~**F5**：去掉冗余 dynamic import，统一调用静态 client（#17）~~
- ~~**F6**：错误以 toast / 主稿顶部 inline 显示，不只塞在 compose tab（#15）~~

### 本周做（1-2 天，体验拐点）

已落地项以下划线/删除线标出。

- ~~**W1**：主稿自动草稿（localStorage）+ 切章不丢手改内容（#2）~~
- ~~**W2**：写作页编辑器右键 / 工具栏加"调用生辉重写本段"入口（关联 #4 的反向链路）~~
- ~~**W3**：藏经搜索结果加"以此段开始仿写 →"按钮（关联 #4 的反向链路）~~
- ~~**W4**：错误 + 进度 + 字数 + token 用量在主稿顶部统一为 status bar（#15、#23、目标字数对比）~~
- ~~**W5**：快照加 8 字短名 + ⭐ 收藏（仿写台缺的"挑稿子"能力）~~
- ~~**W6**：模式选择改 segmented control + 高级模式 dropdown（UI #4）~~
- ~~**W7**：节拍/段落级再生 — 至少接通 `skeleton` 节拍解析为节点 + 单节点重生~~

### 下个迭代（3-5 天，专业感升级）

- **N1**：~~主稿改"渲染 + 阅读/编辑"双态 + 段间距/限宽~~ **已部分落地**（`ShengHuiManuscriptDualModeBody` / 阅读视宽）；**仍待**：富文本或 Markdown 真双模、与「正式书页」级段落样式完全对齐（见第三节 §2）。
- ~~**N2**：段落 hover 工具栏（重写 / 扩展 / 收紧 / 风格扫描）~~
- ~~**N3**：A/B 双生成（同 prompt 异参数对比）~~
- **N4**：~~同屏调性条~~ **已部分落地**（`ShengHuiToneDriftBar`）；**仍待**：生成结束自动跑分、超阈值弹窗与「重对锚」。
- ~~**N5**：上下文 token 树（每个 block 占多少，提示是否被截断）~~
- ~~**N6**：风格指纹扩展（improve-plan 第 5 项）~~ **已随计划/笔感卡接入**（`workStyleCardToWritingSlice` 等；见第二节「风格指纹」行）。
- ~~**N7**：人物声音锁注入"经典台词示例"~~（锦囊字段 + `sheng-hui-voice-lock` / `sheng-hui-generate` 已接）
- ~~**N8**：专注模式 + 主稿纸感/冷暖 + 仿写台字号阶梯 + 氛围/主稿 `paper-grain` 叠层~~ **已落地**：根容器 `sheng-hui-workspace`（`SHENG_HUI_WORKSPACE_ROOT_CLASS`）、`index.css` 阶梯与 `sheng-hui-eyebrow` / `sheng-hui-t*`、`ShengHuiAmbientBg` 与 `ShengHuiManuscriptPaperGrain` / `public/images/paper-grain.png`；**F11 / `Cmd+\\`** 见 `useShengHuiWorkspacePrefs`。

### 远期（重构方向，> 1 周）

- **L1**：快照存储从 localStorage JSON 迁到 IndexedDB（容量、并发、性能）
- **L2**：node-aware outline（解析为节点列表 + 每节状态/字数 + 按节生成）
- **L3**：词/句级 side-by-side diff + hunk 级"接受/拒绝"
- **L4**：模式扩展：`segment` 接力 + 自动场景状态卡更新（每段生成完自动从输出末尾 4-8 字段提取写回 sceneState）

---

## 六、关键文件索引


| 文件                                                                                                                            | 行数   | 责任                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| [src/pages/ShengHuiPage.tsx](../src/pages/ShengHuiPage.tsx)                                                                   | ~862 | 总编排；段工具流/停止并账、数据/装配等已拆到 `useShengHuiPageDataEffects`、`useShengHuiBuildGenerateArgs` 等 |
| [src/v0-modules/shenghui-module.tsx](../src/v0-modules/shenghui-module.tsx)                                                   | 976  | v0 设计稿（mock，含成本/quickPrompts/chat）                                                    |
| [src/components/sheng-hui/ShengHuiCenterManuscriptColumn.tsx](../src/components/sheng-hui/ShengHuiCenterManuscriptColumn.tsx) | ~254 | 主稿区：状态条、完成卡、调性条、双模主稿、段工具 UI 入口                                                        |
| [src/components/sheng-hui/ShengHuiWorkspaceTopBar.tsx](../src/components/sheng-hui/ShengHuiWorkspaceTopBar.tsx)               | —    | 顶栏面包屑、写作/推演深链、第二行 `ShengHuiTopBarMetricsRow`                                          |
| [src/components/sheng-hui/ShengHuiRightComposeBlock.tsx](../src/components/sheng-hui/ShengHuiRightComposeBlock.tsx)           | 255  | 模式 / 参数 / 大纲 / 生成与停止（`stopAllShengHuiStreams`）                                        |
| [src/components/sheng-hui/ShengHuiRightMaterialsBlock.tsx](../src/components/sheng-hui/ShengHuiRightMaterialsBlock.tsx)       | 313+ | RAG / 场景卡 / 声音锁 / token 树 / 提炼停止                                                      |
| [src/components/sheng-hui/ShengHuiRightVersionsBlock.tsx](../src/components/sheng-hui/ShengHuiRightVersionsBlock.tsx)         | 155  | 快照列表 + diff                                                                           |
| [src/components/sheng-hui/ShengHuiLeftChapterRail.tsx](../src/components/sheng-hui/ShengHuiLeftChapterRail.tsx)               | 127+ | 作品/章节、目标字数比（`wordCurrent/wordTarget` 式）、状态点                                           |
| [src/ai/sheng-hui-generate.ts](../src/ai/sheng-hui-generate.ts)                                                               | ~701 | Prompt 装配 + 流式 + `assertShengHuiPrivacy`                                              |
| [src/util/sheng-hui-snapshots.ts](../src/util/sheng-hui-snapshots.ts)                                                         | 159+ | localStorage 快照                                                                       |
| [src/util/sheng-hui-deeplink.ts](../src/util/sheng-hui-deeplink.ts)                                                           | —    | `buildShengHuiUrl`、写作进页、`buildTuiyanWorkbenchUrl`（生辉→推演）、`SHENG_HUI_Q`                |
| [src/hooks/useShengHuiWorkspacePrefs.ts](../src/hooks/useShengHuiWorkspacePrefs.ts)                                           | 54+  | 左栏 / 引导 / 专注 F11+`Cmd+\\`                                                             |
| [src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)                                                       | 74   | 生辉 `?work=&chapter=` 消费并 strip                                                        |
| [src/hooks/useTuiyanDeepLink.ts](../src/hooks/useTuiyanDeepLink.ts)                                                           | ~105 | 推演 `/logic?work=&chapter=` 消费并 strip                                                  |
| [src/hooks/useShengHuiParagraphToolbarStream.ts](../src/hooks/useShengHuiParagraphToolbarStream.ts)                           | —    | 段级流式 + `stopParagraphToolbarStream`（与主停止并账）                                           |
| [src/util/sheng-hui-token-diff.ts](../src/util/sheng-hui-token-diff.ts)                                                       | —    | 词元 LCS、并排行、`applyShengHuiHunks` 按块写回                                                  |
| [src/ai/sheng-hui-self-review.ts](../src/ai/sheng-hui-self-review.ts)                                                         | —    | 成稿复盘 system/user 消息                                                                   |
| [src/hooks/useShengHuiSelfReview.ts](../src/hooks/useShengHuiSelfReview.ts)                                                   | —    | 复盘一次生成 + 错误态                                                                          |
| [src/components/sheng-hui/ShengHuiSnapshotDiffPanel.tsx](../src/components/sheng-hui/ShengHuiSnapshotDiffPanel.tsx)           | —    | 词元/行级切换、并排区、hunk 写回列表                                                                 |
| [src/components/sheng-hui/ShengHuiSelfReviewSection.tsx](../src/components/sheng-hui/ShengHuiSelfReviewSection.tsx)           | —    | 复盘按钮与 Markdown 文本区                                                                    |
| [docs/sheng-hui-improve-plan.md](sheng-hui-improve-plan.md)                                                                   | 207  | ~~2026-04-18 升级计划（多数已落地）~~ 第 1–8 项已划掉归档                                               |
