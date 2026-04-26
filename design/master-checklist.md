# 总体规划执行清单（Living）

> **用法**：已完成项用 Markdown 删除线 ~~包裹~~；未完成的保持原样。合并 PR 或发布前把对应行划掉。  
> **真源**：`docs/总体规划-路线图与导航整合.md`（§10～§11）、`docs/总体规划-改进版-2026-04.md`（**目标修订 + 双轨说明**；**§10 v0 能力取舍**）、`docs/UI-v0-对齐任务清单.md`（**各功能区功能 vs 向 v0 皮 进度**；**§E.5 波次**）、`docs/bug-backlog.md`（**规划级缺陷 / 分期**）、`docs/路线图.md`、`design/implementation-steps.md`、`**docs/留白写作-深度改进建议书v1.md`（§F 深度改进对标，与 §B 并行）**；**§G** = `design/v0-ui-reference` 中 **可增量交付、与决策 #2 / 唯一真源不冲突** 的能力池（与 §E **皮**、§F **报告深化** 正交）。**  
> **UI 目标：主应用与 `design/v0-ui-reference` v2.0 `**ui-design-specification.md`** **极高相似度（约 96%～98%）**，允许字体/极端数据/CodeMirror 接缝等 **局部微调**；**不**把 Next 子工程并进主构建，业务仍在 `src/`。**首轮**为 §D（token + 手写 CSS 对齐）；**第二轮**为 **§E（UI‑V0 同源渲染：Tailwind + 与参考一致的组件层）**，与 §B **并行尽早开工**，避免「功能全做完再整站换皮」集中爆雷。  
> **作业顺序**：**§B（§11）** 与 **§D / §E** 可同 PR 交织；详见 `docs/总体规划-改进版-2026-04.md` **§6～7**（风险与门禁）、**§9**（任务清单记录完整性审计）。  
> **数据库 / 远端**：新表新列的 **代码、Dexie、`supabase/schema.sql`、`backend/migrate.js`** 可先合入并做好 **本地** 自测；**生产库执行 SQL、环境推送** 放在 **本地规划阶段验收 OK** 之后（见 §D 门禁），不阻塞 UI 与功能开发。

---

## 〇、路线图基线（0～4 组 + 参考库 + 本书锦囊，仓库已具备）

- ~~第 0 组（0.1～0.5）定案、边界、技术选型文档~~
- ~~第 1 组（1.1～1.6）Vite/React/TS、壳与路由、WritingStore、初始化、设置、错误与隐私骨架~~
- ~~第 2 组（2.1～2.11）作品/卷/章、搜索、导出、zip 备份/合并、快照、导入、防丢稿等~~
- ~~第 3 组（3.1～3.8）参考库（藏经）分块、索引、阅读器、摘录、标签、进度过滤等~~
- ~~第 4 组（4.1～4.8）本书锦囊护栏（人物/世界观/伏笔/时间线/章模板等）与导出~~
- ~~选修：写作数据 Hybrid + Supabase、邮箱注册/登录相关工程（见 `docs/开发交接-2026-04-03.md`）~~

---

## A、第八章决策（主表：`docs/决策记录.md`）

- ~~《决策记录》文件与七章问题表已建立~~
- ~~议题 #4（健康度/密度指标）：已拍板「一期不展示」~~
- ~~议题 #2（问策边界）：已拍板（一期）~~ — 见 `docs/决策记录.md`；问策 = 开放式策略对话，改纲/文策流水在推演
- ~~七章其余议题：`docs/决策记录.md` **#5** 已记工程出厂默认（`ollama`）；**#6** 标一期不强制；**#7** 与 Hybrid 乐观锁冲突 UI 已对齐；**生辉 vs 推演 vs 侧栏** 边界见决策 **#2** 与 §B 步 10~~

---

## B、§11 步 1～54（全量功能 + 发布）

### 步 1 — 决策收口成文

- ~~`docs/决策记录.md` 已创建~~
- ~~第八章可拍板项：`docs/决策记录.md` #3 已拍板（章级人物状态）；#5～7 已更新（#5 工程默认、#6 不阻塞、#7 对齐实现）~~
- ~~README 链至 `master-checklist.md`、`ai-context-merge-order.md`；决策记录链至 `master-checklist.md~~`

### 步 2 — API Key 与连接配置

- ~~设置侧多厂商 Key、Base URL、模型（后端模型配置弹窗 + `ai/storage`）~~
- ~~Key 输入框支持隐藏显示（password/text 切换）~~
- ~~AI 密钥存储策略写在 `docs/技术说明.md`（「AI 配置与 API Key」节）~~
- ~~仓库与日志无明文 Key（流程自检；见 `docs/开发自检-密钥与日志.md`）~~

### 步 3 — 统一 LLM 调用层

- ~~`src/ai/client.ts` 作为对外统一 import 入口（re-export providers）~~
- ~~实现仍在 `providers.ts`（fetch / 流式 SSE 等）~~
- ~~生成路径：`src` 内直连厂商的 `fetch` 仅 `providers.ts` + 设置弹窗探测（见 `docs/技术说明.md` 例外说明）；`api/`* 为自有后端~~
- ~~超时策略：`docs/技术说明.md`（AI 节）+ `docs/ai-context-merge-order.md` §4~~
- ~~**启发式**：`src/util/ai-error-routing.ts` 提供 `classifyAiClientError`（auth / 限流 / 网络 / 配置提示 / 网关 / unknown）与 `shouldOfferSettingsLinkForAiError`；非厂商响应 JSON 真源~~

### 步 4 — 虚构创作声明 + 首次开 AI 流程

- ~~设置页「虚构创作与 AI」板块（`#fiction-creation`）与协议互链~~
- ~~用户协议补充虚构创作表述~~
- ~~说明：未勾选不禁止侧栏生成（当前策略）~~
- ~~首次使用 AI 拦截 / 强制阅读：`src/ai/first-ai-gate.ts` + `FirstAiGateHost`（`App.tsx`）；`client.ts` 包装后统一门禁~~

### 步 5 — API 失败态 UI

- ~~AiPanel 展示错误文案、Abort 处理~~
- ~~写作页 AiPanel：Key / Base URL /「请先在设置填写」类错误下附 **打开设置** 链至 `/settings`（`AiInlineErrorNotice`）~~
- ~~含 AI 的 Hub 页（推演 / 流光 / 问策 / 生辉 等）：底部 `HubAiSettingsHint` 链至设置~~
- ~~侧栏：`AiInlineErrorNotice` 对鉴权/限流/网络类错误亦链至设置（`shouldOfferSettingsLinkForAiError`）~~
- ~~鉴权失败 / 限流 / 断网 / 502～504 / 超时：`AiInlineErrorNotice` + `shouldOfferSettingsLinkForAiError` 扩展匹配（与 Hub 页、侧栏共用）~~
- ~~与步 3 错误分类对齐：见 `classifyAiClientError`（`ai-error-routing.ts`）~~

### 步 6 — 隐私/协议更新（AI + 云 + Key）

- ~~隐私政策：云端 AI 与提示词上传说明~~
- ~~隐私政策：可选账号与写作数据云同步（Hybrid / Supabase）、参考库默认本地~~
- ~~用户协议与隐私与一期上线能力对齐（`docs/legal-alignment-notes.md`；`/privacy` `/terms` 已更新）~~；正式发版前 **6.6** 再完整扫一遍（与步 53 同轮）

### 步 7 — 账号与云工程收尾

- ~~OTP 注册、登录、重置密码流程（前端 + API 文档）~~
- ~~Hybrid 下读写路径与 `docs/开发交接-2026-04-03.md` 一致（工程侧可本地冒烟；**生产库 DDL/环境** 仍按 §D 门禁与 `docs/生产环境部署.md`）~~
- ~~新注册用户本地库为空时自动注入 **演示包**（五部示例书 + 流光碎片等，`演示包` 标签可删；`RegisterDemoPackEffect` + `src/seed/register-demo-pack.ts`）~~
- ~~Redirect URLs / 邮件 / 生产环境变量：工程验收说明见 `docs/生产环境部署.md`（含 Supabase Auth Site URL、Redirect URLs 与邮件）；**上线前**在真实域名与环境执行~~

### 步 8 — 登录后默认落地页

- ~~登录成功有重定向（当前 `→ /`）~~
- ~~决策记录 #1：临时既定默认 `/`；`/library` 仍可用~~

### 步 9 — 上下文装配器 v1

- ~~`AssembleContextInputV1` 与 `assembleChatMessagesPlaceholder`（`assemble-context.ts`，未接 UI）~~
- ~~写作侧栏：`buildWritingSidepanelMessages` + `buildWritingSidepanelInjectBlocks`（作品/章、风格卡、本章锦囊、变量、摘录、邻章概要、全书锦囊、RAG、正文/概要/选区、任务句；云端隐私门控与截断与预览一致）~~
- ~~作品 **留白标签 → tagProfileText** 接入数据层并注入（`Work.tags` + `work-tags.ts` → `AiPanel` / `assemble-context`）~~
- ~~邻章摘要 / 本书锦囊 **勾选子集** 等更细粒度装配（可选增强）~~（写作侧栏：`neighborSummaryIncludeById` + 本章锦囊字段勾选 + `WORK_BIBLE_SECTION_HEADERS` 全书板块勾选；`assemble-context` / `run()` 与材料预览同源）
- ~~「本次使用材料」简版与装配器字段对齐（`buildWritingSidepanelMaterialsSummaryLines`）~~（见步 15）
- ~~标签 profile：简版仅显示字数摘要，不向用户展开全文；system 内注入遵守 §3.5.3~~

### 步 10 — 风格卡自动注入

- ~~写作页 AiPanel：风格卡字段已进入 system/上下文拼装~~
- ~~与装配器目标顺序及当前侧栏对照：`docs/ai-context-merge-order.md~~`
- ~~推演：`generateLogicThreeBranches` 注入与写作侧栏同源 **风格卡 + 标签侧写**（`formatWorkStyleAndTagProfileBlock`）+ **文风锚点**于 user 段（与装配器字段对齐）~~
- ~~生辉：**MVP**：`/sheng-hui` 按纲仿写（流式）+ 与写作侧栏同源 **风格卡 + 标签侧写**（`src/ai/sheng-hui-generate.ts`）；一键合并入正文仍走写作侧栏（可选增强）~~

### ~~步 11 — 草稿区 UI（不覆盖正文）~~

- ~~独立草稿区与正文分离（写作侧栏：`ai-panel-draft-zone` + 本会话按章 `sessionStorage` 草稿）~~

### ~~步 12 — Diff / 合并入正文~~

- ~~对比与确认后写入正文（`AiDraftMergeDialog` 行级 diff / 双栏预览；确认后 `insertAtCursor` / `appendToEnd` / `replaceSelection` → 编辑器既有防抖写回章节）~~

### 步 13 — 流式输出 + 取消

- ~~OpenAI 兼容类提供方：SSE 流式 + 可读器取消~~
- ~~Claude / Gemini：当前非流式回退；说明见 `providers.ts` 内 `generateWithProviderStream` 注释 + `docs/ai-context-merge-order.md` §3~~
- ~~Claude / Gemini **真流式** API（后续迭代）~~（`providers.ts`：`generateAnthropicStream` Messages SSE + `generateGeminiStream` `streamGenerateContent?alt=sse`；`generateWithProviderStream` 路由；`docs/ai-context-merge-order.md` §3）

### 步 14 — 顶栏当前作品/章节上下文

