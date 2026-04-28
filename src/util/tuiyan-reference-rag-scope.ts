import type { ReferenceChapterHead, ReferenceSearchHit, TuiyanReferenceBinding } from "../db/types"

/**
 * 需要拉取 `listReferenceChapterHeads` 的参考书：仅「指定章节」且已选至少一个锚点。
 */
export function refWorkIdsNeedingChapterHeadsForRag(
  linkedRefWorkIds: string[],
  referenceBindings: TuiyanReferenceBinding[] | undefined,
): string[] {
  if (!referenceBindings?.length) return []
  const byId = new Map(referenceBindings.map((b) => [b.refWorkId, b]))
  return linkedRefWorkIds.filter((id) => {
    const b = byId.get(id)
    return b?.rangeMode === "selected_sections" && (b.sectionIds?.length ?? 0) > 0
  })
}

/**
 * 对单本参考书：若需按章节锚点限制，返回允许的 `ReferenceChunk.id` 集合。
 * - 非 `selected_sections`：null（不限制块）
 * - `selected_sections` 且未选锚点：null（全书，与策略「未选」一致，检索不收紧）
 * - 已选锚点：仅解析到的 `chunkId`；若一个都解析不到则空集（该书无命中）
 */
export function allowedChunkIdsForReferenceBinding(
  binding: TuiyanReferenceBinding | undefined,
  heads: ReferenceChapterHead[] | undefined,
): Set<string> | null {
  if (!binding) return null
  if (binding.rangeMode !== "selected_sections") return null
  if (!binding.sectionIds?.length) return null
  if (!heads?.length) return new Set()
  const byHeadId = new Map(heads.map((h) => [h.id, h]))
  const out = new Set<string>()
  for (const sid of binding.sectionIds) {
    const h = byHeadId.get(sid)
    if (h) out.add(h.chunkId)
  }
  return out
}

/**
 * 参考 Tab RAG：在已关联书目内，再按每本 `rangeMode` + `sectionIds` 过滤块级命中。
 */
export function filterReferenceSearchHitsBySectionScope(args: {
  hits: ReferenceSearchHit[]
  linkedRefWorkIds: string[]
  referenceBindings: TuiyanReferenceBinding[] | undefined
  /** 仅需包含「需要按章节限制」的 refWorkId 的 heads；其余 id 可缺省。 */
  chapterHeadsByRefWorkId: Map<string, ReferenceChapterHead[]>
}): ReferenceSearchHit[] {
  const { hits, linkedRefWorkIds, referenceBindings, chapterHeadsByRefWorkId } = args
  const linked = new Set(linkedRefWorkIds)
  if (!referenceBindings?.length) {
    return hits.filter((h) => linked.has(h.refWorkId))
  }
  const byRef = new Map(referenceBindings.map((b) => [b.refWorkId, b]))
  return hits.filter((h) => {
    if (!linked.has(h.refWorkId)) return false
    const b = byRef.get(h.refWorkId)
    const heads = chapterHeadsByRefWorkId.get(h.refWorkId)
    const allowed = allowedChunkIdsForReferenceBinding(b, heads)
    if (allowed === null) return true
    if (allowed.size === 0) return false
    return allowed.has(h.chunkId)
  })
}
