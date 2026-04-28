import type { TuiyanPlanningLevel } from "../db/types"
import { PLANNING_LEVEL_LABEL } from "./tuiyan-planning"

/**
 * P0 第十四批：与 `makePlanningContext(level, …)` / `useTuiyanPlanningActions` 五层 id 一一对应，供人工打勾与代码检索。
 *（不改运行时代码路径，仅单一事实源。）
 */
export const TUIYAN_REFERENCE_P0_MAKE_PLANNING_CONTEXT_LEVELS: readonly {
  level: TuiyanPlanningLevel
  label: string
}[] = [
  { level: "master_outline", label: PLANNING_LEVEL_LABEL.master_outline },
  { level: "outline", label: PLANNING_LEVEL_LABEL.outline },
  { level: "volume", label: PLANNING_LEVEL_LABEL.volume },
  { level: "chapter_outline", label: PLANNING_LEVEL_LABEL.chapter_outline },
  { level: "chapter_detail", label: PLANNING_LEVEL_LABEL.chapter_detail },
] as const

/**
 * 同样经 `merge*Tuiyan*ReferenceHardRules` / `userHint` 与参考策略块对齐的**非**五层 list/detail 直调入口。
 */
export const TUIYAN_REFERENCE_P0_AUX_TOUCHPOINTS = [
  { id: "planning_advisor_chat", label: "推演规划顾问（右侧 AI 对话）", module: "ai/tuiyan-planning-chat" },
  { id: "logic_three_branch", label: "三分支续写/预测", module: "ai/logic-branch-predict" },
] as const