- ~~作品子栏：书名、字数、进度章节标题（`/work/:id` 路径下）~~
- ~~Hub：存在 `liubai:lastWorkId` 且当前非 `/work/`* 时，顶栏右侧「最近 · 书名」链至该作品写作页~~
- ~~全局一致「当前书/章」默认解析（跨页）：`resolveDefaultChapterId`（本会话最近章 → 进度游标 → 首章）；`AppShell` 顶栏「最近」与 `/logic`、`/sheng-hui` 等 Hub 内默认章一致~~

### 步 15 — 「本次使用材料」简版

- ~~写作页 AiPanel：可折叠「本次使用材料（简版）」列表（作品/章、模型、风格卡、本章锦囊、全书锦囊、摘录、概要、RAG、云端隐私摘要、粗估 token；标签行占位「暂无」）~~
- ~~与写作侧栏装配器同源字段对齐（`assemble-context.ts`）~~
- ~~标签有数据后简版「已注入侧写」与装配器同步验收~~（`tagCount` + `buildWritingSidepanelMaterialsSummaryLines` 文案与 system「作品标签侧写」对齐）

### 步 16 — 成本提示 + 超阈值确认 + 进阶防误触

- ~~`approxRoughTokenCount` 独立模块（`approx-tokens.ts`），AiPanel 已用于预计注入~~
- ~~设置：`injectApproxTokenThreshold` / `injectConfirmOnOversizeTokens` / `injectConfirmCloudBible`（后端模型配置 → 默认与上下文）；侧栏 `run()` 用 `resolveInjectionConfirmPrompt` + `window.confirm`；粗估 ≥20 万 tokens 强制确认~~
- ~~§5.3.2：数字确认 / 长按 / 冷却（可选）~~（`confirmInjectionPrompt`：数字码=粗估 tokens；最短停留 1.2s；确认后 1.5s 冷却；写作侧栏/生辉/流光扩容共用）
- ~~会话/日累计（可选）~~（步 16：设置页展示「今日累计（本机）」粗估 tokens；侧栏/生辉/流光扩容成功后累加；支持清零）

### 步 17 — 续写通路

- ~~一键续写：写作顶栏「续写」打开 AI 侧栏、切续写模式并自动请求；生成仅入侧栏草稿，由用户再插入/追加正文~~

### 步 18 — 无提示词抽卡通路

- ~~技能模式「抽卡」：`draw` 装配（章节概要作大纲 +/或 前文尾；不向模型发送「额外要求」）；`validateDrawCardRequest` 校验云端隐私；顶栏「抽卡」一键 + 侧栏下拉可选；结果仅侧栏草稿~~

### ~~步 19 — 摘要存储模型 + 迁移~~

- ~~卷/章摘要结构 + Dexie/Supabase 双轨（`Volume.summary`、`Chapter.summaryUpdatedAt`；Dexie v13；`supabase/schema.sql` + `backend/migrate.js` 补列；`supabase-writing-rows` 读写）~~

### 步 20 — 摘要生成流水线

- ~~手动触发：「AI 生成概要」（`chapter-summary-generate.ts`：正文节选 + 隐私门控 + `generateWithProvider` + 网络类失败退避重试）；概要弹窗与右侧概要栏入口~~
- ~~每章或每 N 章**自动**触发、后台队列（本机：保存正文后后台入队；右侧概要栏展示排队/生成中/失败；切章自动取消；门控类错误降噪不反复重试；实现见 `src/ai/chapter-summary-auto.ts` + `EditorPage` 入队）~~

### ~~步 21 — 人物状态快照~~

- ~~**MVP**：`chapter_bible.character_state`（`characterStateText`）按章自由文本备忘；写作页侧栏「本章人物状态」编辑；装配器 `buildWritingSidepanelCtxParts` 注入 user 上下文；Dexie 与 Supabase `chapter_bible` 双轨 + `migrate.js` / `schema.sql~~`

### 步 22 — 摘要可编辑 + 元数据

- ~~`summaryUpdatedAt` 展示：概要弹窗与右侧概要栏显示「上次更新时间」（`formatSummaryUpdatedAt`）~~
- ~~覆盖章节范围等流水线元数据（新增 `Chapter.summaryScopeFromOrder`/`summaryScopeToOrder`；Supabase/Dexie 迁移；AI 生成与手动保存时补齐默认单章范围；概要总览与右侧概要栏展示「覆盖范围」）~~

### 步 23 — RAG 索引设计落地

- ~~**设计真源**：`docs/rag-index-design.md`（参考库已落地；本书锦囊/正文/向量为规划增量）~~

### 步 24 — RAG 检索 + 注入

- ~~**参考库 MVP**：侧栏 top-k、hybrid/strict、`ragHits` → `assemble-context` 注入~~
- ~~本书锦囊 / 章节正文多源检索与合并注入（**运行时** 分块 + 混合打分，见 `docs/rag-index-design.md` §2、`src/util/work-rag-runtime.ts`；持久倒排索引可选二期）~~

### ~~步 25 — 保存时冲突提示（updatedAt）~~

- ~~云或本地：`updateChapter(..., { expectedUpdatedAt })` + `ChapterSaveConflictError`；写作页正文防抖保存冲突顶栏提示与「重新载入本章」；概要总览/侧栏概要/弹窗概要带 CAS 与冲突提示~~

### 步 26 — 备份软提醒

- ~~设置「数据」：开关 + 约 30 天未记录导出时提示条；导出 zip 成功写 `lastBackupExportAt`（`backup-reminder.ts`）~~

### ~~步 27 — 失败降级策略~~

- ~~缩短上下文、仅摘要、关 RAG（侧栏：`ai-degrade-retry` + 上下文类错误时「精简并重试」）~~

### ~~步 28 — Context Caching 评估~~

- ~~**文档**：`docs/context-caching-eval.md`（浏览器直连现状、缓存前提、非阻塞建议）；**POC** 待代理层后再做~~

### ~~步 29 — 留白：书架卡片 + 进度条~~

- ~~作品库网格卡片、封面（`Work.coverImage` data URL，宜小于约 400KB）、字数与章数、进度游标条形进度（`computeWorkLibraryStat`）；Supabase `work.cover_image` + migrate~~

### ~~步 30 — 留白：新建作品弹窗 + 标签（§3.5）~~

- ~~`Work.tags`、作品库「新建作品」弹窗（书名 + 留白标签）、卡片展示与工具栏「标签」编辑；云端 `work.tags text[]` + migrate；备份导入 `normalizeWorkRow` 透传~~

### ~~步 31 — 留白：快速进入全屏编辑~~

- ~~沉浸写作：`EditorZenContext` + 顶栏「沉浸」/更多菜单；隐藏 `EditorShell` 顶栏、收起章列表与右栏；固定角「作品库 / 设置 / 退出沉浸」；`Esc` 退出、`Alt+Z` 切换（不在 input/textarea/select 内时）~~

### 步 32 — 推演：一致性扫描 MVP

- ~~**规则 MVP（先规则后 AI）**：`/logic` 选作品与章节，**扫描本章正文** vs **本章锦囊禁写**、**全书风格卡禁用套话**、**术语表 category=dead**、**人物禁忌**；实现 `src/util/bible-consistency-scan.ts`（`runBibleConsistencyScan` / `splitConstraintPhrases`）+ `LogicPage` + `index.css` `.logic-*` 样式~~
- ~~基于 **LLM** 的语义矛盾、**全书/多章**批量扫描、命中 **忽略/白名单**（`src/ai/logic-consistency-scan.ts`；`/logic` 增加 AI 扫描范围（本章/最近5章/全书）+ 取消；结果支持本机忽略/取消忽略，存 `localStorage`）~~

### 步 33 — 推演：三分支预测

- ~~**MVP**：`src/ai/logic-branch-predict.ts` · `generateLogicThreeBranches`（`generateWithProvider` + 温度 `geminiTemperature`）；输出约定 `<<<1>>><<<2>>><<<3>>>` 或【分支一】…【分支三】+ `标题：`/`走向：`；解析失败时三条降级说明卡；`/logic` 上「生成分支」+ 取消（Abort）+ 可选倾向；云端隐私门控对齐章节概要（同意云、元数据、本章正文）；`LogicPage` 与 `index.css` `.logic-branch-*` 样式~~
- ~~一键写入写作侧栏草稿、与装配器/文策日志联动、多轮改纲（后续）~~（步 33：推演页三分支结果支持「写入侧栏草稿」；写入 sessionStorage `liubai:aiPanelDraft:v1:{workId}:{chapterId}`，与 `AiPanel` 同源；含空态/错误态/写入中提示）

### 步 34 — 推演：时间轴/地图极简 MVP

- ~~**MVP**：`/logic` 本书锦囊时间线列表 + 世界观条目速览（只读）+ 时间线快速追加（标签/备注/可选关联章），链到 `/work/:id/bible`；`LogicPage` + `index.css` `.logic-timeline-*` / `.logic-world-*` 样式~~
- ~~独立「地点-事件」表、地图视图、与三分支/扫描的深联动（地点/事件独立表：Dexie v19 + Supabase 表；`/logic` 增加 SVG 地图视图 + 地点列表 + 事件列表/新增事件可关联章节；备份导入导出包含该表）~~

### 步 35 — 流光：碎片数据层

- ~~**MVP**：`InspirationFragment` + Dexie `inspirationFragments`（v14）+ `WritingStore` / `repo` CRUD；Supabase `inspiration_fragment` + RLS；备份 `data.json` 含 `inspirationFragments`；`/inspiration` 列表与新建~~
- ~~全局快捷键（步 36）、AI 五段扩容（步 37）、转入章节（步 38）~~

### 步 36 — 流光：全局快捷键

- ~~**MVP**：全局 **Alt+S**（Mac **⌥+S**）唤起速记弹层（`InspirationGlobalCapture` 挂 `App.tsx`，含写作页）；输入框/编辑器内不触发；Esc 关闭、**Ctrl/⌘+Enter** 保存；路由切换自动关闭~~
- ~~可配置键位、与系统/浏览器快捷键冲突检测（设置页可配置组合键；实时提示与应用内/系统保留键冲突；速记弹层与提示文案随配置更新）~~

### 步 37 — 流光：AI 五段扩容

- ~~**MVP**：`inspiration-expand.ts` · `generateInspirationFiveExpansions`（`<<<1>>>`…`<<<5>>>` / 【候选一】… 解析 + 降级说明）；隐私门控与推演一致（云端同意、**章节正文**上云；书名仅 `allowMetadata` 时注入）；`/inspiration` 列表 **AI 五段** + 面板、重新生成、取消、`存为碎片`（标签追加「扩容」）~~
- ~~**后续已交付**：与全局速记弹层联动（「去流光扩容」+ `inspiration-expand-handoff.ts`）；批量粘贴（`splitInspirationBatchPaste`）；扩容粗估与超阈值确认（`buildInspirationExpandChatMessages` / `estimateInspirationExpandRoughTokens`，门控与生辉同源）~~

### 步 38 — 流光：转入章节

- ~~**MVP**：`/inspiration` 列表 **转入章节**：选作品与章，将碎片正文**追加**到章末（`──────── 流光转入 · 时间戳 ────────` 分隔）；`listChapters` 取最新 `updatedAt` + `updateChapter(..., { expectedUpdatedAt })` 冲突提示；链至 `/work/:id?chapter=` 写作页~~
- ~~光标位插入、与侧栏草稿合并流（`/inspiration` 转入时可选：章末追加 / 跳转写作页光标位插入 / 合并到写作侧栏草稿；光标插入用 sessionStorage handoff，写作页执行插入）~~

