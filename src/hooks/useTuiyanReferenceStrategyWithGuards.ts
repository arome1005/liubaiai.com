import { useMemo } from "react"
import type { ReferenceLibraryEntry, TuiyanReferenceBinding, TuiyanReferencePolicy } from "../db/types"
import { collectReferenceAssemblyWarnings, safeBuildReferenceStrategyBlock } from "../util/tuiyan-reference-assembly-guard"
import { formatTuiyanReferenceAssemblySummary } from "../util/tuiyan-reference-assembly-summary"

/**
 * 推演「参考策略块」+ 预检摘要：带装配提醒与 `buildReferenceStrategyBlock` 安全降级，避免在页面内堆 useMemo。
 */
export function useTuiyanReferenceStrategyWithGuards(args: {
  planningIdeaTrimmedLength: number
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[]
  effectiveReferencePolicy: TuiyanReferencePolicy
  refLibrary: ReferenceLibraryEntry[]
  hasReferenceStrategyEnabled: boolean
}): {
  referenceStrategyBlock: string
  referenceAssemblySummaryLines: string[]
  referenceAssemblyHardError: string | null
} {
  const {
    planningIdeaTrimmedLength,
    linkedRefWorkIds,
    referenceBindings,
    effectiveReferencePolicy,
    refLibrary,
    hasReferenceStrategyEnabled,
  } = args
  return useMemo(() => {
    const guardLines = collectReferenceAssemblyWarnings({ linkedRefWorkIds, refLibrary })
    const { block, errorMessage } = safeBuildReferenceStrategyBlock({
      linkedRefWorkIds,
      referenceBindings,
      referencePolicy: effectiveReferencePolicy,
      refLibrary,
    })
    const referenceStrategyBlock = hasReferenceStrategyEnabled && !errorMessage ? block : ""
    const referenceAssemblyHardError =
      hasReferenceStrategyEnabled && errorMessage ? errorMessage : null
    const referenceAssemblySummaryLines = formatTuiyanReferenceAssemblySummary({
      planningIdeaTrimmedLength,
      linkedRefWorkIds,
      referenceBindings,
      referencePolicy: effectiveReferencePolicy,
      refLibrary,
      assemblyGuardLines: guardLines,
    })
    return {
      referenceStrategyBlock,
      referenceAssemblySummaryLines,
      referenceAssemblyHardError,
    }
  }, [
    effectiveReferencePolicy,
    hasReferenceStrategyEnabled,
    linkedRefWorkIds,
    planningIdeaTrimmedLength,
    referenceBindings,
    refLibrary,
  ])
}
