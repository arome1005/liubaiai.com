# AI 上下文合并顺序（写作侧栏 vs 装配器 v1）

> **用途**：落实总体规划 **§11 步 9～10** 与 `design/implementation-steps.md` 附录 C；**装配器正式落地前**，以本文 + `src/ai/assemble-context.ts` 为真源。  
> **冲突规则**（总体规划 §3.5.3）：用户显式 **圣经 / 风格卡** 优先于泛化 **标签 profile**（标签未接入 AiPanel 前仅作规划）。

---

## 1. 目标顺序（装配器 v1，待与生辉/推演对齐）

1. 系统级短约束（助手人设、输出格式）
2. **用户显式**：勾选圣经条目、风格卡全文、笔感样本（若有）
3. **作品标签 → 内部 profile**（抽象技法，短预算；不向用户展开全文）
4. 任务描述（用户提示词 / 模式模板）
5. 上下文：章摘要、邻章、RAG 块（按优先级截断）
6. 用户消息：当前正文节选 / 选区

---

## 2. 当前实现：`AiPanel`（`src/components/AiPanel.tsx`）

与上表 **不完全一致**，属历史演进结果；迁移装配器时按 §1 收敛。

侧栏 **「本次使用材料（简版）」** 与 **实际请求** 共用 `src/ai/assemble-context.ts` 中的 `buildWritingSidepanelInjectBlocks` / `buildWritingSidepanelMessages`（同一套隐私与截断规则）；材料列表文案另见 `buildWritingSidepanelMaterialsSummaryLines`。


| 块   | 角色        | 内容要点                                                                                      |
| --- | --------- | ----------------------------------------------------------------------------------------- |
| A   | `system`  | 助手基线两句 + **风格卡**（人称/调性/禁用词/额外规则）                                                          |
| B   | `user` 前段 | **上下文**：作品名、章名（受隐私开关）、文风锚点、笔感样本、故事背景、角色/关系、**本章圣经**（目标/禁止/视角/场景）、技能预设、**术语表**（元数据许可）、关联摘录 |
| B   | `user` 中段 | 最近章概要、**全书圣经 Markdown**（可选）、RAG 命中片段                                                      |
| B   | `user` 后段 | 当前正文 / 章概要 / 选区（模式与隐私控制）+ 用户额外要求 + **任务**句                                                |


**预留**：`assemble-context.ts` 中 `tagProfileText` 尚未拼入 AiPanel；落地后插入 **system 末尾或 user 前段**，且遵守 §3.5.3 优先级。

**步 18 · 抽卡（`mode: draw`）**：不向 user 消息追加「额外要求」；`user` 后段改为 **章节概要（大纲）** 与/或 **前文末尾**（`takeTailText`），至少一种且须通过 `validateDrawCardRequest`（含云端上传范围）。

### 2.1 问策 `/chat`（步 46）

- **单条 `system`**：`buildWenceChatSystemContent` — 问策角色与「推演改纲」分工说明；若关联作品且云端允许元数据，则追加与侧栏同源的 **风格卡 + 标签侧写** 行，以及书名；可选 **设定索引**（人物/世界观/术语名录，截断）。
- **多轮 `user` / `assistant`**：由页面维护；每次请求为 `buildWenceChatApiMessages(system, turns)` + `generateWithProviderStream`。
- **不上传**：章正文、全书圣经全文、RAG（MVP 未接）；与写作侧栏 **场景不同**，勿混用 `buildWritingSidepanelMessages`。

---

## 3. 流式输出（`generateWithProviderStream`）

详见 `src/ai/providers.ts` 中 `**generateWithProviderStream` 上方注释**。

- **SSE 真流式**：OpenAI 兼容路径、Ollama。  
- **整段回退**：Anthropic、Gemini（当前走非流式 `generateWithProvider`，UI 仍通过 `onDelta` 一次性填充的行为以实际代码为准）。

---

## 4. 超时与取消

- 当前**无**应用层固定超时秒数；依赖用户「取消」与 `AbortController`。  
- 后续可在 `src/ai/client.ts` / `providers.ts` 增加可选 `timeoutMs`（`AbortSignal.any` 合并用户 signal）。

---

## 修订记录


| 日期         | 摘要                                             |
| ---------- | ---------------------------------------------- |
| 2026-04-05 | 初版：目标顺序、AiPanel 对照、流式/超时索引                     |
| 2026-04-02 | 写作侧栏拼装迁入 `assemble-context.ts`（预览与 `run()` 同源） |
| 2026-04-02 | 步 18：抽卡模式装配与校验说明                               |
