import { useState, useEffect, useCallback } from "react"
import type { ReferenceSearchHit, TuiyanReferenceBinding } from "../db/types"
import { listReferenceChapterHeads } from "../db/repo"
import { getWritingStore } from "../storage/instance"
import { formatTuiyanReferenceRagErrorMessage } from "../util/tuiyan-reference-search-errors"
import {
  filterReferenceSearchHitsBySectionScope,
  refWorkIdsNeedingChapterHeadsForRag,
} from "../util/tuiyan-reference-rag-scope"

export type UseTuiyanReferenceRagSearchArgs = {
  linkedRefWorkIds: string[]
  /** 与每本「指定章节」锚点配合，限制 RAG 命中块 */
  referenceBindings?: TuiyanReferenceBinding[]
  /** 与「节点关键词预填」同步，切换节点时清空结果与错误 */
  resetKey: string
}

/**
 * 推演参考 Tab：关联书目内 RAG 检索状态（结果 / 加载 / 可观测错误）。
 */
export function useTuiyanReferenceRagSearch({
  linkedRefWorkIds,
  referenceBindings,
  resetKey,
}: UseTuiyanReferenceRagSearchArgs) {
  const [ragResults, setRagResults] = useState<ReferenceSearchHit[]>([])
  const [ragLoading, setRagLoading] = useState(false)
  const [ragError, setRagError] = useState<string | null>(null)

  useEffect(() => {
    setRagResults([])
    setRagError(null)
  }, [resetKey, linkedRefWorkIds, referenceBindings])

  const dismissRagError = useCallback(() => {
    setRagError(null)
  }, [])

  const runRagSearch = useCallback(
    async (qRaw: string) => {
      const q = qRaw.trim()
      if (!q || linkedRefWorkIds.length === 0) return
      setRagLoading(true)
      setRagError(null)
      setRagResults([])
      try {
        const store = getWritingStore()
        const allHits = await store.searchReferenceLibrary(q, { limit: 48, mode: "hybrid" })
        const needHeadIds = refWorkIdsNeedingChapterHeadsForRag(linkedRefWorkIds, referenceBindings)
        const chapterHeadsByRefWorkId = new Map(
          await Promise.all(
            needHeadIds.map(async (id) => {
              const heads = await listReferenceChapterHeads(id)
              return [id, heads] as const
            }),
          ),
        )
        const scoped = filterReferenceSearchHitsBySectionScope({
          hits: allHits,
          linkedRefWorkIds,
          referenceBindings,
          chapterHeadsByRefWorkId,
        })
        setRagResults(scoped.slice(0, 8))
      } catch (e) {
        setRagResults([])
        setRagError(formatTuiyanReferenceRagErrorMessage(e))
      } finally {
        setRagLoading(false)
      }
    },
    [linkedRefWorkIds, referenceBindings],
  )

  return { ragResults, ragLoading, ragError, runRagSearch, dismissRagError }
}
