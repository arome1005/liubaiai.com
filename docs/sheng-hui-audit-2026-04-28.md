# 生辉 · 仿写工作台自检报告

> 生成日期：2026-04-28
> 范围：[src/pages/ShengHuiPage.tsx](../src/pages/ShengHuiPage.tsx)、[src/components/sheng-hui/](../src/components/sheng-hui/)、[src/ai/sheng-hui-generate.ts](../src/ai/sheng-hui-generate.ts)、[src/util/sheng-hui-snapshots.ts](../src/util/sheng-hui-snapshots.ts)、[src/util/sheng-hui-deeplink.ts](../src/util/sheng-hui-deeplink.ts)、[src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)、[src/hooks/useShengHuiWorkspacePrefs.ts](../src/hooks/useShengHuiWorkspacePrefs.ts)
> 关联参考：[src/v0-modules/shenghui-module.tsx](../src/v0-modules/shenghui-module.tsx) (v0 设计稿)、[docs/sheng-hui-improve-plan.md](sheng-hui-improve-plan.md)

类型检查：`tsc --noEmit -p tsconfig.app.json` 在 `/sheng-hui` 活动路径**无错误**；只有 `src/v0-modules/shenghui-module.tsx` 报告的未使用 import（v0 参考稿，不入产品）。

---

## 一、Bug 与隐患（按严重度排序）

### A. 高 — 数据丢失/错位类

