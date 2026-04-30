import { DEFAULT_PLANNING_SCALE, type PlanningScale } from "./tuiyan-planning"
import { DEFAULT_PLANNING_THICKNESS, normalizePlanningThickness, type PlanningThickness } from "./tuiyan-planning-thickness"

export const TUIYAN_PLANNING_SCALE_LS_KEY = "liubai:tuiyan:planningScale:v1" as const
export const TUIYAN_PLANNING_THICKNESS_LS_KEY = "liubai:tuiyan:planningThickness:v1" as const

export function readPlanningScaleFromStorage(): PlanningScale {
  try {
    const saved = localStorage.getItem(TUIYAN_PLANNING_SCALE_LS_KEY)
    if (saved) return { ...DEFAULT_PLANNING_SCALE, ...(JSON.parse(saved) as PlanningScale) }
  } catch {
    /* ignore */
  }
  return DEFAULT_PLANNING_SCALE
}

export function writePlanningScaleToStorage(s: PlanningScale): void {
  localStorage.setItem(TUIYAN_PLANNING_SCALE_LS_KEY, JSON.stringify(s))
}

export function readPlanningThicknessFromStorage(): PlanningThickness {
  try {
    const saved = localStorage.getItem(TUIYAN_PLANNING_THICKNESS_LS_KEY)
    if (saved) return normalizePlanningThickness(JSON.parse(saved) as Partial<PlanningThickness>)
  } catch {
    /* ignore */
  }
  return DEFAULT_PLANNING_THICKNESS
}

export function writePlanningThicknessToStorage(t: PlanningThickness): void {
  localStorage.setItem(TUIYAN_PLANNING_THICKNESS_LS_KEY, JSON.stringify(t))
}
