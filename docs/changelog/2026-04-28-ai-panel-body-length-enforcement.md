# 写作侧栏 · 正文字数程序侧加强（续写 + max output）（2026-04-28）

> 给复查用：本文件写清**目标、做法、文件、未动范围、怎么验**。索引见 [README.md](./README.md)。

## 目标

- **与「生成正文」弹窗的对应关系**：`OutlineGenerationDialog` 中 **「正文字数设定」**（及持久化到 `loadChapterTargetWordCount` 的 `targetWordCount`）在实现前**仅**通过 `composedUserHint` 以自然语言影响模型，**无**程序侧计量与补全；本次让该数字同时驱动 **API 层 `max_output` 粗算** 与（在允许的模式下）**偏短时的自动续写**，从「软提示」提升为**可复查的程序侧闭环**（仍**不是**「必达 N 字」的数学硬保证，大模型与厂商截断仍可能导致偏差）。
- 在「本章正文生成」等场景下，除上述外：若仍明显偏短，对**正文向技能**（`outline` / `continue` / `rewrite`）自动再发 1～2 轮**续写**；多轮对话保留上下文，续写 `user` 条重申细纲/目标字数带（无细纲时走文案兜底）。
- 约束：`EditorPage.tsx` 未改；`AiPanel.tsx` 仅接线；逻辑落在 `src/ai/`、`src/components/ai-panel/`。弹窗布局与对外 props 未改。

## 背景（实现前）

- 已有能力：`targetWordCount` 仅进入 `composedUserHint`（含【字数】段），**无**与 `max_tokens` / `max_completion_tokens` 等联动；部分后端（如 Anthropic 直连）流式**固定**较小 `max_tokens`，易在目标较长时先被截断。
- 缺口：弹窗所填字数**无**「写完后按 `wordCount` 自检 → 不足再要一轮」的逻辑；用户感知的「约束力」几乎等于提示词强度。

## 本次改动

### 1. 输出 token 预算与达标判断

- **文件**：`src/ai/writing-body-output-budget.ts`
- **内容**：`estimateMaxOutputTokensForTargetChineseChars`、`outlineBodyLengthSatisfied`（约 88% 目标即停）、`OUTLINE_BODY_CONTINUATION_MAX_ROUNDS`（3 轮）、`clampStreamMaxOutputTokens` 上限等。

### 2. 续写条与多轮 `messages`

- **文件**：`src/ai/writing-body-continuation-messages.ts`
- **内容**：`buildOutlineContinuationUserContent`、`extendMessagesWithContinuationRound`（在完整 `messages` 后追加 `assistant` + `user(续写)`）。

### 3. 仅「正文扩写」子集开多轮

- **文件**：`src/ai/writing-body-multi-round-modes.ts`
- **内容**：`writingSkillModeUsesBodyMultiRound` — 仅 `outline` / `continue` / `rewrite`；`summarize` / `draw` 仍单轮，但可带目标字数的 max output 粗算。

### 4. 多轮编排 hook

- **文件**：`src/components/ai-panel/useAiPanelOutlineBodyStreamRun.ts`
- **内容**：首包 + 不足则续写；每轮 `executeStream` 中间轮不写历史、不 `done`；收尾 `onPostAllRounds` 一次写历史并 `done`。

### 5. 流式执行与透传 max output

- **文件**：`src/components/ai-panel/useAiPanelStreamingRun.ts` — `ExecuteStreamInput` 增加 `maxOutputTokens`、`recordDraftHistory`、`dispatchDonePhase`；返回 `ExecuteStreamResult`。
- **文件**：`src/ai/client.ts`、`src/ai/providers.ts`、`src/ai/providers-sidecar.ts` — 流式请求透传 `maxOutputTokens`（OpenAI 兼容 `max_tokens`、小米 `max_completion_tokens`、Anthropic、Gemini、Ollama `num_predict`、sidecar 可选 `max_tokens`）。

### 6. 面板接线

- **文件**：`src/components/AiPanel.tsx`
- **内容**：`useAiPanelOutlineBodyStreamRun(executeStream)`；无 `input` 时走 `runOutlineBodyWithContinuation`；有 `input`（重试上一请求）时单轮并带目标字数 max；`onPostAllRounds` 内 `pushGeneratedDraftHistory` + `dispatchGenPhase(done)`。

## 未改动范围

- `EditorPage.tsx`、对外 `AiPanel` props/路由未改；未改各技能任务文案模板本体（`assemble-context` 任务句仍照旧）。

## 验证建议

1. 侧栏 `outline` + 目标字数 2000：观察是否多轮、合稿字数是否更接近目标（仍受模型影响，非 100% 保证）。
2. `draw` / `summarize` + 目标字数：确认仅单轮、无多段续写历史重复。
3. `npx tsc --noEmit`

## 相关文件清单


| 文件                                                          | 角色                          |
| ----------------------------------------------------------- | --------------------------- |
| `src/ai/writing-body-output-budget.ts`                      | 目标字数 → max output 粗算、轮数、达标比 |
| `src/ai/writing-body-continuation-messages.ts`              | 续写 user 文、拼多轮消息             |
| `src/ai/writing-body-multi-round-modes.ts`                  | 多轮白名单模式                     |
| `src/components/ai-panel/useAiPanelOutlineBodyStreamRun.ts` | 多轮与收尾回调                     |
| `src/components/ai-panel/useAiPanelStreamingRun.ts`         | 流式入参/返回、历史与 phase 控制        |
| `src/ai/client.ts`                                          | 透传 `maxOutputTokens`        |
| `src/ai/providers.ts`                                       | 各后端流式补全 max output          |
| `src/ai/providers-sidecar.ts`                               | sidecar 可选 `max_tokens`     |
| `src/components/AiPanel.tsx`                                | 接线                          |
