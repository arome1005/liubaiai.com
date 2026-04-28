import { useCallback, type Dispatch, type SetStateAction } from "react"
import type {
  TuiyanReferenceAspect,
  TuiyanReferenceBinding,
  TuiyanReferencePolicy,
} from "../db/types"
import { TUIYAN_REFERENCE_POLICY_VERSION, withPrimaryRefWorkId } from "../util/tuiyan-reference-policy"

export type UseTuiyanReferenceConfigResult = {
  updatePolicy: (patch: Partial<TuiyanReferencePolicy>) => void
  setPrimaryRef: (refWorkId: string) => void
  updateBinding: (
    refWorkId: string,
    patch: Partial<Pick<TuiyanReferenceBinding, "role" | "aspects" | "rangeMode" | "note" | "sectionIds">>,
  ) => void
  toggleAspect: (refWorkId: string, aspect: TuiyanReferenceAspect) => void
}

/**
 * 推演「参考」Tab：每书 binding 与全局 referencePolicy 的更新器（纯 setState 封装）。
 */
export function useTuiyanReferenceConfig(
  setReferenceBindings: Dispatch<SetStateAction<TuiyanReferenceBinding[]>>,
  setReferencePolicy: Dispatch<SetStateAction<TuiyanReferencePolicy>>,
): UseTuiyanReferenceConfigResult {
  const updatePolicy = useCallback(
    (patch: Partial<TuiyanReferencePolicy>) => {
      setReferencePolicy((prev) => ({ ...prev, ...patch, version: TUIYAN_REFERENCE_POLICY_VERSION }))
    },
    [setReferencePolicy],
  )

  const setPrimaryRef = useCallback(
    (refWorkId: string) => {
      const now = Date.now()
      setReferenceBindings((prev) => withPrimaryRefWorkId(prev, refWorkId, now))
    },
    [setReferenceBindings],
  )

  const updateBinding = useCallback(
    (
      refWorkId: string,
      patch: Partial<Pick<TuiyanReferenceBinding, "role" | "aspects" | "rangeMode" | "note" | "sectionIds">>,
    ) => {
      setReferenceBindings((prev) => {
        const now = Date.now()
        let next = prev.map((b) => (b.refWorkId === refWorkId ? { ...b, ...patch, updatedAt: now } : b))
        if (patch.role === "primary") {
          next = withPrimaryRefWorkId(next, refWorkId, now)
        }
        return next
      })
    },
    [setReferenceBindings],
  )

  const toggleAspect = useCallback(
    (refWorkId: string, aspect: TuiyanReferenceAspect) => {
      setReferenceBindings((prev) =>
        prev.map((b) => {
          if (b.refWorkId !== refWorkId) return b
          const has = b.aspects.includes(aspect)
          const nextAspects = has ? b.aspects.filter((a) => a !== aspect) : [...b.aspects, aspect]
          if (nextAspects.length === 0) return b
          return { ...b, aspects: nextAspects, updatedAt: Date.now() }
        }),
      )
    },
    [setReferenceBindings],
  )

  return { updatePolicy, setPrimaryRef, updateBinding, toggleAspect }
}
