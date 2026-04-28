import { useCallback, useRef, useState } from "react"
import type { KnowledgeExtractInput } from "../ai/tuiyan-knowledge-extract"
import { applyPlanningKnowledgeToLibrary } from "../ai/tuiyan-planning-knowledge-apply"
import type { useToast } from "../components/ui/use-toast"
import type { TuiyanPlanningLevel } from "../db/types"
import type { AutoLinkItem } from "../util/tuiyan-chip-autolink"

type ToastFn = ReturnType<typeof useToast>["toast"]

export type PlanningKnowledgeOfferPayload = {
  level: TuiyanPlanningLevel
  autoLinkItems: AutoLinkItem[]
  extractInputs: KnowledgeExtractInput[]
}

type Args = {
  workId: string | null
  runAutoLink: (items: AutoLinkItem[]) => void
  bumpChipLibRefreshKey: () => void
  toast: ToastFn
}

/**
 * 任一层级规划（总纲…详细细纲）成功生成后：问是否用模型将人物/词条写满书斋，再衔接「生成即入库」chip 合并。
 */
export function useTuiyanPostPlanningKnowledgeOffer({
  workId,
  runAutoLink,
  bumpChipLibRefreshKey,
  toast,
}: Args) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [activeLevel, setActiveLevel] = useState<TuiyanPlanningLevel | null>(null)
  const pendingRef = useRef<PlanningKnowledgeOfferPayload | null>(null)

  const offerAfterPlanningLevel = useCallback((payload: PlanningKnowledgeOfferPayload) => {
    pendingRef.current = payload
    setActiveLevel(payload.level)
    setOpen(true)
  }, [])

  const runSkip = useCallback(() => {
    const p = pendingRef.current
    pendingRef.current = null
    setOpen(false)
    setActiveLevel(null)
    if (p) runAutoLink(p.autoLinkItems)
  }, [runAutoLink])

  const onConfirmEnrich = useCallback(async () => {
    const p = pendingRef.current
    if (!p) {
      setOpen(false)
      setActiveLevel(null)
      return
    }
    if (!workId) {
      pendingRef.current = null
      setOpen(false)
      setActiveLevel(null)
      return
    }
    setBusy(true)
    try {
      const st = await applyPlanningKnowledgeToLibrary(workId, p.extractInputs)
      bumpChipLibRefreshKey()
      runAutoLink(p.autoLinkItems)
      const parts: string[] = [
        `人物 新增 ${st.characters.added}、更新 ${st.characters.updated}`,
        `词条 新增 ${st.terms.added}、更新 ${st.terms.updated}`,
      ]
      toast({ title: "已写入书斋", description: parts.join(" · ") })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误"
      toast({ title: "书斋未写入", description: msg, variant: "destructive" })
    } finally {
      setBusy(false)
      pendingRef.current = null
      setOpen(false)
      setActiveLevel(null)
    }
  }, [workId, runAutoLink, bumpChipLibRefreshKey, toast])

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) return
      if (busy) return
      if (pendingRef.current) runSkip()
    },
    [busy, runSkip],
  )

  return {
    postPlanningKnowledgeOpen: open,
    postPlanningKnowledgeBusy: busy,
    postPlanningKnowledgeLevel: activeLevel,
    offerAfterPlanningLevel,
    onPostPlanningSkip: runSkip,
    onPostPlanningEnrich: onConfirmEnrich,
    onPostPlanningOpenChange: onOpenChange,
  }
}
