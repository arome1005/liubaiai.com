import type { Edge, Node } from "reactflow"
import type { TuiyanPlanningLevel, TuiyanPlanningNode } from "../db/types"
import { listPlanningChildren, planningNodeTitleFallback } from "./tuiyan-planning"

/**
 * 默认导图布局参数。
 * 横向按层级展开（root → master_outline → outline → volume），
 * 纵向按子节点顺序均匀排布。
 */
const COL_GAP_X = 240
const ROW_GAP_Y = 110
const ROOT_X = 0
const ROOT_Y = 0

const LEVEL_X: Record<TuiyanPlanningLevel, number> = {
  master_outline: COL_GAP_X,
  outline: COL_GAP_X * 2,
  volume: COL_GAP_X * 3,
  // 章细纲层级不参与默认导图，避免节点爆炸；保留字段满足类型
  chapter_outline: COL_GAP_X * 4,
  chapter_detail: COL_GAP_X * 5,
}

type V0VolumeLike = { id: string; title: string }

/** 从五层规划树构建默认导图：作品根 → master_outline → outline → volume。 */
export function buildPlanningTreeMindmap(
  rootLabel: string,
  planningTree: TuiyanPlanningNode[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "work",
      type: "default",
      position: { x: ROOT_X, y: ROOT_Y },
      data: { label: rootLabel },
    },
  ]
  const edges: Edge[] = []

  const masters = listPlanningChildren(planningTree, null, "master_outline")
  if (masters.length === 0) return { nodes, edges }

  // 各层节点高度估算：以最深叶子（volume）数量为基准做纵向居中。
  // 这里用一种简单的「逐层堆叠」方式：每个父节点占用与其后代叶子数等高的纵向区间。
  const computeLeafCount = (parentId: string, level: TuiyanPlanningLevel): number => {
    if (level === "volume") return 1
    const nextLevel: TuiyanPlanningLevel =
      level === "master_outline" ? "outline" : "volume"
    const children = listPlanningChildren(planningTree, parentId, nextLevel)
    if (children.length === 0) return 1
    return children.reduce((sum, c) => sum + computeLeafCount(c.id, nextLevel), 0)
  }

  let cursorY = 0
  const totalLeaves = masters.reduce((sum, m) => sum + computeLeafCount(m.id, "master_outline"), 0)
  const startY = -((totalLeaves - 1) * ROW_GAP_Y) / 2
  cursorY = startY

  const placeNode = (
    n: TuiyanPlanningNode,
    parentNodeId: string,
    leafSpan: number,
  ) => {
    const y = cursorY + ((leafSpan - 1) * ROW_GAP_Y) / 2
    nodes.push({
      id: n.id,
      position: { x: LEVEL_X[n.level], y },
      data: { label: n.title || planningNodeTitleFallback(n.level, n.order) },
    })
    edges.push({ id: `e-${parentNodeId}-${n.id}`, source: parentNodeId, target: n.id })
  }

  for (const m of masters) {
    const mLeaves = computeLeafCount(m.id, "master_outline")
    placeNode(m, "work", mLeaves)
    const outlines = listPlanningChildren(planningTree, m.id, "outline")
    if (outlines.length === 0) {
      cursorY += mLeaves * ROW_GAP_Y
      continue
    }
    for (const o of outlines) {
      const oLeaves = computeLeafCount(o.id, "outline")
      placeNode(o, m.id, oLeaves)
      const volumes = listPlanningChildren(planningTree, o.id, "volume")
      if (volumes.length === 0) {
        cursorY += oLeaves * ROW_GAP_Y
        continue
      }
      for (const v of volumes) {
        placeNode(v, o.id, 1)
        cursorY += ROW_GAP_Y
      }
    }
  }

  return { nodes, edges }
}

/** 简单备用导图：仅以卷为子节点（保留旧逻辑用于无规划树时的兜底）。 */
export function buildVolumesOnlyMindmap(
  rootLabel: string,
  vols: V0VolumeLike[],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "work",
      type: "default",
      position: { x: 0, y: 0 },
      data: { label: rootLabel },
    },
  ]
  const edges: Edge[] = []
  const gapY = 120
  const gapX = 260
  for (let i = 0; i < vols.length; i++) {
    const v = vols[i]!
    const side = i % 2 === 0 ? -1 : 1
    const row = Math.floor(i / 2)
    nodes.push({
      id: v.id,
      position: { x: side * gapX, y: (row - Math.max(0, Math.floor(vols.length / 4))) * gapY },
      data: { label: v.title },
    })
    edges.push({ id: `e-work-${v.id}`, source: "work", target: v.id })
  }
  return { nodes, edges }
}

/**
 * 推演导图的「默认结构」总入口：
 * - 优先用五层规划树：master_outline → outline → volume；
 * - 五层规划树为空时，回退到按卷章树的卷构建（旧行为）。
 */
export function buildDefaultTuiyanMindmap(
  rootLabel: string,
  planningTree: TuiyanPlanningNode[],
  volumesFallback: V0VolumeLike[],
): { nodes: Node[]; edges: Edge[] } {
  const hasPlanning = planningTree.some((n) => n.level === "master_outline" || n.level === "outline" || n.level === "volume")
  if (hasPlanning) {
    return buildPlanningTreeMindmap(rootLabel, planningTree)
  }
  return buildVolumesOnlyMindmap(rootLabel, volumesFallback)
}