### 步 39 — 藏经：PDF 本地解析

- ~~**MVP**：`pdfjs-dist` + `extract-pdf-text.ts`（`GlobalWorkerOptions.workerSrc`、`getDocument` → 按页 `getTextContent` 拼文本、`pdf.destroy()`）；`ReferenceLibraryPage` 导入 `.pdf`（与 `.txt` **分批**、不混选）→ `createReferenceFromPlainText` 与索引/分块同 TXT；UI 说明本地解析、扫描版无文本层提示~~

### 步 40 — 藏经：语义/混合检索

- ~~**MVP（本地无向量）**：`searchReferenceLibrary(..., { mode: 'strict' | 'hybrid' })`；**精确** 维持分词 AND + 整句字面量；**扩展** 分词 OR 召回 + `refineHybridHit` 加权排序；`ReferenceLibraryPage` 工具条模式切换 + `liubai:referenceSearchMode`；侧栏 RAG 预览用 `hybrid` 提高召回~~

### 步 41 — 藏经：本地安全锁 UI

- ~~**MVP**：`ReferenceLibraryPage` 顶区下固定 **本地安全锁** 说明（锁图标 + 标题 + 正文）：参考库仅存本机 IndexedDB、导入解析不上传；与 Hybrid **写作数据**云同步范围区分（不包含藏经）~~

### 步 42 — 落笔：Prompt 模板库

- ~~**MVP**：每作品 `writingPromptTemplates`（IndexedDB v15 + Supabase `writing_prompt_template`）；锦囊页「提示词」Tab CRUD/排序；「去写作装配」→ 写作页打开 AI 侧栏并覆盖「额外要求」~~

### 步 43 — 落笔：笔感样本

- ~~**MVP**：每作品 `writingStyleSamples`（IndexedDB v16 + Supabase `writing_style_sample`）；本书锦囊「笔感」Tab；正文注入 `buildWritingSidepanelCtxParts`（user 上下文，紧接文风锚点）~~

### 步 44 — 落笔：全局词典 → 生成

- ~~**MVP**：本书锦囊术语表经 `buildWritingSidepanelCtxParts` 注入 user 上下文（本章约束与关联摘录之间）；词条按字数降序；云端与 `allowMetadata` 同档~~

### 步 45 — 导航减负 + 命令面板

- ~~**MVP**：`GlobalCommandPalette`（`⌘/Ctrl+K` 开关、筛选、↑↓ Enter）；顶栏 **更多** 收纳推演/流光/问策/生辉；主导航留白·落笔·藏经常显；登录全屏页仍挂面板~~

### 步 46 — 问策：MVP

- ~~**MVP**：`/chat` 多轮对话 UI（流式 + 停止）；`buildWenceChatSystemContent` / `buildWenceChatApiMessages`（`assemble-context.ts`）；可选关联作品 → 风格卡 + 标签侧写；可选「设定索引」（人物/世界观/术语名录，截断）；sessionStorage 按作品键持久化；云端元数据门控与 `HubAiSettingsHint` / `AiInlineErrorNotice~~`
- ~~会话跨设备同步、与推演文策日志联动、专用成本确认（跨设备：Supabase `wence_chat_session`；联动：推演分支一键带入问策新会话；成本确认：问策专用数字确认）~~

### 步 47 — 5.10 调性漂移提示（可选）

- ~~**MVP（无 embedding）**：`computeToneDriftHints`（`src/util/tone-drift-hint.ts`）— 禁用套话命中计数、文风锚点与草稿的句长对比；设置项 `toneDriftHintEnabled`；`AiPanel` 草稿区「调性提示」块（仅参考）~~
- ~~标杆段 embedding 距离等重方案（OpenAI 兼容 `/embeddings`；基于文风锚点 vs 侧栏草稿余弦距离；sessionStorage 缓存；仅提示不阻断）~~

### 步 48 — 5.11 批量与成本上限（可选）

- ~~**MVP（侧栏本会话）**：`aiSessionApproxTokenBudget` + `sessionStorage` 累计（`src/ai/sidepanel-session-tokens.ts`）；每次成功生成后累加请求 messages + 输出粗估 tokens；超上限拦截并提示；草稿区显示累计/上限与「清零本会话累计」；配置在「后端模型配置 → 默认与上下文」~~
- ~~整卷仿写 / 多章批量等独立「始终确认」清单（与 `implementation-steps` C.6.3 对齐：按 actionId；数字确认/等效长按/冷却；已接入：推演 LLM 多章扫描、流光五段扩容；设置页开关）~~

### 步 49 — 6.1 性能压测与记录

- ~~`npm run build` 通过；主 bundle 体积告警记入 `docs/性能说明.md`「构建与主包体积」（与 §D.4「体积」项一致）~~
- ~~关键路径抽样：**首页 / 作品库 / 写作 / 藏经 / 设置** 可复现操作见 `docs/性能说明.md`「关键路径抽样」~~
- ~~大文件/弱网（可选）：`docs/性能说明.md` 已记写作 / 参考库侧预期~~

### 步 50 — 6.2 无障碍关键路径

- ~~**键盘**：顶栏主导航、⌘/Ctrl+K 命令面板、作品库「新建作品」、写作页 —— 抽样路径见 `docs/a11y-known-limitations.md~~`
- ~~**可见性**：关键按钮与链接具备可辨 focus；图标类控件逐步补 `title` / `aria-label`（与现有页面对齐，不全站一次改完）~~
- ~~**文档**：`docs/a11y-known-limitations.md`（CodeMirror 等已知局限）~~

### 步 51 — 6.3 迁移说明

- ~~**Dexie**：启动失败全屏错误 + 文案（`src/main.tsx`）；回退指引见 `docs/migration-notes.md~~`
- ~~**Supabase**：`docs/migration-notes.md` 指向 `schema.sql` / `migrate.js` / `开发交接` / `生产环境部署.md~~`
- ~~**用户文档**：备份 → 合并导入路径见 `技术说明` + README；大版本仍须人工对照~~

### 步 52 — 6.5 桌面二期文档（可选）

- ~~若 **不做** 桌面端：**一期跳过**（主交付为 Web）；桌面 / Tauri / 数据路径差异见 `docs/路线图.md` 与 `docs/总体规划-改进版-2026-04.md` 桌面二期表述~~
- 若 **做** Tauri/等：补 **构建、自动更新、与 Web 数据路径差异** 清单（独立文档或 `docs/` 一节）

### 步 53 — 6.6 法律页定稿

- ~~`/privacy`、`/terms` 与一期能力（云端 AI、Hybrid、账号、Key、RAG/本书多源检索、Hub 模块）对齐；见 `docs/legal-alignment-notes.md`；发版前 **6.6** 再完整扫一遍（与步 6）~~
- ~~默认法律页无第三方跟踪外链；备案 / 域名以实际部署为准（见 `docs/生产环境部署.md` / `docs/发布检查清单.md`）~~

### 步 54 — 6.7 发布 checklist 签字

- ~~`docs/发布检查清单.md` **§7 发布签字** 表头已备（发版当日填版本号、日期、执行人）~~
- ~~**工程模板**：`docs/发布检查清单.md` **§0～7** 与 `master-checklist` §B 发版验收口径一致；版本号 / 日期 / 执行人以 §7 表为准~~
- 发版当日仍须执行：**手测**勾选 §0～6、填 §7 表；遗留项记入 **已知问题** 或发行说明（发布流程，非仓库功能缺口）

---

## C、设计与演示资产（非 §11 步号，按需）

- ~~`design/implementation-steps.md`~~
- ~~`design/seven-modules-ui-spec.md`~~
- ~~`design/ppt-source-materials.md`~~
- `design/master-checklist.md`（本文件）
- ~~功能区线框图等资源：信息架构以 `docs/UI-v0-对齐任务清单.md`、`design/v0-ui-reference` 与主应用 `src/pages` 为准；未另存独立线框图~~

### UI 参考工程 v2.0（`design/v0-ui-reference`）

- **真源**：已用桌面 `**留白写作UI设计参考v-2.0`** 覆盖原 v1 目录；与主应用 **不同构建**（Next 16 + React 19 + Tailwind 4 + shadcn），仅作迁移素材。
- **规范**：`design/v0-ui-reference/docs/ui-design-specification.md`（模块结构、色板、交互说明）。
- **相对 v1 新增/强化**：`immersive-editor.tsx`、`ai-model-selector.tsx`、`settings-module.tsx`、`liubai-module.tsx` 等；`app/page.tsx` 默认演示模块为推演（`tuiyan`）。
- **迁移策略**：**第一轮** 按模块渐进迁入 `src/`（§D：壳层 token → 手写 CSS 对齐）；**第二轮** 与 v0 **同源渲染**（§E：Tailwind + primitive），每步可构建；不在主工程直接依赖本子目录源码。详见 `v0-ui-reference/README.md` 与 `docs/总体规划-改进版-2026-04.md`。

---

## D、作业顺序：§11 未完 + UI v2 对齐（波次 · 首轮）

> **怎么做**：每一波结束跑 `npm run build` + 手测本波涉及页面；需要新列新表时 **先写存储层 + 本地库**，**远端 Supabase 执行/推送** 按 §D 末尾门禁执行。  
> **§11 未完**：以下 **不重复** 抄录 B 节全文——**凡 B 节未划线的子项均属 backlog**；下表只标 **建议与哪几波 UI 同节奏做**，避免只做皮不做骨。

### D.1 UI 波次（主应用 `src/`，对照 `design/v0-ui-reference`）


