import { PLANNING_MIN_CHARS } from "./tuiyan-planning"
import type { TuiyanPlanningNode } from "../db/types"

/**
 * 推演五层：除章细纲/详细细纲外，用户可配置「与校验/提示词一致」的最低字数；章细纲/详细细纲为产品约束，同样写入请求与失败提示。
 * 与 `tuiyan-planning-generate` / `useTuiyanPlanningActions` 共用。
 */
export type PlanningThickness = {
  /** 总纲：仅摘要等统计用「不含标点」口径，与现校验一致 */
  masterOutlineMinNoPunct: number
  /** 一级大纲：3 条合计，含标点 */
  outlineTotalWithPunct: number
  /** 每卷卷纲，含标点 */
  volumeWithPunct: number
  /** 每条章细纲：标题+摘要+结构化字段合并后，含标点；用于提示词与落树后校验 */
  chapterOutlineMinPerNodeWithPunct: number
  /** 详细细纲：整段输出（含 ```json 与后文）含标点最低 */
  detailMinTotalWithPunct: number
}

export const DEFAULT_PLANNING_THICKNESS: PlanningThickness = {
  masterOutlineMinNoPunct: PLANNING_MIN_CHARS.masterOutlineNoPunct,
  outlineTotalWithPunct: PLANNING_MIN_CHARS.outlineTotalWithPunct,
  volumeWithPunct: PLANNING_MIN_CHARS.volumeWithPunct,
  chapterOutlineMinPerNodeWithPunct: 200,
  detailMinTotalWithPunct: 600,
}

export const PLANNING_THICKNESS_LIMITS = {
  masterOutlineMinNoPunct: { min: 500, max: 5000 } as const,
  outlineTotalWithPunct: { min: 1200, max: 20000 } as const,
  volumeWithPunct: { min: 800, max: 8000 } as const,
  chapterOutlineMinPerNodeWithPunct: { min: 100, max: 2000 } as const,
  detailMinTotalWithPunct: { min: 400, max: 8000 } as const,
} as const

function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

export function normalizePlanningThickness(partial: Partial<PlanningThickness> | undefined): PlanningThickness {
  const b = { ...DEFAULT_PLANNING_THICKNESS, ...partial }
  return {
    masterOutlineMinNoPunct: clampN(
      b.masterOutlineMinNoPunct,
      PLANNING_THICKNESS_LIMITS.masterOutlineMinNoPunct.min,
      PLANNING_THICKNESS_LIMITS.masterOutlineMinNoPunct.max,
    ),
    outlineTotalWithPunct: clampN(
      b.outlineTotalWithPunct,
      PLANNING_THICKNESS_LIMITS.outlineTotalWithPunct.min,
      PLANNING_THICKNESS_LIMITS.outlineTotalWithPunct.max,
    ),
    volumeWithPunct: clampN(
      b.volumeWithPunct,
      PLANNING_THICKNESS_LIMITS.volumeWithPunct.min,
      PLANNING_THICKNESS_LIMITS.volumeWithPunct.max,
    ),
    chapterOutlineMinPerNodeWithPunct: clampN(
      b.chapterOutlineMinPerNodeWithPunct,
      PLANNING_THICKNESS_LIMITS.chapterOutlineMinPerNodeWithPunct.min,
      PLANNING_THICKNESS_LIMITS.chapterOutlineMinPerNodeWithPunct.max,
    ),
    detailMinTotalWithPunct: clampN(
      b.detailMinTotalWithPunct,
      PLANNING_THICKNESS_LIMITS.detailMinTotalWithPunct.min,
      PLANNING_THICKNESS_LIMITS.detailMinTotalWithPunct.max,
    ),
  }
}

/** 弹窗内高亮：即将被下一次「生成」约束的档（与当前树选中节点一致） */
export type PlanningThicknessKey = keyof PlanningThickness

export function planningNextThicknessKey(selected: TuiyanPlanningNode | null): PlanningThicknessKey {
  if (!selected) return "masterOutlineMinNoPunct"
  switch (selected.level) {
    case "master_outline":
      return "outlineTotalWithPunct"
    case "outline":
      return "volumeWithPunct"
    case "volume":
      return "chapterOutlineMinPerNodeWithPunct"
    case "chapter_outline":
    case "chapter_detail":
      return "detailMinTotalWithPunct"
    default:
      return "masterOutlineMinNoPunct"
  }
}

const THICKNESS_LABEL: Record<PlanningThicknessKey, string> = {
  masterOutlineMinNoPunct: "总纲",
  outlineTotalWithPunct: "一级大纲（条数合计，见规模设置中的条数）",
  volumeWithPunct: "卷纲（每卷）",
  chapterOutlineMinPerNodeWithPunct: "章细纲（每条·标题+摘要+结构化信息）",
  detailMinTotalWithPunct: "详细细纲（整段，含 JSON 与正文）",
}

/**
 * @param outlineItemCount 与「规模」中一级大纲条数一致，用于高亮行文案
 */
export function planningNextThicknessLabel(
  selected: TuiyanPlanningNode | null,
  outlineItemCount: number = 3,
): string {
  const key = planningNextThicknessKey(selected)
  if (key === "outlineTotalWithPunct") {
    return `一级大纲（${outlineItemCount} 条合计·最低字数）`
  }
  return THICKNESS_LABEL[key]
}
