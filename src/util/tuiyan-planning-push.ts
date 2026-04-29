/**
 * 推演「推送到写作章纲」的纯函数：按子树根过滤候选项等。
 */

export type PlanningPushCandidateLike = {
  id: string
  parentId: string | null
}

/**
 * 推送范围：`full` 为整树；`subtrees` 为多个子树根的**并集**（可只含 1 个 id，即与单选子树等价）。
 */
export type TuiyanPushSubtreeScope = { kind: "full" } | { kind: "subtrees"; rootIds: string[] }

/**
 * 判断 `nodeId` 是否等于 `rootId`，或是否为其子孙（沿 `parentId` 向上能到达的链中含 `rootId` 作为祖先，含自身）。
 */
function isInSubtree(
  nodeId: string,
  rootId: string,
  byId: Map<string, PlanningPushCandidateLike>,
): boolean {
  let cur: string | null = nodeId
  const seen = new Set<string>()
  while (cur) {
    if (seen.has(cur)) return false
    seen.add(cur)
    if (cur === rootId) return true
    const parent = byId.get(cur)?.parentId ?? null
    cur = parent
  }
  return false
}

/**
 * 按推送范围过滤候选项：整树，或多个子树根对应子树的并集（去重）。
 * `subtrees.rootIds` 中若含无效 id 则跳过；若最终无有效根则返回 `[]`。
 */
export function filterPlanningPushCandidatesBySubtreeScope<T extends PlanningPushCandidateLike>(
  candidates: T[],
  scope: TuiyanPushSubtreeScope,
): T[] {
  if (scope.kind === "full") return candidates.slice()
  const rootIds = scope.rootIds.filter(Boolean)
  if (rootIds.length === 0) return []
  const byId = new Map<string, PlanningPushCandidateLike>(candidates.map((c) => [c.id, c]))
  const include = new Set<string>()
  for (const rootId of rootIds) {
    if (!byId.has(rootId)) continue
    for (const c of candidates) {
      if (isInSubtree(c.id, rootId, byId)) include.add(c.id)
    }
  }
  return candidates.filter((c) => include.has(c.id))
}