| 波次            | 内容                                                        | 主应用落点                                                       | 参考文件 / 规范                                                   | 与 §11 关系                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**UI-0**~~  | ~~全局 token：色板、surface、顶栏高度、圆角、字体阶梯~~                      | ~~`src/index.css`、`src/theme.ts~~`                          | ~~规范 §1.2～1.3~~                                             | ~~**✓ 首轮**：`--masthead-h`、`--masthead-blur-bg`、`--radius-lg`/`--radius-xl`、`--font-size-xs`～`--font-size-lg`、`--line-tight`/`normal`/`relaxed` 已在 `:root`；§E 二轮可再精对齐 v0 色板密度~~                                                      |
| **UI-1**      | Hub 顶栏七模块 + 右侧操作区（搜索框可先空壳）                                | `AppShell.tsx`                                              | `components/app-shell.tsx`                                  | ~~◐ 已：品牌渐变框、BETA、圆角导航+底指示、**步 45** `GlobalCommandPalette` + **更多** 收纳 2/3/4/6；**Ctrl/⌘+K**（非输入域）开关面板；右侧「命令」按钮同逻辑；Kbd **⌘/Ctrl** 按平台；`**/reference` 与 `/library` 同级** 不叠 `app-topbar`；**通知铃占位**（`app-masthead-bell`）~~ **✓ 步 45 首轮** |
| ~~**UI-2**~~  | ~~留白作品库：网格、卡片、筛选条、空态~~                                    | ~~`LibraryPage.tsx`、`WorkFormModal.tsx~~`                   | ~~`liubai-module.tsx`~~                                     | ~~◐ **步 29/30** 功能已具；本波：搜索/排序、网格·列表…~~ **✓ 已完成**（见修订记录 2026-04-02）                                                                                                                                                                  |
| ~~**UI-3**~~  | ~~首页 / Hub 落地页~~                                          | ~~`HomePage.tsx`~~                                          | ~~`app/page.tsx` 信息架构仅参考~~                                  | ~~与 **步 8/14** 链路与文案一致即可~~ **✓ 已完成**：Hub 七模块卡（1～7 与顶栏一致）、继续创作（`lastWorkId` / `getWork`）、相对时间、设置入口；默认 `/` 与顶栏「最近」逻辑未改                                                                                                                |
| ~~**UI-4**~~  | ~~藏经~~                                                    | ~~`ReferenceLibraryPage.tsx`~~                              | ~~`cangjing-module.tsx`~~                                   | ~~与 **步 39～41** 功能迭代可同 PR~~ **✓ 已完成**：页眉「藏经」与副标题、书目统计、工具条（分类/全文搜索/**精确·扩展**/网格·列表）、网格封面卡片、摘录与标签分区、阅读器顶栏卡片化；`liubai:referenceViewMode`；**步 39～41**：多格式导入、混合检索、本地安全锁 UI                                                               |
| ~~**UI-5**~~  | ~~设置中心分区与侧栏~~                                             | ~~`SettingsPage.tsx`~~                                      | ~~`settings-module.tsx`~~                                   | ~~与 **步 2/4/6/16/26** 等已有逻辑 **只换布局~~** **✓ 已完成**：左侧分区导航 + 主区卡片、`#ai-privacy`/`#backup-data`/`#fiction-creation` 锚点与 `navigate` 同步、顶栏副标题；表单与 `BackendModelConfigModal` 逻辑未改                                                          |
| ~~**UI-6**~~  | ~~写作壳：顶栏、右栏、主编辑区~~                                        | ~~`EditorShell.tsx`、`EditorPage.tsx~~`                      | ~~`immersive-editor.tsx` **分段**对照~~                         | ~~**步 31** 已有沉浸；本波 **默认态** 与参考对齐~~ **✓ 已完成**：顶栏三栏、`setCenterNode`、面包屑、毛玻璃顶栏、右栏标签分段、开栏按钮强调                                                                                                                                           |
| ~~**UI-7**~~  | ~~AI 侧栏：模型选择、区块层级~~                                       | ~~`AiPanel.tsx`、相关 modal~~                                  | ~~`ai-model-selector.tsx`~~                                 | ~~与 **步 3/5/10/13～16** 逻辑不变~~ **✓ 已完成**：模型 / 运行模式分区 + 材料层级样式；选择器与装配逻辑未改                                                                                                                                                             |
| ~~**UI-8**~~  | ~~本书锦囊 / 落笔页~~                                            | ~~`BiblePage.tsx`~~                                         | ~~`luobi-module.tsx`~~                                      | ~~与 **步 42～44** 数据功能可后续加~~ **✓ 已完成**：顶栏书名与统计、快捷链与导出、分区 tab（`toolbar-seg` 风格 + 数量角标）、`bible-section-panel` 与卡片 `focus-within`；数据与导出逻辑未改                                                                                              |
| ~~**UI-9**~~  | ~~概要总览~~                                                  | ~~`SummaryOverviewPage.tsx`~~                               | ~~规范「概要」相关节~~                                               | ~~与 **步 19～22** 一致~~ **✓ 已完成**：顶栏统计与快捷链、工具条搜索（不区分大小写）、`formatSummaryUpdatedAt`、卡片与空态、保存/冲突逻辑未改                                                                                                                                      |
| ~~**UI-10**~~ | ~~占位模块页皮：推演 / 流光 / 问策 / 生辉~~                              | ~~`LogicPage`、`InspirationPage`、`ChatPage`、`ShengHuiPage~~` | ~~`tuiyan-module.tsx` 等~~                                   | ~~与 **步 32～38、46、10** **同节奏**：功能到多少，皮跟多少~~ **✓ 首轮**：**问策** `/chat`：**步 46**；**生辉** `/sheng-hui`：**步 10** 仿写 MVP；**推演** `/logic`：**步 32～34**；**流光** `/inspiration`：**步 35～38**；`hub-module-placeholder-*` 等                          |
| **UI‑V0**     | **第二轮：与 v0 同源渲染**（Tailwind + 与参考一致的 UI primitive；极高相似度目标） | `src/` 逐页替换 §D 首轮外观层，**逻辑仍接 `repo`/路由**                     | `components/ui/*`、各 `*-module.tsx`、`immersive-editor.tsx` 等 | **§E** 分解验收；**生辉** 功能 MVP 已具，**E.2.8** 整页同源渲染与 §B **并行**                                                                                                                                                                            |


### D.2 建议执行顺序（可微调，不必一口吃完）

1. **§E.1 基建**（Tailwind + primitive；可与 **UI-0** 合并首个 PR）— **宜尽早**，不必等 §B 收尾
2. **UI-0**（或与新页改版合并做）
3. **UI-1**（用户最先看到的壳）
4. ~~**UI-2** → **UI-3**（留白动线）~~
5. ~~**UI-6** → **UI-7**（写作主路径 + AI）~~
6. ~~**UI-4**（藏经）~~
7. ~~**UI-5**（设置）~~
8. ~~**UI-9**（概要）~~
9. ~~**UI-8**（本书锦囊）~~
10. ~~**UI-10**（与推演/流光等 **§11** 功能步 **穿插**；避免七页先全部空壳无维护）~~ *首轮皮已上；**第二轮**见 **§E** 逐页同源渲染*
11. **§E.2** 按 `E.2.1`～`E.2.8` 顺序迁移（可与对应页的 §11 功能 PR 交织）

### D.3 数据库与远端推送（门禁）

- **允许先做**：Type / Dexie / `writing-store`* / `supabase-writing-rows` / 仓库内 `supabase/schema.sql`、`backend/migrate.js` 与 **本地** Hybrid 冒烟。  
- **暂缓至阶段验收后**：向 **生产 Supabase**（或共享远端）**执行 DDL、迁移、密钥与环境推送**；以你方 **「本地测试 OK」** 为界。  
- UI 波次 **UI-0～UI-7** 在默认情况下 **不依赖** 远端推送即可在本地完成。

### D.4 代码健康 backlog（全仓自检记录，随规划逐级消化）

> **原则**：**不单开大重构 PR**；在 **触达对应文件做 §11 / UI / AI 功能** 时顺带收一点，或偶尔开 **小范围「卫生」PR**。  
> **验收**：`npm run build` 须保持通过；`npm run lint` **全绿**可作为阶段目标，非阻塞日常合入（与 B 节功能项并行即可）。


| 类别                                         | 发现 / 现状                                                                                          | 建议解决方式（可分批、与相关步合并）                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `**@typescript-eslint/no-explicit-any`**   | 集中在 `src/ai/providers.ts`、`src/ai/storage.ts`、`AiPanel.tsx`、`BackendModelConfigModal.tsx` 等      | 为厂商响应 / JSON 定义 **最小结构类型** 或 `**unknown` + 类型守卫**；改到该文件时顺带替换，不必一次清光                                                                   |
| `**react-hooks/exhaustive-deps`（warning）** | 如 `AiPanel.tsx` 多处 `useMemo`/`useEffect`、`EditorPage.tsx` 快捷键绑定 effect                           | **解构 props** 或抽出 **稳定 `useCallback`** 再补依赖；适合与 **步 3/5/9/15** 等侧栏改版同 PR                                                               |
| `**react-refresh/only-export-components`** | `CodeMirrorEditor.tsx`、`EditorZenContext.tsx` 等：同文件导出常量/非组件                                      | 将 **常量与纯函数** 移到并列 `*.ts` 或 `*-constants.ts`，组件文件 **只 export 组件**                                                                      |
| `**LoginHero`（BlobCharacter）**             | 登录页角色 `**react-hooks/refs`**：渲染期读 `wrapRef` + `getBoundingClientRect`（已用 `eslint-disable` 块标明意图） | 长期可改为 `**useLayoutEffect` + state 保存 DOMRect** 以去掉 disable；**动登录页视觉时**再做                                                              |
| `**EditorShell` 沉浸 / 侧栏**                  | 部分 `setState` 用 `**queueMicrotask`** 以满足当前 `react-hooks/set-state-in-effect` 规则                  | 属 **规则适配**；若 React / eslint 插件升级，再评估是否保留或改数据流                                                                                         |
| `**AppShell` 离开 `/work`**                  | 清空作品上下文用 `**queueMicrotask` + setState**                                                         | 同上；与 **步 14 / 顶栏上下文** 迭代时一并审视                                                                                                         |
| `**workIdFromPath`**                       | 已迁至 `**src/util/workPath.ts`**（避免 AppShell 混导出触发 fast-refresh 规则）                                | **无后续项**（避免重复立项）                                                                                                                      |
| `**WorkFormModal`**                        | 已改为 **打开时挂载子组件 + `key` 同步 initial**，去掉「effect 里灌表单」                                              | **无后续项**                                                                                                                              |
| **Vite build 体积告警**                        | 主 chunk **>500kB** 提示                                                                            | 与 **性能 / 路由级 `import()`** 合并规划，非 UI 波次阻塞项                                                                                             |
| `**/work/.../bible` · `/summary` 抬头层数**    | 曾多一层薄 `**app-topbar`**（节选 id）                                                                    | **已减一层**（`workPath.isWorkBibleOrSummaryPath` → 不渲染 `app-topbar`）。余下 **masthead + 作品子栏 + 页内 `page-header`**；是否与 **步 14** 再合并子栏与页眉待产品决定 |
| `**AiInlineErrorNotice` 漏链**               | 文案含「请先在设置中」「隐私设置」时未出 **打开设置**                                                                    | **已修**：`shouldOfferSettingsLinkForAiError` 增补上述匹配（推演三分支、概要等同类错误受益）                                                                    |


**本轮随工（Living，可与修订记录对照）**

- **UI-1**：`hubPaths` 增补 `**/reference`**，与留白首页径一致，去掉藏经页多余 `**app-topbar`**。  
- **UI-1**：`keyboardHints.shortcutModifierSymbol` + `**Meta/Ctrl+K` → 全局命令面板**（`input/textarea/select/contenteditable` 内不抢键）；顶栏「更多」收纳推演/流光/问策/生辉。  
- **UI-0**：`:root` 增补 **圆角大档 + 字号/行高阶梯** token（`index.css`）。  
- **步 14 相关（小步）**：**本书锦囊 / 概要** 子路由隐藏 `**app-topbar`**（`isWorkBibleOrSummaryPath`）。  
- **步 15**：材料简版 **留白标签** 行：`tagCount` + 与 **system「作品标签侧写」** 表述一致。  
- **UI-1**：顶栏 **通知铃 SVG 占位**（disabled + `title`/`aria-label` 说明暂无业务）。  
- **步 32**：`/logic` **一致性扫描**规则 MVP + `bible-consistency-scan.ts`。  
- **步 33**：`/logic` **三分支预测** + `logic-branch-predict.ts`；**bugfix** `ai-error-routing` 设置链。

### D.5 规划期中修订原则（避免尾期大爆炸）

- **允许**在整体未完工前修订技术栈与清单（如启动 §E）；变更须 **同步本文件** 与 `docs/总体规划-改进版-2026-04.md`，避免口头漂移。  
- **默认禁止**「§11 全部做完再一次性整站换 UI 栈」；**§B + §E** 应 **交错合入**，每步可构建、可回滚。  
- 每波结束：`**npm run build`** + 本波涉及页的 **手测路径**；发布前再对齐 `docs/发布检查清单.md`。

---

## E、UI‑V0 渲染收敛轨（第二轮 · 与 §B 并行）

