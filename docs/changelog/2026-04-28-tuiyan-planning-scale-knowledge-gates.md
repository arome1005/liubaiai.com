# 推演页 · 分大纲/分卷规模 + 各层规划后书斋知识门控（2026-04-28）

> 给复查用：本文件写清**目标、做法、文件、未动范围、怎么验**。索引见 [README.md](./README.md)。

## 目标

- **规模**：一级大纲可单独设「目标卷数」；每个卷纲可单独设「本卷章细纲条数」；未设时回退全局滑块默认值；持久化到作品 `tuiyan_state`（IndexedDB + Supabase 列）。
- **书斋**：总纲 / 一级大纲 / 卷纲 / 章细纲 / 详细细纲在**该层生成成功**后弹窗询问是否用模型做知识抽取并写入书斋（人物 + 词条）；选「否」则行为与改前一致，仅受「生成即入库」控制 chip 合并；选「是」再 `runAutoLink` 并刷新 chip；**重生卷**成功同样弹窗。
- **约束**：未改 `EditorPage.tsx` / `AiPanel.tsx`；不动既有 UI 区域位置；对外接口以增量为主（如 `useTuiyanAutoLink` 增加 `bumpChipLibRefreshKey`）。

## 背景（实现前）

- 已有：全局 `PlanningScale` 滑块；生成章细纲 `desiredCount` 共用 `chaptersPerVolume`；总纲后仅 `runAutoLink` 或首次实现的仅总纲书斋弹窗。
- 缺口：无法按大纲/按卷定制规模；下游层仍只有名/句 chip 入库，未统一提供「是否抽全量书斋」门控。

## 本次改动

### 1. 分大纲 / 分卷规模

- **类型 / 工具**：`TuiyanState` 增加 `planningOutlineTargetVolumesByNodeId`、`planningVolumeTargetChaptersByNodeId`；`src/util/tuiyan-planning.ts` 增加 `resolveOutlineTargetVolumeCount`、`resolveVolumeTargetChapterCount` 与 clamp。
- **生成管线**：`useTuiyanPlanningActions` 在卷纲上限、章细纲 `desiredCount`、提示文案处使用上述解析值。
- **UI**：`TuiyanPlanningUnifiedPanel` 高级设置中「分大纲/分卷」数字输入；主按钮与 `x/y 卷已生成` 使用当前一级大纲解析目标卷数。
- **持久化**：`buildTuiyanUpsertPayload`、IndexedDB/Supabase；`supabase/schema.sql` + `patch-2026-04-28-tuiyan-per-node-scale.sql`；删规划树时清理对应 id。

### 2. 各层书斋门控

- **抽取与写入**：`src/ai/tuiyan-planning-knowledge-apply.ts` — `applyPlanningKnowledgeToLibrary(workId, extractInputs[])`，内部 `extractKnowledgeFromNodes` + `upsertBibleCharactersByWork` / `upsertBibleGlossaryTermsByWork`。
- **门控 hook**：`src/hooks/useTuiyanPostPlanningKnowledgeOffer.ts`（原仅总纲版本已合并泛化）。
- **弹窗**：`src/components/tuiyan/TuiyanPostPlanningKnowledgeDialog.tsx` — 标题随 `TuiyanPlanningLevel` 变化；章细纲层提示多节点串行耗时。
- **规划动作**：`useTuiyanPlanningActions` 用 `onPlanningLevelKnowledgeOffer` 替代仅总纲回调；`master/outline/volume/chapter_outline/chapter_detail` 与 `regenerateCurrentVolume` 在成功末支接入；`chapter_detail` 合并 `planningStructuredMetaByNodeId` 与本次 `detailMeta` 作为抽取输入。
- **AutoLink**：`useTuiyanAutoLink` 增加 `bumpChipLibRefreshKey`，供仅模型写库时仍刷新 chip 区。

## 未改动范围

- 未在抽 prompt 中自动注入「全书斋既有卡片」全文（仍依赖书斋 upsert 合并与各级正文）；写作页 / Ai 侧栏未改。

## 验证建议

1. 推演：高级设置里改分大纲目标卷数、选中卷后改章细纲条数，生成并确认条数/提示与 DB 恢复。
2. 每层规划生成结束后应出现书斋弹窗；选是/否与「生成即入库」开关组合符合预期。
3. `npx tsc --noEmit`；Supabase 已有库需执行 `planning_*_per_node` 的 patch（若用云端库）。

## 相关文件清单


| 文件                                                                     | 角色                       |
| ---------------------------------------------------------------------- | ------------------------ |
| `src/util/tuiyan-planning.ts`                                          | clamp / resolve 分大纲·分卷规模 |
| `src/db/types.ts`                                                      | `TuiyanState` 新字段        |
| `src/hooks/useTuiyanPersistence.ts`                                    | 持久化 payload              |
| `src/storage/writing-store-indexeddb.ts` / `writing-store-supabase.ts` | 读写过库                     |
| `supabase/schema.sql` / `patch-2026-04-28-tuiyan-per-node-scale.sql`   | 云端列                      |
| `src/components/tuiyan/TuiyanPlanningUnifiedPanel.tsx`                 | 规模 UI                    |
| `src/hooks/useTuiyanPlanningActions.ts`                                | 生成与门控、重生卷                |
| `src/ai/tuiyan-planning-knowledge-apply.ts`                            | 书斋 apply                 |
| `src/hooks/useTuiyanPostPlanningKnowledgeOffer.ts`                     | 弹窗状态与确认流                 |
| `src/components/tuiyan/TuiyanPostPlanningKnowledgeDialog.tsx`          | 弹窗                       |
| `src/hooks/useTuiyanAutoLink.ts`                                       | `bumpChipLibRefreshKey`  |
| `src/pages/V0TuiyanPage.tsx`                                           | 接线、删树清 map               |
