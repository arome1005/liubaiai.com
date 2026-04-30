import {
  PLANNING_MIN_CHARS,
  clampPlanningOutlineItemCount,
  DEFAULT_PLANNING_SCALE,
  type PlanningScale,
} from "./tuiyan-planning"
import type { TuiyanPlanningNode } from "../db/types"

/**
 * 推演五层：用户可配置「与校验/提示词一致」的最低字数（含标点，见各字段说明）。
 * 与 `tuiyan-planning-generate` / `useTuiyanPlanningActions` 共用。
 *
 * 一级大纲「合计」下限 = {@link PLANNING_OUTLINE_MIN_PER_ITEM_WITH_PUNCT} × 一级大纲条数（规模设置）。
 */
export type PlanningThickness = {
  /** 总纲：标题+摘要+结构化字段合并后，含标点 */
  masterOutlineMinWithPunct: number
  /** 一级大纲多条合计，含标点（不得低于 600×条数） */
  outlineTotalWithPunct: number
  /** 每卷卷纲，含标点 */
  volumeWithPunct: number
  /** 每条章细纲：标题+摘要+结构化字段合并后，含标点 */
  chapterOutlineMinPerNodeWithPunct: number
  /** 详细细纲：整段输出（含 ```json 与后文）含标点最低 */
  detailMinTotalWithPunct: number
}

/** 一级大纲每条最低字数（含标点）；合计下限 = 本条 × 规模中的「一级大纲条数」 */
export const PLANNING_OUTLINE_MIN_PER_ITEM_WITH_PUNCT = 600

export type PlanningThicknessKey = keyof PlanningThickness

/** 一级大纲合计字数的硬性下限（随条数变化） */
export function planningOutlineTotalMinWithPunct(outlineItemCount: number): number {
  return PLANNING_OUTLINE_MIN_PER_ITEM_WITH_PUNCT * clampPlanningOutlineItemCount(outlineItemCount)
}

export const DEFAULT_PLANNING_THICKNESS: PlanningThickness = {
  masterOutlineMinWithPunct: PLANNING_MIN_CHARS.masterOutlineWithPunct,
  outlineTotalWithPunct: planningOutlineTotalMinWithPunct(DEFAULT_PLANNING_SCALE.outlineItemCount),
  volumeWithPunct: PLANNING_MIN_CHARS.volumeWithPunct,
  chapterOutlineMinPerNodeWithPunct: 200,
  detailMinTotalWithPunct: 800,
}

/** 静态上限；一级大纲「合计」下限见 {@link planningOutlineTotalMinWithPunct} */
export const PLANNING_THICKNESS_LIMITS = {
  masterOutlineMinWithPunct: { min: 500, max: 5000 } as const,
  outlineTotalWithPunct: { max: 20000 } as const,
  volumeWithPunct: { min: 800, max: 8000 } as const,
  chapterOutlineMinPerNodeWithPunct: { min: 200, max: 2000 } as const,
  detailMinTotalWithPunct: { min: 800, max: 8000 } as const,
} as const

function clampN(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/** 读本地存储时的中间类型：旧版曾用 masterOutlineMinNoPunct（不含标点口径） */
export type PlanningThicknessMigrationInput = Partial<PlanningThickness> & {
  masterOutlineMinNoPunct?: number
}

/** 单字段钳位；一级大纲合计需传入当前规模以计算合计下限 */
export function clampPlanningThicknessField(
  key: PlanningThicknessKey,
  raw: number,
  scale: PlanningScale = DEFAULT_PLANNING_SCALE,
): number {
  if (key === "outlineTotalWithPunct") {
    const lo = planningOutlineTotalMinWithPunct(scale.outlineItemCount)
    const hi = PLANNING_THICKNESS_LIMITS.outlineTotalWithPunct.max
    return clampN(raw, lo, hi)
  }
  const lim = PLANNING_THICKNESS_LIMITS[key] as { min: number; max: number }
  return clampN(raw, lim.min, lim.max)
}

export function normalizePlanningThickness(
  partial: PlanningThicknessMigrationInput | undefined,
  scale: PlanningScale = DEFAULT_PLANNING_SCALE,
): PlanningThickness {
  const b = { ...DEFAULT_PLANNING_THICKNESS, ...partial }
  const legacyMaster = partial?.masterOutlineMinNoPunct
  const masterRaw =
    partial?.masterOutlineMinWithPunct ??
    (legacyMaster !== undefined ? legacyMaster : b.masterOutlineMinWithPunct)

  const outlineLo = planningOutlineTotalMinWithPunct(scale.outlineItemCount)

  return {
    masterOutlineMinWithPunct: clampN(
      masterRaw,
      PLANNING_THICKNESS_LIMITS.masterOutlineMinWithPunct.min,
      PLANNING_THICKNESS_LIMITS.masterOutlineMinWithPunct.max,
    ),
    outlineTotalWithPunct: clampN(
      b.outlineTotalWithPunct,
      outlineLo,
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
export function planningNextThicknessKey(selected: TuiyanPlanningNode | null): PlanningThicknessKey {
  if (!selected) return "masterOutlineMinWithPunct"
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
      return "masterOutlineMinWithPunct"
  }
}

const THICKNESS_LABEL: Record<PlanningThicknessKey, string> = {
  masterOutlineMinWithPunct: "总纲",
  outlineTotalWithPunct: "一级大纲（3 条合计）",
  volumeWithPunct: "卷纲（每卷）",
  chapterOutlineMinPerNodeWithPunct: "章细纲（每条·标题+摘要+结构化信息）",
  detailMinTotalWithPunct: "详细细纲（整段，含 JSON 与正文）",
}

export function planningNextThicknessLabel(selected: TuiyanPlanningNode | null): string {
  return THICKNESS_LABEL[planningNextThicknessKey(selected)]
}