> **目标**：主应用与 `design/v0-ui-reference` v2.0 `**ui-design-specification.md`** **极高相似度（约 96%～98%）**；**不**合并 Next 子工程构建；业务逻辑仍在 `src/` + `repo`。长篇说明与风险见 `docs/总体规划-改进版-2026-04.md`。  
> **与 §D**：§D 为 **首轮**（CSS 变量 + 手写布局对齐）；本条为 **同源渲染**（Tailwind + 与参考一致的 primitive/组件模式），**逐项替换首轮外观层**。

### E.1 基建（建议首 PR 接 Tailwind；**primitive 可与 E.2 分页交织**，不必等全套 shadcn 再动第一页）

- ~~主工程接入 **Tailwind CSS v4** + `@tailwindcss/vite`（`vite.config.ts`、`src/index.css` 顶部 `@import "tailwindcss"`）；与既有全站 CSS **并存**，新页/改版可混用 utility~~
- ~~建立与 shadcn **等价**的 **Button / Card / Input / Tabs / Dialog** 等 primitive（可从参考工程 **复制结构** 再改 import，**禁止** `import` Next 子目录源码）~~ — 落点：`src/components/ui/`（`button.tsx` + `button-variants.ts`、`card`、`input`、`tabs`、`dialog`）、`src/lib/utils.ts`；依赖：`clsx`、`tailwind-merge`、`class-variance-authority`、`@radix-ui/react-slot` / `react-dialog` / `react-tabs`（版本见 `package.json`）；`index.css` `@theme` 浅色桥接 shadcn token  
- ~~文档：`docs/总体规划-改进版-2026-04.md` **§6.1.1** 已记 §E.1 依赖版本快照与 v0 目录快照说明；日常以 `package.json` 为准~~

### E.2 逐页迁移（勾选 = 该页已按 v0 级视觉验收且功能不退化）

- ~~**E.2.1** `AppShell`、顶栏七模块、`GlobalCommandPalette`、登录全屏壳：顶栏 `z-50`、底边与毛玻璃对齐 v0 `app-shell`；命令面板为「标题区 + 搜索行（放大镜 / `Input` / Esc）」卡片布局；`/login` 无顶栏、仍挂命令面板~~  
- ~~**E.2.2** `HomePage`、`LibraryPage`、`WorkFormModal`：首页 Hub 与「最近作品」等分区卡片化（`border`/`bg-card/30`）；作品库页眉「我的作品」+ 四格统计卡 + v0 式工具条（搜索放大镜/清除、排序、网格·列表分段）；空态「开始你的创作之旅」与网格末「新建作品」虚线卡；`WorkFormModal` 与 v0 `NewWorkDialog` 同构（`DialogHeader`/`Description`/`Footer`、标签区卡片、提示条），数据仍为书名+留白标签~~  
- ~~**E.2.3** `EditorShell`、`EditorPage`、与 `CodeMirrorEditor` **接缝**：`index.css` 去掉 `.editor-scroll-inner` 固定 860px 上限，避免与「宽度：自定义/自适应」冲突；`.editor-paper` 水平居中、`box-sizing`；`cm6-editor` 与 scroller 使用 `min-height` 继承，避免 `height:100%` 在父级仅 `min-height` 时失效；`activeChapter.id` 作 `key` 以章切换时重置视图与滚动；`activeId` 变更后 `requestAnimationFrame` 聚焦正文（`modal-overlay` 打开时不抢焦点）；加载/空作品态版式对齐二轮~~  
- ~~**E.2.4** `AiPanel`、`BackendModelConfigModal`：侧栏「选择模型」与设置「高级后端配置」迁入 Radix `Dialog`（`work-form-modal-overlay` + `--z-modal-app-content`），与 v0 `AIModelSelector`/规范弹层同构（顶部分隔标题区、Esc/遮罩关闭、焦点陷阱）；`ai-panel-head` 分隔线；`model-picker--dialog` / `backend-modal--dialog` 补全高与暗色壳；业务与存储逻辑未改~~  
- ~~**E.2.5** `SettingsPage`：页眉圆角卡片壳（`border`/`bg-card/30`/`shadow-sm`）与页级 `gap`；备份/参考库维护/后端配置等主操作迁 `Button` primitive（`destructive` 清空）；`index.css` 为 `.settings-page-header` 补 `display:flex`（移除对 `.page-header` 的隐式依赖）；侧栏分区导航、锚点哈希、`scroll-margin` 与业务逻辑不变~~  
- ~~**E.2.6** `ReferenceLibraryPage`、`BiblePage`、`SummaryOverviewPage`：三页页眉圆角卡片壳 + `flex`/`gap`；`ReferenceLibraryPage` 导入/工具条/标签与维护/阅读器与摘录操作用 `Button` + 全文检索用 `Input`；`BiblePage` 顶栏与分区 Tab、全书卡片内操作统一 `Button`（`index.css` 为 `.bible-tab-seg` / `.reference-toolbar-seg` 补 `[data-slot="button"].is-on`）；`SummaryOverviewPage` 顶栏与搜索条 `Button`/`Input`；`.reference-page-header` / `.bible-page-header` / `.summary-overview-page-header` 显式 `display:flex`；业务与 `repo` 行为不变~~  
- ~~**E.2.7** `LogicPage`、`InspirationPage`、`ChatPage`：页眉圆角卡片壳 + 页级 `gap`；主操作与链出迁 `Button` primitive（`outline`/`secondary`/`default`）；`index.css` 为 `.logic-page-header` / `.inspiration-page-header` / `.wence-page-header` 显式 `display:flex` + `flex-wrap`；业务与 `repo`/AI 行为不变~~  
- ~~**E.2.8** `ShengHuiPage`：与问策同构的 `wence-page` 页眉壳 + 工具条/生成区 `Button`；空态与加载态与 **E.2.7** 问策页一致；`sheng-hui-generate` 与装配逻辑未改~~

### E.3 每页验收（与 E.2 同行勾选）

- **Smoke**：该页主路径至少 1 条（与迁移前行为一致）  
- **三态**：空态 / 错误或拒绝态 / 长标题或长列表至少目检一屏  
- **构建**：`npm run build` 通过；大 PR 时补相关文件的 lint 卫生（见 §D.4）

### E.4 文档同步

- ~~随迁移更新 `design/v0-ui-reference/README.md` 中 **主应用落点** 与 **备注**（问策/推演/流光等已与现网一致；生辉整页皮仍见 §E.2.8）~~
- ~~**§E.2.7 / E.2.8** 后：`design/v0-ui-reference/README.md`「生辉」行互链为 **§E.2.8 已整页验收~~**

### E.5 全站 v0 深度对齐（≈98% · Living）

> **与 E.2 的关系**：**E.2** = 各页已接 **Tailwind + primitive + 页眉壳/关键块**，功能不退化。**E.5** = 在 **不动业务真源**（`repo` / 路由 / AI 调用语义）前提下，按 `design/v0-ui-reference` 与 `docs/ui-design-specification.md` 把 **布局分区、信息密度、组件层级** 拉到与参考 **约 98%** 一致。  
> **约 2% 余量**（字体渲染、CodeMirror 接缝、极端长文案、微动效等）单列 **抛光 backlog**，**不阻塞** E.5 波次划线；与总体规划 **约 96%～98%** 表述一致。  
> **做法**：主应用为唯一真源；**禁止** `import` Next 子工程源码；对照参考 **复制结构/类名思路** 后接现有数据；**按波次 PR**，每步 `npm run build` + 该页原有 Smoke。详细互链：`docs/UI-v0-对齐任务清单.md` **§「E.5 波次」**。

**波次顺序**（实施侧按表自上而下推进；**先易后难、少并行**，降低回归面）：


| 波次     | 主应用落点                                                    | v0 参考（查阅）                                      | E.5 验收要点（≈98%）                                                                 |
| ------ | -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| **W0** | `AppShell`、`GlobalCommandPalette`、`LoginHero`（登录全屏）      | `app-shell.tsx`、命令面板相关                         | 顶栏七模块/毛玻璃/搜索入口、命令面板卡片布局、登录壳与 v0 **大块**一致；细部入抛光 backlog                         |
| **W1** | `HomePage`、`LibraryPage`、`WorkFormModal`                 | `liubai-module.tsx`                            | Hub 分区、四格统计、工具条、卡片渐变/进度、空态/新建卡与参考 **结构同级**                                     |
| **W2** | `ChatPage`、`ShengHuiPage`                                | `wence-module.tsx`、`shenghui-module.tsx`       | 问策/生辉 **同族布局**（工具区、对话/输出区、空态）；与参考侧栏密度对齐                                        |
| **W3** | `InspirationPage`                                        | `liuguang-module.tsx`                          | 碎片列表/扩容与转入面板 **分区与层次** 对齐                                                      |
| **W4** | `SettingsPage`                                           | `settings-module.tsx`                          | 侧栏分区 + 各区块卡片密度、主操作位                                                            |
| **W5** | `ReferenceLibraryPage`、`BiblePage`、`SummaryOverviewPage` | `cangjing-module.tsx`、`luobi-module` 相关区、概要总览  | 在 E.2.6 骨架上 **补全** 工具条/阅读器/Tab 与参考的 **视觉同级**                                   |
| **W6** | `EditorShell`、`EditorPage`、`AiPanel`（含模型选择）              | `immersive-editor.tsx`、`ai-model-selector.tsx` | 写作双栏/沉浸、侧栏分区、模型卡与参考 **结构同级**（CM 接缝入余量）                                         |
| **W7** | `LogicPage`                                              | `tuiyan-module.tsx`                            | **结构最重**：三栏叙事工作台（左树/中章详情/右工具）等与参考 **分区同级**；数据绑定现有扫描/三分支/本书锦囊源，**不**为对齐单独造未规划业务 |


**E.5 划线规则**：某 **波次** 整体验收通过（对照参考 + 规范、Smoke 通过、build 通过）→ 该波次行可用 ~~删除线~~ 标注完成日期（简写于下表末行或修订记录）。


| 波次     | 状态                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| ~~W0~~ | ~~2026-04-06 已验收（顶栏 v0 品牌符 + masthead 内边距；登录全屏壳随 `--bg`）~~                                                 |
| ~~W1~~ | ~~2026-04-06 已验收（`HomePage`/`LibraryPage`/`WorkFormModal` 圆角壳与卡质感；作品卡 hover）~~                             |
| ~~W2~~ | ~~2026-04-06 已验收（`ChatPage`/`ShengHuiPage`：`.wence-page .card` 分区壳；加载态；功能未改）~~                             |
| ~~W3~~ | ~~2026-04-06 已验收（`InspirationPage`：分区 `card` 壳；列表卡 hover；加载态；功能未改）~~                                       |
| ~~W4~~ | ~~2026-04-06 已验收（`SettingsPage`：`settings-shell` 侧栏 + `settings-section-card` 分区壳与 v0 密度；业务未改）~~           |
| ~~W5~~ | ~~2026-04-06 已验收（`ReferenceLibraryPage`/`BiblePage`/`SummaryOverviewPage`：`.card` 分区壳；加载/空态面板；`repo` 未改）~~ |
| ~~W6~~ | ~~2026-04-06 已验收（`EditorPage` 纸面 `.card`、`EditorShell` 右栏体、`AiPanel` 主分区；装配/保存/Outlet 未改）~~                |
| ~~W7~~ | ~~2026-04-06 已验收（`LogicPage` 页眉/工具条/时间轴·世界观/扫描/三分支分区 `.card`；规则扫描与 AI 分支逻辑未改；未造 v0 三栏假数据）~~                |


---

## F、深度改进建议书 v1 对标（`docs/留白写作-深度改进建议书v1.md`）

