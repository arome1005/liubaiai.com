import { useCallback, type Dispatch, type SetStateAction } from "react"
import type { Edge, Node, Viewport } from "reactflow"
import type { useToast } from "../components/ui/use-toast"
import type { TuiyanPlanningNode } from "../db/types"
import { buildDefaultTuiyanMindmap } from "../util/tuiyan-default-mindmap"

type ToastFn = ReturnType<typeof useToast>["toast"]

export type TuiyanMindmapOutlineNode = {
  id: string
  title: string
  type: string
}

export type UseTuiyanMindmapActionsArgs = {
  outline: TuiyanMindmapOutlineNode[]
  planningTree: TuiyanPlanningNode[]
  workTitle: string
  setMmNodes: Dispatch<SetStateAction<Node[]>>
  setMmEdges: Dispatch<SetStateAction<Edge[]>>
  setMmViewport: Dispatch<SetStateAction<Viewport>>
  toast: ToastFn
}

export type UseTuiyanMindmapActionsResult = {
  rebuildMindmapFromPlanning: () => void
}

/** 导图动作：按当前五层规划树（无则回退卷章树）重建默认导图。 */
export function useTuiyanMindmapActions({
  outline,
  planningTree,
  workTitle,
  setMmNodes,
  setMmEdges,
  setMmViewport,
  toast,
}: UseTuiyanMindmapActionsArgs): UseTuiyanMindmapActionsResult {
  const rebuildMindmapFromPlanning = useCallback(() => {
    const vols = outline
      .filter((n) => n.type === "volume")
      .map((v) => ({ id: v.id, title: v.title }))
    const built = buildDefaultTuiyanMindmap(workTitle, planningTree, vols)
    setMmNodes(built.nodes)
    setMmEdges(built.edges)
    setMmViewport({ x: 0, y: 0, zoom: 1 })
    toast({ title: "已按规划树重建导图" })
  }, [outline, planningTree, workTitle, setMmNodes, setMmEdges, setMmViewport, toast])

  return { rebuildMindmapFromPlanning }
}
