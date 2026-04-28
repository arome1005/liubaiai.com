import { useEffect, useState } from "react"
import type { ReferenceChapterHead } from "../db/types"
import { listReferenceChapterHeads } from "../db/repo"

/**
 * 加载单本参考书的章节标题锚点（与 `ReferenceChapterHead.id` 对应，供 `TuiyanReferenceBinding.sectionIds` 勾选）。
 */
export function useTuiyanRefChapterHeads(
  refWorkId: string | null,
  enabled: boolean,
): {
  heads: ReferenceChapterHead[]
  loading: boolean
  error: string | null
} {
  const [heads, setHeads] = useState<ReferenceChapterHead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !refWorkId) {
      setHeads([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void listReferenceChapterHeads(refWorkId)
      .then((list) => {
        if (cancelled) return
        const sorted = [...list].sort((a, b) => a.ordinal - b.ordinal)
        setHeads(sorted)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setHeads([])
        setError("无法加载章节索引")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refWorkId, enabled])

  return { heads, loading, error }
}
