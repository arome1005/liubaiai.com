import { useCallback, useState } from "react"
import type { PlanningScale } from "../util/tuiyan-planning"
import { normalizePlanningThickness, type PlanningThickness } from "../util/tuiyan-planning-thickness"
import {
  readPlanningScaleFromStorage,
  readPlanningThicknessFromStorage,
  writePlanningScaleToStorage,
  writePlanningThicknessToStorage,
} from "../util/tuiyan-planning-prefs-storage"

/**
 * 五层规划「规模 + 各层最低字数」：本地持久化，供推演页与 `useTuiyanPlanningActions` 校验一致。
 */
export function useTuiyanPlanningPreferences() {
  const [planningScale, setPlanningScale] = useState<PlanningScale>(readPlanningScaleFromStorage)
  const onPlanningScaleChange = useCallback((s: PlanningScale) => {
    setPlanningScale(s)
    writePlanningScaleToStorage(s)
    setPlanningThickness((prev) => {
      const n = normalizePlanningThickness(prev, s)
      writePlanningThicknessToStorage(n)
      return n
    })
  }, [])

  const [planningThickness, setPlanningThickness] = useState<PlanningThickness>(readPlanningThicknessFromStorage)
  const onPlanningThicknessChange = useCallback((p: PlanningThickness) => {
    const n = normalizePlanningThickness(p, planningScale)
    setPlanningThickness(n)
    writePlanningThicknessToStorage(n)
  }, [planningScale])

  return { planningScale, onPlanningScaleChange, planningThickness, onPlanningThicknessChange }
}