> **说明**：与 **§B**、**§E** 并行；分级落地，**非**一次性验收。~~**删除线**~~ = 仓库已具备 **MVP 或等价能力**；其后的 **「后续」** 为报告建议的 **深化/增强**（可与已有步号交织）。**未划线** = 尚未立项，排期见报告 **§八**（P0～P4）。若与 `docs/总体规划-改进版-2026-04.md` 或 §B 步号冲突，**以总体规划与 §B 为准**，本节作需求池与互链。

### F.1 AI 核心（报告 §一）

- ~~**Layer 1 静态本书锦囊**~~：装配器已注入全书/本章锦囊等（步 9/10）  
- ~~**Layer 2 动态摘要**~~：章概要存储与编辑、手动 AI 概要（步 19/20/22）、概要总览页；**后续**：章末/后台 **自动摘要队列**（与步 20「可选自动」合并）、侧栏 context **最近 N 章摘要**滑动窗口（报告 §1.1）  
- ~~**Layer 3 实体状态**~~：**MVP** 步 21「本章人物状态」按章文本 + 装配器注入；**后续**：人物/物品/事件 **Living State** 结构化子页、生成后 **可选自动更新**、与术语一致性联动（报告 §1.1）  
- ~~**Context 体积与可预期性**~~：`approx-tokens`、材料简版（步 15/16）、超限确认、步 27「精简并重试」；**后续**：侧栏 **Token 预算可视化（色块）**、**显式优先级截断链**（与 `docs/ai-context-merge-order.md` 合并落地）、本书锦囊注入前 **压缩版** 与「全量仅按需」（报告 §1.2）  
- **生成与人类改写融合**（报告 §1.3）：侧栏草稿与正文分离 + diff（步 11/12）已降低覆盖风险；**后续**：不可见版本标记、续写前检测「用户已改写」、可选 **风格锚定段**  
- ~~**一致性守门**~~：步 32 **规则**扫描 MVP；**后续**：生成后 **LLM 扫描**、存疑标记、与本书锦囊 **一键对照**（报告 §1.4）  
- ~~**推演三分支**~~：步 33；**后续**：**推演漏斗**（倾向 / 采纳正稿 / 归档流光）、推演 **历史时间轴**（报告 §1.5）

### F.2 现有功能深化（报告 §二）

- ~~**本书锦囊**~~：全链路 + 提示词/笔感/术语（步 41～44）；**决策 #4**：健康度等指标 **一期不展示**；**后续**：若产品重开—**健康度评分**、**按类型推荐字段**、**锦囊字段版本历史**、笔感 **量化对比**（报告 §2.1）  
- ~~**藏经 RAG**~~：索引、阅读器、混合检索、本地安全锁（步 23/24/39～41）；**后续**：召回 **置信度/可解释**、写作中 **相关条浮现**、阅读器 **分层标注**、跨作品共享（报告 §2.2）  
- ~~**问策**~~：步 46 MVP；**后续**：会话 **标签**、结论 **转本书锦囊/流光**、与推演 **一键联动**（报告 §2.3）

### F.3 留白页（报告 §三）

- ~~**首页 / 作品库**~~：Hub、继续创作、统计与 §E.2.2 皮；**后续**：**今日写作快速入口**（上次摘要一眼、今日字数目标）、卡片 **信息密度**（相对时间、章进度、本书锦囊简况）、**创作数据面板**（ streak、各书占比等，本地即可）、全站 **灵感快录入口**、长期未更 **温和提醒**（报告 §3）

### F.4 沉浸式写作（报告 §四）

- ~~**沉浸写作**~~：步 31；**后续**：重入 **热身浮层**（上次停笔句）、沉浸 **信息层级**（顶栏/侧栏收合策略）、**会话字数与今日目标**、可选 **句长节奏条**、停笔 **轻提示**、快捷键 **章切换 / 快录流光**、侧栏 **「本章上下文」折叠卡**、章末 **收笔流程**（摘要+统计）（报告 §4）

### F.5 侧栏 AI（报告 §五）

- ~~**草稿、合并、本会话 token 上限**~~：步 11/12/48；**后续**：**本章多轮指代记忆**、**段落级接受**、**微调力度**、装配器 **注入占比预览与预设**、**本章 AI 调用记录**（报告 §5）

### F.6 各模块深化（报告 §六）

- **流光**：~~数据层 + 快捷键 + 五段 + 转入章~~（步 35～38）；**后续**：自动归类、多碎片 **拼接**、正文 **↔** 碎片互转（报告 §6.1）  
- **推演**：~~扫描 + 三分支 + 时间轴/世界观~~（步 32～34）；**后续**：分支 **血缘图**、导出 **多形态**、**人物视角推演**（报告 §6.2）  
- **生辉**：~~按纲仿写 MVP~~（步 10）；**后续**：风格 **解析报告**、**仿写对比练习**、入口 **版权提示** 强化（报告 §6.3）

### F.7 生态与输出（报告 §七）

- ~~**基础导出**~~：§〇 组已有 TXT/zip 等；**后续**：**docx/epub/平台投稿模板**、外部笔记 **导入**（Readwise 等）、百科/地图/时间轴 **深集成**（中长期）  
- **第二大脑与版本**：Notion/Obsidian **同步**、**章节级版本时间轴**（非 Git 心智）（报告 §7.3）；**社区**：私密读者、写作伙伴（报告 §7.4，远期）

### F.8 优先级与步号衔接（报告 §八）

- **P0（报告）**：Context 策略、自动摘要队列、重入摘要—与 **步 9/15/16/20/27**、`ai-context-merge-order` **合并设计**，避免重复实现  
- **P1～P4**：按专题拆 PR；必要时在 §B **新增子项**或 **步 55+** 编号（待与路线图同步）  
- **验收**：单条深化仍遵循 §E.3 / §B 发版门禁；本节 **不单独** 替代 §B 步号闭环

---

## G、`design/v0-ui-reference` 演示能力 · 增量交付池（与 §B / §E 正交）

> **定位**：对照 v0 子工程中 **mock 交互** 与主应用已交付能力（§B）的差异；本节列为 **功能增量**（接 `repo`/存储），**不是** §E.5 的「换皮」闭项。**原则**：主应用 **唯一真源**；遵守 `docs/决策记录.md` **#2**（问策 / 推演 / 生辉边界）；新表新列须同步 Dexie、`supabase/schema.sql`、备份/合并导入路径。  
> **与 §F**：§F 对齐《深度改进建议书》论述；§G 对齐 **v0 模块级工作流**（可并行立项）。  
> **需产品取舍、与现有 IA 可能冲突** 的条目 **不** 放在 G.1，见 `docs/总体规划-改进版-2026-04.md` **§10** 与下节 **G.2**。

### G.1 非冲突 · 可逐条立项交付（默认与项目收尾同批或按 ID 顺序）


| ID           | 主应用落点                                 | 交付摘要（验收口径）                                                                                                              | 状态                                                                                                                     |
| ------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ~~**G-01**~~ | `ChatPage`                            | ~~**多会话**：新建 / 切换 / 重命名 / 删除；可选按关联作品筛选；持久化（`localStorage` + `wence-chat-sessions.ts`）；仍为「策略对话」语义，**不**承接改纲主流程（改纲在推演）。~~ | ~~2026-04-06 已交付~~                                                                                                     |
| ~~**G-02**~~ | `ChatPage`                            | ~~**快捷问题模板**：一键填入 user 消息（可内置列表 + 后续可配置）。~~                                                                             | ~~2026-04-06 已交付（`wence-chat-templates.ts` + 输入框上方胶囊按钮）~~                                                              |
| ~~**G-03**~~ | `ChatPage`                            | ~~**技法/分析卡（本地）**：用户可保存条目（标题、摘要、标签、可选来源书名）；列表检索；与装配器 **无** 强制自动联动（避免与 #2 混淆）。~~                                          | ~~2026-04-06 已交付（`wence-technique-cards.ts` + 问策页卡片区）~~                                                                |
| ~~**G-04**~~ | `ShengHuiPage`                        | ~~**同章多轮生成快照**：历次输出可列表切换、标注「当前采纳」；写入正文仍经 **写作侧栏 / 合并** 既有路径（见步 11/12），避免双轨合并。~~                                         | ~~2026-04-06 已交付（`sheng-hui-snapshots.ts` + 本机 localStorage）~~                                                         |
| ~~**G-05**~~ | `ShengHuiPage`                        | ~~**生成前粗估**：基于上下文与预计输出长度的 **本地** token/费用提示，可选二次确认；**非**真实计费、**非**上传用量。~~                                               | ~~2026-04-06 已交付（`buildShengHuiChatMessages` + 预留输出粗估 + 与侧栏同阈确认）~~                                                     |
| ~~**G-06**~~ | `InspirationPage`                     | ~~**列表 / 网格视图**切换（仅布局；数据仍为 `InspirationFragment`）。~~                                                                    | ~~2026-04-06 已交付（`liubai:inspirationViewMode` + `.inspiration-card-list--grid`）~~                                      |
| ~~**G-07**~~ | `InspirationPage`                     | ~~**文件夹或集合**（分组碎片）：须 **schema + 迁移 + Hybrid/合并导入** 同步设计。~~                                                              | ~~2026-04-07 已交付（`InspirationCollection`、Dexie v17、Hybrid/备份/合并；流光页筛选·新建·删除·卡片改集合；`InspirationGlobalCapture` 继承上次集合）~~ |
| ~~**G-08**~~ | `InspirationPage`                     | ~~**随机一条**：从当前筛选结果中随机展示（纯本地）。~~                                                                                         | ~~2026-04-06 已交付（滚动定位 + 短暂高亮）~~                                                                                        |
| ~~**G-09**~~ | `ReferenceLibraryPage`                | ~~**与 v0 对齐的查漏补缺**：如收藏-only、批量导出等——以现网已有能力为基，**只补缺口**（避免重复造轮）。~~                                                        | ~~2026-04-06 已交付（本机收藏 `reference-favorites.ts` + 批量 ZIP `reference-batch-export.ts`）~~                                 |
| ~~**G-10**~~ | `SettingsPage`                        | ~~**本地用量展示**：本会话 / 累计 **粗估** tokens（与侧栏 `sidepanel-session-tokens` 等一致口径）；默认 **不上传**；文案与 `privacy` 一致。~~                | ~~2026-04-06 已交付（`#ai-privacy` 区块 + `readLifetimeApproxTokens` / 清零）~~                                                 |
| ~~**G-11**~~ | `EditorShell` / `SettingsPage`        | ~~**沉浸式排版扩展**：字体、行高、护眼等（在步 31 基础上增量；不与 CodeMirror 真源冲突；`editor-typography.ts` + CSS 变量 + 稿纸 `data-paper-tint`）。~~       | ~~2026-04-06 已交付~~                                                                                                     |
| ~~**G-12**~~ | `AiPanel` / `BackendModelConfigModal` | ~~**人设化模型展示层**：将真实可选 `modelId` 映射为「见山类」卡面与说明（**仅 UX**；不引入虚构 API；`model-personas.ts` + 选择器卡面一键填入）。~~                     | ~~2026-04-06 已交付~~                                                                                                     |


### G.2 待决策 / 可能冲突项（不纳入 G.1 直至拍板）

以下议题 **须先选方案** 再拆任务，真源论述见 `**docs/总体规划-改进版-2026-04.md` §10**（选项表与处理建议）。

