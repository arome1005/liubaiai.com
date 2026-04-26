import { useMemo, useState } from "react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { ScrollArea } from "../ui/scroll-area"
import type { TuiyanPlanningLevel } from "../../db/types"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"

export type TuiyanPlanningPushCandidate = {
  id: string
  parentId: string | null
  level: TuiyanPlanningLevel
  order: number
  title: string
  content: string
}

export type TuiyanPlanningPushDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: TuiyanPlanningPushCandidate[]
  onConfirmPush: () => Promise<void>
}

type TreeNode = TuiyanPlanningPushCandidate & { children: TreeNode[] }

function buildTree(candidates: TuiyanPlanningPushCandidate[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const c of candidates) byId.set(c.id, { ...c, children: [] })
  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order)
    for (const n of nodes) sortChildren(n.children)
  }
  sortChildren(roots)
  return roots
}

const LEVEL_COUNT_ORDER: TuiyanPlanningLevel[] = [
  "master_outline",
  "outline",
  "volume",
  "chapter_outline",
  "chapter_detail",
]

/** 推演 → 写作章纲：一键推送整棵五层规划树到写作编辑页「章纲」栏。 */
export function TuiyanPlanningPushDialog({
  open,
  onOpenChange,
  candidates,
  onConfirmPush,
}: TuiyanPlanningPushDialogProps) {
  const [busy, setBusy] = useState(false)

  const tree = useMemo(() => buildTree(candidates), [candidates])
  const counts = useMemo(() => {
    const map: Record<TuiyanPlanningLevel, number> = {
      master_outline: 0,
      outline: 0,
      volume: 0,
      chapter_outline: 0,
      chapter_detail: 0,
    }
    for (const c of candidates) map[c.level] += 1
    return map
  }, [candidates])

  const push = async () => {
    if (candidates.length === 0) return
    setBusy(true)
    try {
      await onConfirmPush()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(86vh,760px)] w-[min(94vw,1040px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/40 px-6 py-4 text-left">
          <DialogTitle>推送到写作章纲</DialogTitle>
          <DialogDescription>
            整棵五层规划（总纲 → 一级大纲 → 卷纲 → 章细纲 → 详细细纲）会作为章纲快照写入写作编辑页左侧「章纲」栏。不会创建章节，也不会动章节正文。
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/40 px-6 py-3 text-xs text-muted-foreground">
          {LEVEL_COUNT_ORDER.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/40 px-2 py-0.5">
              <span className="text-foreground/70">{PLANNING_LEVEL_LABEL[lv]}</span>
              <span className="text-foreground">{counts[lv]}</span>
            </span>
          ))}
          <span className="ml-auto text-amber-400">本次推送会整体覆盖上一次快照。</span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-5 text-sm">
            {tree.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-muted-foreground">
                当前规划树为空。请先在推演页生成总纲 / 大纲 / 卷纲 / 细纲。
              </div>
            ) : (
              tree.map((root) => <TreeRow key={root.id} node={root} depth={0} />)
            )}
          </div>
        </ScrollArea>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            推送后在写作编辑页切到「章纲」即可点击查看任一层内容。
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              取消
            </Button>
            <Button type="button" onClick={push} disabled={busy || candidates.length === 0}>
              {busy ? "推送中..." : `确认推送（共 ${candidates.length} 条）`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md py-1 pr-2"
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        <span className="inline-flex h-5 min-w-[3.5rem] items-center justify-center rounded-full border border-border/40 bg-background/40 px-1.5 text-[10px] text-foreground/70">
          {PLANNING_LEVEL_LABEL[node.level]}
        </span>
        <span className="truncate text-sm text-foreground">{node.title || "未命名"}</span>
      </div>
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
