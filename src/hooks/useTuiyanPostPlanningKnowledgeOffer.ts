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
 * 任一层级规划（总纲…详细细纲）成功生成后：问是否用模型为人物/词条卡补简要信息。
 *
 * 选「是」：调 `applyPlanningKnowledgeToLibrary` → 直接 upsert 到 `BibleCharacter` /
 * `BibleGlossaryTerm` 表（与写作页书斋是同一张表），完成后：
 *   1. `bumpChipLibRefreshKey()` → 规划页 chip 自动从「未入库」切到「已入库 · 自带卡片信息」
 *   2. `runAutoLink(autoLinkItems)` → 仅当用户开了「生成即入库」时，再跑一次 chip 名/句级 autoLink
 *      （处理 enrich 没覆盖到的 chip，例如纯地名/势力字段）
 *   3. 写作页 → 书斋 → 立即可见（无需任何额外开关）
 *
 * 选「先不生成」：与此前一致，只跑 `runAutoLink`（受「生成即入库」开关控制）。
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
      const charTotal = st.characters.added + st.characters.updated
      const termTotal = st.terms.added + st.terms.updated
      const parts: string[] = []
      if (charTotal > 0) parts.push(`人物 ${charTotal}`)
      if (termTotal > 0) parts.push(`词条 ${termTotal}`)
      const summary = parts.length > 0 ? parts.join(" · ") : "无新增内容"
      toast({
        title: "已写入书斋",
        description: `${summary} · 写作页书斋已同步`,
      })
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
