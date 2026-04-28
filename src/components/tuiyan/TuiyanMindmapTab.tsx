import { useMemo, useRef } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from "reactflow"
import "reactflow/dist/style.css"
import { Download, Plus, RefreshCw } from "lucide-react"
import { toPng } from "html-to-image"
import { Button } from "../ui/button"

const EMPTY_NODE_TYPES: NodeTypes = {}
const EMPTY_EDGE_TYPES: EdgeTypes = {}

export type TuiyanMindmapTabProps = {
  /** 大纲是否为空（外部判断；空时只展示占位） */
  outlineEmpty: boolean
  nodes: Node[]
  edges: Edge[]
  viewport: Viewport
  onNodesChange: (next: (prev: Node[]) => Node[]) => void
  onEdgesChange: (next: (prev: Edge[]) => Edge[]) => void
  onViewportChange: (vp: Viewport) => void
  /** 用于 PNG 文件命名 */
  exportTitle: string
  /** 「重新构建」按钮：从作品当前结构刷新导图（无 workId 时禁用） */
  canReload: boolean
  onReload: () => void
}

export function TuiyanMindmapTab({
  outlineEmpty,
  nodes,
  edges,
  viewport,
  onNodesChange,
  onEdgesChange,
  onViewportChange,
  exportTitle,
  canReload,
  onReload,
}: TuiyanMindmapTabProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const rfNodeTypes = useMemo(() => EMPTY_NODE_TYPES, [])
  const rfEdgeTypes = useMemo(() => EMPTY_EDGE_TYPES, [])

  if (outlineEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        暂无卷章数据
      </div>
    )
  }

  const handleAddNode = () => {
    onNodesChange((prev) => [
      ...prev,
      {
        id: `n-${Date.now()}`,
        position: { x: 40, y: 40 },
        data: { label: "新节点" },
      },
    ])
  }

  const handleExportPng = async () => {
    const el = wrapRef.current
    if (!el) return
    const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2 })
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = `推演导图-${exportTitle || "export"}.png`
    a.click()
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div ref={wrapRef} className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={rfNodeTypes}
          edgeTypes={rfEdgeTypes}
          onNodesChange={(chs: NodeChange[]) =>
            onNodesChange((nds) => applyNodeChanges(chs, nds))
          }
          onEdgesChange={(chs: EdgeChange[]) =>
            onEdgesChange((eds) => applyEdgeChanges(chs, eds))
          }
          onConnect={(c: Connection) =>
            onEdgesChange((eds) => addEdge(c, eds))
          }
          defaultViewport={viewport}
          onMoveEnd={(_, vp) => onViewportChange(vp)}
          fitView
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>

      <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border/45 bg-card/90 p-2 shadow-2xl backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          type="button"
          onClick={handleAddNode}
          title="新增节点"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          type="button"
          disabled={!canReload}
          onClick={onReload}
          title="从作品结构重建"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-xs"
          type="button"
          onClick={() => void handleExportPng()}
        >
          <Download className="h-4 w-4" />
          导出 PNG
        </Button>
      </div>
    </div>
  )
}