1. **跨章节生成的快照错位（race）** — [ShengHuiPage.tsx:806-814](../src/pages/ShengHuiPage.tsx#L806-L814)
  流式生成期间用户切换章节，`runGenerate` 的 `finally` 调用 `appendShengHuiSnapshot(workId, chapterId, …)`，使用的是闭包外**当前**的 `chapterId`（已变）。结果：快照被写到新章节的桶里，但内容是旧章节生成出来的。
   建议：在 `runGenerate` 起始时把 `workId/chapterId` snapshot 进局部常量，或者在切章时 `abortRef.current?.abort()`。
2. **手动编辑主稿不会进快照** — [ShengHuiPage.tsx:992-993](../src/pages/ShengHuiPage.tsx#L992-L993)
  `setOutput` 的 onChange 直接改内存 state；`appendShengHuiSnapshot` 只在生成 `finally` 调一次。用户改了 200 字、切章再切回，只剩生成时的旧版本 — 已编辑内容丢失。
   建议：(a) 主稿 textarea 需要 sessionStorage 自动草稿 + `onBlur` 增量快照；或 (b) 主稿一旦"脏"，要求用户显式"保存为新快照"。
3. **采纳的快照与主稿可能不同步**
  `markSnapshotAdopted` 只把 `adoptedId` 标到一条**原始** prose 上。若用户已经在 textarea 里手改过，"采纳"的不是用户看到的内容。建议在标记前，用 textarea 现值另起新快照，或者禁止已脏的主稿打"采纳"。
4. **写回不进 AiPanel 草稿历史** — [ShengHuiPage.tsx:848-859](../src/pages/ShengHuiPage.tsx#L848-L859) vs [components/AiPanel.tsx:926](../src/components/AiPanel.tsx#L926)
  `handleWriteBack` 只 `writeAiPanelDraft`（覆盖当前草稿槽），不调 `pushDraftHistory`。在写作页 AI 侧栏的"草稿历史"里看不到从生辉来的版本，只能看到 chat / outline-body / 推演 推过来的。
   建议：写回时同时 `pushDraftHistory(workId, chapterId, output)`。
5. **生成期间作品/章节切换不取消请求**
  `useEffect([workId])` 与 `useEffect([workId, chapterId])` 都不会调用 `abortRef.current?.abort()`。后台流仍在烧 token，并叠加上面的 race。
   建议：useEffect cleanup 中统一 abort + 重置 `accRef.current = ""` + `setBusy(false)`。

### B. 中 — 取消/可中断性

1. **风格提炼/场景提取无法取消** — [ShengHuiPage.tsx:568](../src/pages/ShengHuiPage.tsx#L568)、[ShengHuiPage.tsx:619](../src/pages/ShengHuiPage.tsx#L619)
  `extractStyleFeature` 与 `extractSceneStateFromLatestSnapshot` 都传 `signal: undefined`，且没有"停止"按钮。卡住要等超时。
   建议：复用 `abortRef`（或新增 ref），在按钮态切换为"停止"。
2. `**runGenerate` 的取消错误判断脆弱** — [ShengHuiPage.tsx:803](../src/pages/ShengHuiPage.tsx#L803)
  用 `e.name === "AbortError" || /abort/i.test(e.message)` 判取消。流式 wrapper 抛错文案变更就漏判，会把"用户取消"显示成红色错误。建议封装 `isAbortError(e)` 并集中维护。
3. **首关 Gate 取消后清空 output 不优雅** — [ShengHuiPage.tsx:670-672](../src/pages/ShengHuiPage.tsx#L670-L672)
  用户在弹出"是否注入云端"时点取消，`setOutput("")` 已经先执行，原有内容丢了。
   建议：把 `setOutput("")` 移到 confirm 通过之后（即 `confirmInjectionPrompt` 返回 true 之后才清空）。

### C. 中 — Prompt/上下文边界

1. `**continue` 模式不要求 outline 也不要求 draft** — [ShengHuiPage.tsx:650-661](../src/pages/ShengHuiPage.tsx#L650-L661)
  页面层只对 `write/skeleton/dialogue_first` 和 `rewrite/polish` 各自做了校验，`continue` 漏掉。运行后到 `buildShengHuiChatMessages` 才抛错。建议在 UI 层就 disable 生成按钮且给出灰提示。
2. `**assertShengHuiPrivacy` 强制 `allowChapterContent`** — [sheng-hui-generate.ts:156-159](../src/ai/sheng-hui-generate.ts#L156-L159)
  用户即便只贴大纲、不贴正文、也不贴章节概要、不带末尾续接、不带场景状态，仍会被拒。"大纲与文策"算不算"章节正文"？语义上有歧义。
    建议：拆细 — `outlineAndStrategy` 走 `allowChapterContent`，但实际正文末尾续接、章节概要、场景状态卡用 `allowRecentSummaries` 控制；当两者均关时也可放行只带大纲。
3. `**detectCharactersInOutline` 是裸子串匹配** — [sheng-hui-generate.ts:30-41](../src/ai/sheng-hui-generate.ts#L30-L41)
  人物名"李"会撞上"李子"，"小白"撞"小白脸"。
    建议：左右加非 CJK-name 边界 / 排除已被另一更长人物名包含的命中 / 至少匹配两字以上人物名。
4. **多窗口写 localStorage 的 last-write-wins**
  `liubai:shengHuiSnapshots:v1` 是单一 JSON。两个 tab 同时生成会丢一边。建议给桶加 schema-version + 改为 IndexedDB（或采用 BroadcastChannel 同步）。
5. `**takeTailByParagraphs("all", maxChars)` 只走字符数** — [sheng-hui-generate.ts:62-75](../src/ai/sheng-hui-generate.ts#L62-L75)
  "all" 时直接 `takeTailText(t, maxChars)`，与 1/3/5 段不一致 — 用户选"全部末尾"时其实是按字符截，可能截在段中。建议先按段切再按字符兜底，并在 UI 提示截断。
6. `**extractSceneStateFromLatestSnapshot` 解析脆弱**
  严格按 "场所："/"时间："/… 前缀。模型多输出空格、用全角冒号、或加 markdown 头都会失败，吞错并 toast。建议改用 JSON-mode（或 prompt 让模型输出 json 块）+ 容错解析。

### D. 低 — UX/工程清洁度

1. **错误显示在 Compose tab 内** — [ShengHuiPage.tsx:248-252](../src/pages/ShengHuiPage.tsx#L248-L252)
  切到"素材/版本/说明"看不到错误。建议错误吐到主稿栏顶部 inline notice，或顶栏 Sonner toast。
2. `**HubAiSettingsHint` 嵌在素材 tab 底部**
  新用户找不到。建议放进顶栏右侧（紧贴模型选择器）。
3. **冗余的动态 import** — [ShengHuiPage.tsx:554-555,609-611](../src/pages/ShengHuiPage.tsx#L554-L611)
  `await import("../ai/client")` / `await import("../ai/storage")` 在两处出现，但这俩模块已被本文件静态 import（`getProviderConfig`、`loadAiSettings` 等）。多余的延迟路径。建议改为静态调用 `generateWithProviderStream`。
4. `**onChange` 与 `setOutline`/`setOutput` 的高频写 sessionStorage**
  每次按键都写一次 — 大稿子卡顿可见。建议 debounce 300-500ms。
5. **左侧目录在小屏（<lg）排序为 order-2**
  导致在手机上"中部主稿在最上、章节目录跑到第二屏"。建议小屏改成顶栏 popover 选章。
6. `**sessionStorage` 用错语义**
  场景状态卡、outline、AiPanel 草稿都在 sessionStorage — 关浏览器即丢。生辉的"工作未完成态"应当跨 tab 跨重启可恢复。建议迁到 localStorage 或 IndexedDB。
7. **"快照采纳"语义不强**
  采纳标记仅 UX 层；用户期望"采纳 = 写回正文 = 之后续写以此为准"。当前需要再点"写回侧栏草稿"再去写作页合并。三步。建议合并为一键。
8. `**setError(null)` 在切作品时执行，但切章不清** — [ShengHuiPage.tsx:976-979](../src/pages/ShengHuiPage.tsx#L976-L979)
  切作品清错误，切章不清。一致性差。
9. **生成按钮文案冗长** — [ShengHuiRightComposeBlock.tsx:228-232](../src/components/sheng-hui/ShengHuiRightComposeBlock.tsx#L228-L232)
  "第一步：生成对话骨架" 在窄屏会换行。建议短化为"生成骨架/展开正文"。
10. **粗估 token 信息没有人民币换算**
  v0 设计稿(`shenghui-module.tsx`) 给的是 `tokens · ¥0.0089`。当前只显示 token，对成本无感。

---

## 二、作为"专业仿写编辑页"还缺什么

按重要度（★★★ = 最影响仿写质量；★★ = 显著影响效率/手感；★ = 锦上添花）

### 工作流核心

- ★★★ **节拍/章节子结构**（v0 mock 有"细纲节点 + 进度条"）：现在大纲是一坨 textarea，无法按"开篇/转折/结尾"分块跑；做不到"只重新展开第 3 个节拍"。建议：把 `outline` 解析为节点列表（数字编号、子弹号自动识别），点单个节点可"只生成此节"。可与 `skeleton` 模式打通——第一步产出的节拍即为节点。
- ★★★ **目标字数 vs 实时字数对比条**：当前只显示 `xxx 字`。仿写台应有"目标 1500 / 已生成 1280（85%）"进度条，超/欠 ±20% 高亮。
- ★★★ **段落级再生与定向修改**：用户应能选中主稿的一段，点"重写此段"/"扩展细节"/"压缩 50%"/"改对话密度"。当前只能整稿重写或润色。可参考 v0 的 quickPrompts (续写段落 / 重写选中 / 扩展细节 / 优化对话)。
- ★★★ **风格漂移检测**：写作页有 `useAiPanelToneDrift`（语气漂移检查），生辉没接。专业仿写最关键的就是"是否仍像作者本人在写"。建议生成完成后自动跑一次漂移评分（与 styleAnchor 对比），>阈值时弹提示并提供"重对锚"按钮。
- ★★ **A/B 双生成（同时跑两条温度/参数）**：仿写编辑常用"同 prompt 不同温度对照取优"。当前只能串行生成两次。
- ★★ **Diff 视图升级**：现在的 `lineDiffRows` 是行级；专业写作需要词/句级 diff，且能并排（side-by-side）显示，方便挑细节。
- ★★ **章节正文与最新快照之间的"应用差异"按钮**：用户看到 diff 后应能"按 hunk 接受/拒绝"，而不是整段覆盖。
- ★★ **AI 自检/复盘**：生成后一键"AI 检查这段是否有：语气漂移 / 设定矛盾 / 名字写错 / 套话堆叠 / 节奏拖沓"。可复用锦囊与 styleAnchor 做参照。
- ★★ **快照标签/收藏**：当前快照只有时间，没有名字、tag、备注。版本多了无法找。建议每条快照可加一个 8 字短名 + ⭐ 收藏标记。

### 上下文 / 资料

- ★★★ **上下文成本可视化（token 树）**：v0 设计稿里每条上下文项都标 token 数；当前页只在生成完后才显示总粗估，且不区分各 block 占多少。建议素材 tab 顶部展示当前已勾选的各 block 估算 token 条形图。
- ★★ **风格指纹扩展**（`docs/sheng-hui-improve-plan.md` ~~第 5 项尚未实现~~，~~已随计划第 5 项落地~~）：`sentenceRhythm`、`punctuationStyle`、`dialogueDensity`、`emotionStyle`、`narrativeDistance` 等已由 `workStyleCardToWritingSlice` 等与写作侧笔感卡对齐注入。这是仿写第一道护栏。
- ★★ **历史相邻章衔接**：当前续接末尾只看本章正文。但作者其实想"续接上一章末尾 5 段"。建议续接末尾 selector 增加"上一章末尾"选项。
- ★★ **人物声音锁的"原型示例"**：当前注入"口吻/禁忌"短语；可选地把锦囊里这个人物的"经典台词样例 1-3 条"也注入（如果存在），让模型直接学声音。
- ★ **场景状态卡全章快速预览**：可以把章内每段写完后的 4 字段做时间轴，让作者一眼看出节奏。

### 与其他模块的联动

- ★★★ **写作页 → 生辉「单段调用」入口**：当前推演有按钮跳生辉。但写作页编辑器里，用户选中一段想"生辉重写"——没有入口。建议在写作页右键菜单或 AI 侧栏"调用生辉"。
- ★★ **采纳→写回→合并 一键化**：目前需要：标采纳 → 写回侧栏草稿 → 跳写作页 → 合并到正文。三跳。建议保留现有保守路径，同时增加"直接替换章节正文"按钮（带 confirm）。
- ★★ **从藏经直跳生辉的素材锁定**：用户在 `/reference` 看到一段想要的笔法，应能"以此段为风格参考开始仿写"，进生辉时该段已勾选。当前需要进生辉再搜索。
- ★ **生辉记录用量到推演侧统计**：推演有 `usageLog`；生辉的 task 名是 `生辉·仿写`/`生辉·笔法提炼`/`生辉·场景状态`，应在创作中心"用量洞察"里专门一行（看是否已经聚合）。

### 引导 / 教学

- ★ **第一次进入的"演示稿"模式**：现在没作品就跳作品库。建议提供 demo 作品+示例 outline+一段已生成稿，用户能"看一遍流程"再进真实创作。
- ★ **快捷指令面板**：v0 设计稿的 quickPrompts 是关键体验。建议主稿区上方加一行 chip：续写段落 / 重写选中 / 扩展细节 / 优化对话 / 收紧 30%。

---

## 三、UI 升级方向（怎么往更高级走）

### 1）布局层

- **顶栏信息密度升级**：当前顶栏只有"返回 + 模型 + 写作 + 推演 + 藏经"。建议增加：
  - 面包屑：作品名 › 章节名（点击下拉切换，免开左栏）
  - 状态徽章：`生成中 · 12s · ~3.4k tokens` 实时更新
  - 用量徽章：`今日 ¥0.42 / 上限 ¥5`（点击进创作中心）
- **小屏（<lg）抽屉化**：现在三栏在小屏直接摞成一列，找东西像翻书。建议：
  - 左栏：顶栏左侧汉堡按钮 → 抽屉
  - 右栏：浮动按钮 → 底部 sheet（仿写/素材/版本 tab 在 sheet 里）
  - 主稿沉浸（与 v0 设计稿"editor 全宽"思路一致）
- **专注模式（F11 / `Cmd+\\`）**：隐藏左右两栏，只保留顶栏 + 主稿，把字号放大到衬线 18-20px、行距 1.9，类似 iA Writer。仿写编辑长稿件时极其有用。
- **左栏章节项加 `状态点 + 字数`**：和 v0 mock 的 `wordCurrent/wordTarget` 一致 — 一眼看哪些章节已生成、哪些未达标。

### 2）主稿区视觉

- **主稿改富文本（或 Markdown）渲染 + 编辑双模**：当前是纯 textarea，没有段落分隔感。建议：
  - 默认渲染段落（首行缩进、段间距 1em、衬线字体 `font-feature-settings: "ss01"`），与正式书页一致
  - 双击进入纯 textarea 编辑
  - 行高 1.85、段距 1.2em、宽度限制 38em（黄金阅读宽）
- **段落微交互**：鼠标 hover 段落时左侧浮出小工具栏：⟲ 重写 · 🔍 风格扫描 · ✂ 收紧 · ➕ 扩展。这与 v0 mock 的 "段落级再生" 同思路。
- **流式生成的段落级 typing 动画**：用 `font-variation-settings` 或简单 fade-in，让字一行一行"落下"，比当前一坨刷新更有质感。
- **主稿底色按情绪温度变化**：emotionTemperature 1-2 偏冷灰 / 3 中性纸色 / 4-5 偏暖米。轻微 hue shift，不抢戏。

### 3）右栏分区视觉

- **统一卡片节奏**：当前右栏几个 section 是 `text-[11px] font-semibold uppercase tracking-widest` 标题，但卡片密度参差。建议每个 section 改成"圆角卡片 + 顶部彩色 1px 横条 + icon"，像 Linear / Raycast 的设置页。
- **采用渐变玻璃质感**：背景用 `bg-card/65 backdrop-blur-md`、内圈 1px `border-white/[0.04]` highlight、外阴影 `shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.35)]`。当前 `bg-card/50 shadow-sm` 平。
- **状态色板**：用 oklch 系（v0 设计稿已经用了 `oklch(0.7_0.15_145)`）。建议把"采纳"改成 emerald oklch、"未采纳"灰 oklch、"AI 生成中"动态金色 oklch。

### 4）控件升级

- **模式选择改 segmented control 或 dropdown 分组**：当前是 4+3 两行 button，宽度撑得满，看起来像功能菜单。建议：
  - 主流 `[按纲仿写] [续写] [重写] [精炼]` 是 segmented control
  - 高级 `[场景骨架 ⌃] [对话优先 ⌃] [分段接龙 ⌃]` 折进 "高级模式" dropdown
  - 鼠标 hover 显示完整说明气泡（已有 title，但 title 在 macOS Safari 体验差，应改 tooltip）
- **滑动条加刻度小图标**（情绪温度 1-5）：1=雪花、3=圆点、5=火焰，比纯数字直觉。
- **目标字数加预设按钮**：`500 / 1500 / 3000 / 5000` chip + 自定义 input；现在只有 input，每次键入烦。
- **"换模型"按钮升级**：当前只显示 logo + label。建议加 mini metric — "Sonnet 4.6 · 中速 · 中价"，与 v0 设计稿的 modelOptions 一致。

### 5）反馈层

- **每次生成后的小总结卡**：完成时主稿底部弹一张 6-8 秒的"完成卡"——`新增 1280 字 · 用时 14s · 估 ~1.2k 输出 tokens · 相似度 12%（与原稿）`。点击可"再来一稿（升一档创意）"。
- **token 进度环**：右栏顶部加一个小型 SVG 环 ring — 输入：4.2k / 上限 32k，输出预留：4k。比单行文字直观。
- **粗估超出阈值预警**：当 `lastRoughEstimate.totalApprox > 阈值`（默认 8k）时按钮变为黄色 `Generate (高消耗 ⚠)`，点击需二次确认。v0 设计稿已有 cost-confirm dialog，可对齐。

### 6）色彩 / 排版品质

- **正文主稿采用衬线 + Pingfang 混排**：英文衬线 (Source Serif Pro / Spectral)、中文圆角 (Pingfang) 或方正书宋。当前用默认 sans 显得像通讯软件。
- **氛围层做"纸质纹理"**：`ShengHuiAmbientBg` 是几个 blur 圆。可叠一层 `bg-[url('/images/paper-grain.png')] opacity-[0.04] mix-blend-overlay`，让主稿看起来像在纸面上。
- **专业仿写台必备：字号阶梯**
  - 标题 18 → 16 → 14 → 12 → 11
  - 正文 16 / 行高 1.85
  - 元信息 11 / 颜色 muted-foreground/60
  当前阶梯偏小（11/12/13），整体像设置页。

---

## 四、关联功能完整性核查


| 关联点                           | 现状                                          | 完整度 | 说明                                                                                             |
| ----------------------------- | ------------------------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| **推演 → 生辉**                   | TuiyanTopBar 有"进入生辉"按钮带 deep link           | ✅   | [src/components/tuiyan/TuiyanTopBar.tsx](../src/components/tuiyan/TuiyanTopBar.tsx)            |
| **生辉 → 推演**                   | 顶栏 `Link to="/logic"`                       | ⚠️  | 只跳转，不带作品/章节 deep link，进推演要再切一次                                                                 |
| **生辉 → 写作页（带 AI 侧栏打开）**       | `buildWorkEditorUrl(work, chapterId, true)` | ✅   | [src/util/sheng-hui-deeplink.ts:27](../src/util/sheng-hui-deeplink.ts#L27)                     |
| **生辉 ← 写作页**                  | 写作页**没有**进生辉的入口                             | ❌   | 只能用 AppShell 顶栏切，不带当前作品/章节                                                                     |
| **生辉 ← 藏经**                   | 藏经页**没有**"以此段开始仿写"入口                        | ❌   | 用户需在生辉再次搜                                                                                      |
| **AI 写作侧栏 ← 生辉写回**            | `writeAiPanelDraft` 写当前草稿槽                  | ⚠️  | 不写 `pushDraftHistory`，历史看不到                                                                    |
| **GlobalCommandPalette → 生辉** | 已有 `path: "/sheng-hui"`                     | ✅   | [src/components/GlobalCommandPalette.tsx:149](../src/components/GlobalCommandPalette.tsx#L149) |
| **AppShell 导航**               | 顶部 Tab + 侧栏菜单都有                             | ✅   | [src/components/AppShell.tsx:331](../src/components/AppShell.tsx#L331)                         |
| **DeepLink**                  | `?work=&chapter=` 消费并 strip                 | ✅   | [src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)                        |
| **Tuiyan 文策导入**               | 按 chapterId 过滤导入                            | ✅   | [ShengHuiPage.tsx:825-846](../src/pages/ShengHuiPage.tsx#L825-L846)                            |
| **Bible / 风格卡 / 标签注入**        | 完整                                          | ✅   | 设定索引、章节锦囊、风格卡、标签 profile 都接                                                                    |
| **RAG 藏经**                    | 完整，含笔法提炼                                    | ✅   | 提炼按钮、自动勾选、合并上限均有                                                                               |
| **隐私 Gate**                   | 严格                                          | ⚠️  | 见前文 #10，过严                                                                                     |
| **粗估 + 注入确认**                 | 已接 `confirmInjectionPrompt`                 | ✅   | 显示输入/输出/合计 token                                                                               |
| **本地 Provider**               | 已接 `isLocalAiProvider`                      | ✅   | 跳过隐私校验、跳过 metadata 限制                                                                          |
| **用量计入**                      | `addTodayApproxTokens(rough.totalApprox)`   | ✅   | 与首页用量洞察打通                                                                                      |
| **流式取消**                      | 仅 runGenerate 主流程支持                         | ⚠️  | 见 #6，子任务（提炼/提取）无                                                                               |


**结论**：单向链路（推演→生辉→写作）通；反向链路（写作/藏经→生辉）有断点；AiPanel 历史不联动。

---

## 五、推荐执行计划（按 ROI）

### 立刻修（< 0.5 天，纯 bug）

- **F1**：生成中切作品/章节自动 abort + 局部捕获 ids 防快照错位（#1、#5）
- **F2**：confirm 取消时不要清空 output（#8）
- **F3**：写回侧栏同时 `pushDraftHistory`（#4）
- **F4**：用 `isAbortError` 工具函数集中判取消（#7）
- **F5**：去掉冗余 dynamic import，统一调用静态 client（#17）
- **F6**：错误以 toast / 主稿顶部 inline 显示，不只塞在 compose tab（#15）

### 本周做（1-2 天，体验拐点）

- **W1**：主稿自动草稿（localStorage）+ 切章不丢手改内容（#2）
- **W2**：写作页编辑器右键 / 工具栏加"调用生辉重写本段"入口（关联 #4 的反向链路）
- **W3**：藏经搜索结果加"以此段开始仿写 →"按钮（关联 #4 的反向链路）
- **W4**：错误 + 进度 + 字数 + token 用量在主稿顶部统一为 status bar（#15、#23、目标字数对比）
- **W5**：快照加 8 字短名 + ⭐ 收藏（仿写台缺的"挑稿子"能力）
- **W6**：模式选择改 segmented control + 高级模式 dropdown（UI #4）
- **W7**：节拍/段落级再生 — 至少接通 `skeleton` 节拍解析为节点 + 单节点重生

### 下个迭代（3-5 天，专业感升级）

- **N1**：主稿改"渲染 + 编辑"双模（衬线 / 段间距 / 限宽 38em）
- **N2**：段落 hover 工具栏（重写 / 扩展 / 收紧 / 风格扫描）
- **N3**：A/B 双生成（同 prompt 异参数对比）
- **N4**：风格漂移检测复用 AiPanel 的 `useAiPanelToneDrift`，生成后自动跑分
- **N5**：上下文 token 树（每个 block 占多少，提示是否被截断）
- **N6**：风格指纹扩展（`docs/sheng-hui-improve-plan.md` 第 5 项收尾）
- **N7**：人物声音锁注入"经典台词示例"
- **N8**：专注模式 + 字号阶梯 + 纸质纹理底

### 远期（重构方向，> 1 周）

- **L1**：快照存储从 localStorage JSON 迁到 IndexedDB（容量、并发、性能）
- **L2**：node-aware outline（解析为节点列表 + 每节状态/字数 + 按节生成）
- **L3**：词/句级 side-by-side diff + hunk 级"接受/拒绝"
- **L4**：模式扩展：`segment` 接力 + 自动场景状态卡更新（每段生成完自动从输出末尾 4-8 字段提取写回 sceneState）

---

## 六、关键文件索引


| 文件                                                                                                                            | 行数   | 责任                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------- |
| [src/pages/ShengHuiPage.tsx](../src/pages/ShengHuiPage.tsx)                                                                   | 1150 | 总编排与状态机；偏厚，可按 hook 拆分                   |
| [src/v0-modules/shenghui-module.tsx](../src/v0-modules/shenghui-module.tsx)                                                   | 976  | v0 设计稿（mock，含成本/quickPrompts/chat）      |
| [src/components/sheng-hui/ShengHuiCenterManuscriptColumn.tsx](../src/components/sheng-hui/ShengHuiCenterManuscriptColumn.tsx) | 103  | 主稿编辑器                                   |
| [src/components/sheng-hui/ShengHuiRightComposeBlock.tsx](../src/components/sheng-hui/ShengHuiRightComposeBlock.tsx)           | 255  | 模式 / 参数 / 大纲 / 生成按钮                     |
| [src/components/sheng-hui/ShengHuiRightMaterialsBlock.tsx](../src/components/sheng-hui/ShengHuiRightMaterialsBlock.tsx)       | 313  | RAG / 场景卡 / 人物声音锁 / 上下文注入               |
| [src/components/sheng-hui/ShengHuiRightVersionsBlock.tsx](../src/components/sheng-hui/ShengHuiRightVersionsBlock.tsx)         | 155  | 快照列表 + diff                             |
| [src/components/sheng-hui/ShengHuiLeftChapterRail.tsx](../src/components/sheng-hui/ShengHuiLeftChapterRail.tsx)               | 127  | 作品/章节切换                                 |
| [src/ai/sheng-hui-generate.ts](../src/ai/sheng-hui-generate.ts)                                                               | 378  | Prompt 装配 + 流式调用                        |
| [src/util/sheng-hui-snapshots.ts](../src/util/sheng-hui-snapshots.ts)                                                         | 159  | localStorage 快照                         |
| [src/hooks/useShengHuiWorkspacePrefs.ts](../src/hooks/useShengHuiWorkspacePrefs.ts)                                           | 54   | 左栏开合 / 三步引导关闭                           |
| [src/hooks/useShengHuiDeepLink.ts](../src/hooks/useShengHuiDeepLink.ts)                                                       | 74   | `?work=&chapter=` 消费                    |
| [docs/sheng-hui-improve-plan.md](sheng-hui-improve-plan.md)                                                                   | 207  | ~~2026-04-18 升级计划（多数已落地）~~ 第 1–8 项已划掉归档 |