- **推演内长对话 + 应用改纲** 与 **问策**、**文策日志** 的职责切分。  
- **生辉全屏多版本 IDE** 与 **写作侧栏草稿 / 合并** 的单一写入真理源。  
- **顶栏「落笔」vs 本书锦囊页 vs 正文编辑**：v0 `luobi-module` 曾倾向同屏；当前为 **分路由**（`/work/:id` 与 `/work/:id/bible`），产品叙事见 `design/seven-modules-ui-spec.md` §5/§9。  
- **用量/订阅/商业化大盘** 与 **本地优先、隐私承诺** 的边界。  
- **流光语音 / 图片附件** 与 **备份格式、合并导入、云同步** 的工程成本。

---

## 修订记录


| 日期         | 摘要                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-07 | **§G.1 / 步 36～37**：**G-07** 流光集合；速记 Radix `Dialog`；**步 37** 速记接力、批量粘贴、**扩容粗估/超阈值确认**（与生辉同源）；`Hybrid.updateInspirationFragment` 补 `collectionId`；`master-checklist`（步 37 后续全划）、`UI-v0`、`总体规划-未完项快照` §2.2 同步。      |
| 2026-04-06 | **§G.1**：**G-11** 沉浸式排版（`editor-typography.ts`、`--editor-font-stack` / `--editor-line-height`、写作页稿纸 `data-paper-tint`；设置 `#settings-editor`）；`App.tsx` 启动应用变量；`UI-v0-对齐任务清单` §8/§9 同步。                           |
| 2026-04-06 | **§F**：纳入 `docs/留白写作-深度改进建议书v1.md`—已落地项 ~~划~~ +「后续」深化；未划线为需求池；文首真源互链。                                                                                                                                            |
| 2026-04-05 | 初版：基线 + §11 全表；已划当前仓库已具备项                                                                                                                                                                                        |
| 2026-04-05 | 隐私页补充 Hybrid；步 6 子项增补删除线                                                                                                                                                                                         |
| 2026-04-05 | 技术说明 AI Key 节；AiPanel 错误链设置；决策 #4 拍板；清单同步划掉                                                                                                                                                                      |
| 2026-04-05 | `AiInlineErrorNotice` / `HubAiSettingsHint`；技术说明 fetch 例外；步 3/5 清单更新                                                                                                                                             |
| 2026-04-05 | `docs/ai-context-merge-order.md`；providers 流式注释；互链；步 1/3/10/13 清单更新                                                                                                                                              |
| 2026-04-05 | AiPanel「本次使用材料（简版）」；步 15 清单更新                                                                                                                                                                                    |
| 2026-04-05 | 备份软提醒 + 决策 #1 临时既定 + 步 8/26 清单                                                                                                                                                                                   |
| 2026-04-02 | 步 18：侧栏「抽卡」模式 + 顶栏一键；`assemble-context` 抽卡装配与校验                                                                                                                                                                  |
| 2026-04-02 | 步 27：上下文体积类错误 →「精简并重试」（`AiPanel` + `ai-degrade-retry.ts`）                                                                                                                                                        |
| 2026-04-02 | 步 11/12：侧栏草稿区独立 + 合并前对比弹层（`AiDraftMergeDialog`、`text-line-diff.ts`）                                                                                                                                              |
| 2026-04-02 | 步 19/25：卷/章摘要元数据双轨 + `updatedAt` 乐观锁与冲突 UI（`chapter-save-conflict.ts`）                                                                                                                                           |
| 2026-04-02 | 步 20（部分）：手动 AI 章节概要生成 + 重试（`chapter-summary-generate.ts`）                                                                                                                                                        |
| 2026-04-02 | 步 22：`summaryUpdatedAt` 展示（概要弹窗 + 右侧概要，`summary-meta.ts`）                                                                                                                                                        |
| 2026-04-02 | 步 29：书架卡片封面与进度条（`LibraryPage`、`work-library-stat`、`Work.coverImage`）                                                                                                                                             |
| 2026-04-02 | 步 30：`Work.tags` + 新建/编辑弹窗；装配器 `tagProfileText`；Supabase `work.tags`                                                                                                                                             |
| 2026-04-02 | 步 9 子项：留白标签注入装配器（与步 30 一并落地）                                                                                                                                                                                     |
| 2026-04-02 | 步 31：沉浸写作（`EditorZenContext`、`EditorShell` 顶栏隐藏 + 角标出口）                                                                                                                                                          |
| 2026-04-05 | UI 参考 **v2.0** 覆盖 `design/v0-ui-reference`；总体规划/实施步骤增补 UI 迁移节                                                                                                                                                    |
| 2026-04-06 | **§D**：UI 波次（UI-0～10）+ 建议执行顺序 + 与 §11 并行说明 + 远端推送门禁；文首 UI/DB 原则                                                                                                                                                  |
| 2026-04-06 | **UI-0 / UI-1 首轮落地**：`index.css` 顶栏 token + `AppShell` 对齐 v2 参考（行为不照搬 v0）                                                                                                                                        |
| 2026-04-02 | **UI-2**：`LibraryPage` 搜索·排序·网格/列表、`formatRelativeUpdateMs`、`index.css` 工具条与列表卡片布局；卡片主区与工具栏分离                                                                                                                    |
| 2026-04-02 | **UI-3**：`HomePage` Hub 模块卡（与顶栏 1～7）、「继续创作」、`getWork`+`lastWorkResolved`（失效 `lastWorkId` 时「落笔」回作品库）、相对时间、移除旧 `home-feature-`* 样式                                                                                 |
| 2026-04-02 | **UI-6 / UI-7**：`TopbarContext.setCenterNode`、`EditorShell`/`EditorPage` 顶栏三栏；`AiPanel` 分区卡片与 `ai-panel-body-stack`；`index.css` 右栏与顶栏覆盖层样式                                                                       |
| 2026-04-02 | **UI-4**：`ReferenceLibraryPage` 对齐 v2 藏经阁式顶栏与工具条、网格/列表书目、分区面板与阅读器样式                                                                                                                                              |
| 2026-04-02 | **UI-5**：`SettingsPage` `settings-shell` 侧栏导航、分区 `id` 与哈希、`scroll-margin-top`、卡片化区块                                                                                                                              |
| 2026-04-02 | **UI-9**：`SummaryOverviewPage` 顶栏与工具条、`summaryUpdatedAt` 展示、搜索与空态、样式与步 19～22 一致                                                                                                                                  |
| 2026-04-02 | **UI-8**：`BiblePage` 顶栏与分区 tab（`bible-tab-seg` / `.is-on`）、`tabCounts` 角标、`bible-section-panel`；`index.css` 本书锦囊区块与 `.bible-card:focus-within`                                                                   |
| 2026-04-02 | **UI-10**：`HubModulePlaceholderLayout` + 四占位页；`index.css` `hub-module-placeholder-`* 与 Hub 序号对齐（生辉 6）                                                                                                            |
| 2026-04-02 | **§D.4**：记入全仓自检后的 **lint / React Compiler 规则 / 体积** backlog 与「随触达文件消化」原则；若干项已在自检中小修（`workPath`、`WorkFormModal`、`queueMicrotask` 等）                                                                               |
| 2026-04-02 | **UI-1 补充**：藏经入 `hubPaths`；顶栏 **Ctrl/⌘+K** 打开作品库 + 平台化快捷键文案；**§D.4** 增录 **本书锦囊/概要子页多头顶栏** 待步 14/改版收敛                                                                                                             |
| 2026-04-02 | **UI-0 首轮 token** + **本书锦囊/概要** 去掉薄 `app-topbar`（`workPath.isWorkBibleOrSummaryPath`）；**§D.4** 对应行改为已减一层                                                                                                         |
| 2026-04-02 | **步 15** 子项：`AiPanel` 传 `tagCount`，`buildWritingSidepanelMaterialsSummaryLines` 有标签时展示 **个数 + 侧写字数**，用语与装配器 system 块一致                                                                                           |
| 2026-04-02 | **UI-1**：顶栏 **通知占位按钮**（`MastheadBellIcon` + `app-masthead-bell`，无业务不接 API）                                                                                                                                       |
| 2026-04-02 | **步 32（规则 MVP）**：`LogicPage` + `bible-consistency-scan.ts`；**步 32** 首条子项划线；**UI-10** 行修正推演已非纯占位                                                                                                                  |
| 2026-04-02 | **步 33（三分支 MVP）**：`logic-branch-predict.ts` + `LogicPage` 分支区；**§D.4** 记 `AiInlineErrorNotice` 漏链修复（`ai-error-routing.ts`）                                                                                       |
| 2026-04-02 | **步 34（时间轴极简）**：推演页时间线/世界观面板 + 样式；本书锦囊同源编辑出口                                                                                                                                                                     |
| 2026-04-02 | **步 39**：藏经 PDF 本地解析（`extract-pdf-text.ts`、`ReferenceLibraryPage` 导入 .pdf / 文案与混选限制）                                                                                                                             |
| 2026-04-02 | **步 40**：藏经混合检索（`searchReferenceLibrary` strict/hybrid、`refineHybridHit`、藏经页模式切换、RAG 用 hybrid）                                                                                                                   |
| 2026-04-02 | **步 41**：藏经本地安全锁 UI（`reference-local-lock`、IndexedDB / 不上传 / 与 Hybrid 写作云区分）                                                                                                                                     |
| 2026-04-02 | **步 35（流光碎片）**：`InspirationFragment` 全栈 + `InspirationPage`；`SCHEMA_VERSION` 14；`supabase/schema.sql` / `backend/migrate.js` 建表                                                                                  |
| 2026-04-02 | **步 36（流光快捷键）**：`InspirationGlobalCapture` + `liuguangQuickCaptureShortcutLabel`；流光页/首页文案；「按作品」无作品时空态                                                                                                            |
| 2026-04-02 | **步 37（流光 AI 五段）**：`inspiration-expand.ts` + `InspirationPage` 扩容面板；Abort 后恢复非 busy                                                                                                                              |
| 2026-04-02 | **步 38（流光转入章节）**：`InspirationPage` 追加正文 + 乐观锁冲突提示 + 写作页 deep link                                                                                                                                                |
| 2026-04-02 | **步 45**：`GlobalCommandPalette` + 顶栏「更多」；`⌘/Ctrl+K` 改开面板；登录页同挂面板；**UI-1** 表行更新                                                                                                                                   |
| 2026-04-02 | **步 46**：`/chat` 问策 MVP（`buildWenceChat`*、`ChatPage` 多轮 + sessionStorage）；**UI-10** 表行更新问策非占位                                                                                                                    |
| 2026-04-02 | **步 47/48**：调性提示（`tone-drift-hint.ts`）+ 侧栏本会话 token 上限（`sidepanel-session-tokens.ts`、`AiSettings`）                                                                                                               |
| 2026-04-02 | **规划修订**：新增 `docs/总体规划-改进版-2026-04.md`；文首 UI 目标改为 **96%～98%** + **§E UI‑V0 第二轮**；§D 标「首轮」；增 **§D.5** 期中修订原则；§A 同步决策 #2；修复若干 `~~` 未闭合行；Hub 表增 **UI‑V0** 行                                                         |
| 2026-04-02 | **§E.1（部分）**：Tailwind v4 + Vite 插件；`HubAiSettingsHint` 文案与 utility 混用；§E.1 首条子项划线                                                                                                                                |
| 2026-04-02 | 新增 `docs/UI-v0-对齐任务清单.md`；文首真源、README、`改进版`、`总体规划` v2 头互链                                                                                                                                                        |
| 2026-04-06 | **§E.1**：`@theme` + primitive；顶栏搜索索引；**§E.2.1（部分）**：`GlobalCommandPalette` → Radix `Dialog` + `Input`，`DialogContent.overlayClassName`；**§E.2.2（部分）**：`HomePage` / `LibraryPage` 换 `Button`+`Input`；`UI-v0` 清单同步 |
| 2026-04-02 | **§E.2.2（部分）**：`WorkFormModal`→`Dialog`；首页 Hub `Card`；`work-form-modal-overlay`（`index.css`）                                                                                                                     |
| 2026-04-02 | **§E.2.3（部分）**：`EditorPage` 顶栏主操作区换 `Button`；`EditorShell` 去渲染期写 `commandOpenRef`；`docs/bug-backlog` 增 **规划级**（z-index、步 49～54）                                                                                  |
| 2026-04-02 | **步 1**：修复 README/决策记录互链行 **删除线**；**步 49～54** 补 **可验收子项**（对齐 v2 §11 表与 `docs/发布检查清单.md`）；`docs/bug-backlog` 规划级行更新                                                                                               |
| 2026-04-02 | **§E.4**：`design/v0-ui-reference/README.md` 对照表更新（推演/流光/问策已落地；生辉仍占位）；`LogicPage` / `BackendModelConfigModal` 用户向文案去步号                                                                                            |
| 2026-04-02 | **步 21**：`ChapterBible.characterStateText` + 写作侧栏「本章人物状态」+ 装配器注入；`chapter_bible.character_state`（`schema.sql` / `migrate.js`）                                                                                    |
| 2026-04-02 | **步 3/5/28**：`ai-error-routing` 增 `classifyAiClientError` + 502～504/超时等；**步 28** `docs/context-caching-eval.md`                                                                                                  |
| 2026-04-02 | **步 10** 推演：`formatWorkStyleAndTagProfileBlock` + `LogicPage` 传风格卡/标签；**步 23** `docs/rag-index-design.md`；**步 24** 参考库 MVP 划线                                                                                    |
| 2026-04-02 | **步 10** 生辉：`sheng-hui-generate.ts` + `ShengHuiPage` 按纲仿写流式；清单 §B 步 5/10、§E.2.8、`v0-ui-reference/README`、`UI-v0` §6 同步                                                                                           |
| 2026-04-02 | **步 24**：本书锦囊 / 正文 **运行时** RAG（`work-rag-runtime.ts`）+ 侧栏多源勾选；`docs/rag-index-design.md` §2～3                                                                                                                    |
| 2026-04-02 | **步 49～51**：`docs/性能说明.md` 构建与 smoke；`docs/a11y-known-limitations.md`；`docs/migration-notes.md`；README 互链；**步 52** 一期跳过桌面一句                                                                                      |
| 2026-04-02 | **步 1/2/6/53**：`决策记录` #3 拍板；`开发自检-密钥与日志`；`legal-alignment-notes`；`/privacy` `/terms` 更新；清单划线                                                                                                                     |
| 2026-04-02 | **步 4**：首次 AI 门禁 `first-ai-gate` + `FirstAiGateHost`，`client.ts` 统一包装；各页静默 `FirstAiGateCancelledError`；**步 52** 一期跳过桌面划线；**步 54** `发布检查清单` §7 签字表；`技术说明` 补首次 AI 键名                                               |
| 2026-04-02 | **§E.2.1** 勾选：`index.css` 顶栏 `z-50` + `@supports` 毛玻璃；`GlobalCommandPalette` 标题区 + v0 式搜索行；`UI-v0` §0、`改进版` §6.1、`v0-ui-reference/README` 同步                                                                     |
| 2026-04-02 | **§A / 步 1 / 步 7**：决策记录 #5～7 更新；§A 划线；步 7 Hybrid 划线；**z-index** `--z-`* 变量 + `bug-backlog` / `改进版` §5 / `技术说明` 同步                                                                                                |
| 2026-04-02 | **步 7 / §E.1 / 步 14**：新用户演示包（`register-demo-pack.ts`）；`resolveDefaultChapterId` 统一顶栏「最近」与 `/logic`、`/sheng-hui` 默认章；`docs/总体规划-改进版-2026-04.md` **§6.1.1** 依赖快照；§E.1 文档子项划线                                       |
| 2026-04-02 | **演示包**：`navigator.locks` 防多标签重复注入；缺卷时抛错中止；**清单**：修复多处 `~~` 未闭合；**§C / §E.4** 划线；`v0-ui-reference/README` 增 §E.4 互链一句                                                                                            |
| 2026-04-02 | **步 7 / 步 54 / §D**：`docs/生产环境部署.md` 增 **Supabase Auth** 节；`docs/发布检查清单.md` §0 互链；清单 **步 7、步 54** 划线；**UI-0** 表行划线；再修 `~~` 与 **UI-5** 表元格；`bug-backlog` 规划级行更新                                                   |
| 2026-04-06 | **§E.2.2** 整页勾选：`HomePage` 分区圆角壳；`LibraryPage` 对齐 `liubai-module` 页眉/统计/工具条/空态/新建卡；`WorkFormModal` 头部+脚注+标签卡片区与 v0 同源结构；`docs/总体规划-未完项与质量快照.md` 与 `docs/UI-v0-对齐任务清单.md` 同步。                                     |
| 2026-04-06 | **§E.2.3** 整页勾选：`EditorPage` + `CodeMirrorEditor` 接缝修复（全宽滚动层、CM 最小高度、章级 `key`、切换后焦点）；`docs/总体规划-未完项与质量快照.md` 与 `docs/UI-v0-对齐任务清单.md` 同步。                                                                        |
| 2026-04-06 | **§E.2.4** 整页勾选：`AiPanel` 模型选择器 + `BackendModelConfigModal` → `Dialog`；`index.css` 接缝样式；快照与 `UI-v0` 同步。                                                                                                          |
| 2026-04-06 | **§E.2.5** 整页勾选：`SettingsPage` 页眉壳 + `Button`；`.settings-page-header` `display:flex`；`docs/总体规划-未完项与质量快照.md` 与 `docs/UI-v0-对齐任务清单.md` 同步。                                                                        |
| 2026-04-06 | **§E.2.6** 整页勾选：`ReferenceLibraryPage` / `BiblePage` / `SummaryOverviewPage` 页眉壳 + primitive；`index.css` 三页顶栏与 Tab/工具条 `is-on`；快照与 `UI-v0` 同步。                                                                   |
| 2026-04-06 | **§E.2.7 / E.2.8** 整页勾选：`LogicPage` / `InspirationPage` / `ChatPage` / `ShengHuiPage` 页眉壳 + `Button`；`index.css` 推演/流光/问策页眉 `display:flex`；`v0-ui-reference/README` 生辉行同步；快照与 `UI-v0` 同步。                        |
| 2026-04-06 | **§E.5**：新增全站 v0 **深度对齐（≈98%）** 波次 **W0～W7**（壳→留白→问策/生辉→流光→设置→藏经/本书锦囊/概要→写作→推演）；**≈2%** 抛光单列；`UI-v0-对齐任务清单` 增 §E.5 索引表。                                                                                          |
| 2026-04-06 | **§E.5 W0** 验收：`AppShell` 品牌区与 v0 同源（「留」字 + 渐变壳）；`app-masthead` 水平 `clamp` 内边距；`app-shell--auth-fullbleed` 使用 `var(--bg)`。                                                                                       |
| 2026-04-06 | **§E.5 W1** 验收：`HomePage` 纵向间距与分区阴影；`LibraryPage` 页眉/统计/工具条圆角壳与统计卡 ring；`WorkFormModal` 圆角+ring；`index.css` 作品卡 hover 对齐 v0。                                                                                     |
| 2026-04-06 | **§E.5 W2** 验收：`ChatPage`/`ShengHuiPage` 问策/生辉块级 `card` 视觉壳与加载态面板；`index.css` `.wence-page .card` 分区质感；**不**动流式/停止/repo/隐私逻辑。                                                                                    |
| 2026-04-06 | **§E.5 W3** 验收：`InspirationPage` 筛选/记一条/扩容与转入/列表外层 `card` 与 `.inspiration-page .card`；碎片列表项 hover；加载态面板；**不**动碎片 CRUD、AI 五段、转入章节逻辑。                                                                              |
| 2026-04-06 | **§E.5 W4** 验收：`SettingsPage` `settings-shell` 侧栏 + 主区 `settings-section-card` 与 `index.css` 分区壳对齐 v0 `settings-module` **密度与层次**；备份/AI/表单与 `BackendModelConfigModal` 逻辑未改。                                      |
| 2026-04-06 | **§E.5 W5** 验收：`ReferenceLibraryPage`/`BiblePage`/`SummaryOverviewPage` 三页 `index.css` `**.card` 壳**（藏经安全锁/检索块/命中/维护/阅读器；本书锦囊 Tab+八分区；概要主区）；加载与空态圆角面板；导入/检索/本书锦囊/概要 **逻辑未改**。                                    |
| 2026-04-06 | **§E.5 W6** 验收：`EditorPage` 正文 `editor-paper.card`、`EditorShell` `app-right-body.card`、`AiPanel` 两主 `ai-panel-section.card`；`index.css` 与 W2/W5 分区壳同级；右栏拖拽、侧栏装配、章保存逻辑未改。                                         |
| 2026-04-06 | **§E.5 W7** 验收：`LogicPage` 全路径块级 `card`（加载/空态、页眉、范围工具条、时间轴·世界观、扫描结果、三分支）；`index.css` `.logic-page .card` 与 W2/W6 同级；一致性扫描 / `generateLogicThreeBranches` / 本书锦囊同源时间轴 **逻辑未改**。                                   |
| 2026-04-06 | **§G 新增**：v0 参考 **非冲突** 能力入 `**master-checklist` §G.1** 表（G-01～G-12）；**待决策** 入 `docs/总体规划-改进版-2026-04.md` **§10** 与 §G.2 互链。                                                                                     |
| 2026-04-06 | **§G.1**：**G-06** 列表/网格视图、`**liubai:inspirationViewMode`**；**G-08** 当前筛选下随机一条 + 滚动 + 高亮；`InspirationPage` + `index.css`；无 schema 变更。                                                                             |
| 2026-04-06 | **§G.1**：**G-02** 问策快捷模板；**G-10** 设置「AI（本机）」展示侧栏粗估 token（本会话 + 本机累计）、`sidepanel-session-tokens` 增 lifetime；互链隐私政策。                                                                                               |
| 2026-04-06 | **§G.1**：**G-05** 生辉生成前粗估（`estimateShengHuiRoughTokens` + `resolveInjectionConfirmPrompt` / 合计超阈确认）；`sheng-hui-generate.ts` 抽取 `buildShengHuiChatMessages`。                                                      |
| 2026-04-06 | **§G.1**：**G-01** 问策多会话（`wence-chat-sessions.ts` + `ChatPage`：新建/切换/重命名/删除、按作品筛选、`localStorage` 持久）；与决策 #2 边界一致。                                                                                                 |
| 2026-04-06 | **§G.1**：**G-04** 生辉同章多轮快照（`sheng-hui-snapshots.ts`：按作品+章节桶、采纳标记、删除；生成结束写快照；正文写入仍走侧栏合并）。                                                                                                                         |
| 2026-04-06 | **§G.1**：**G-03** 问策技法/分析卡（`wence-technique-cards.ts`：标题/摘要/标签/来源书名、检索、增删改；与装配器无自动联动）。                                                                                                                           |
| 2026-04-06 | **§G.1**：**G-09** 藏经收藏筛选 + 批量导出 ZIP（`reference-favorites.ts` / `reference-batch-export.ts`；参考书目不随写作云同步）。                                                                                                         |
