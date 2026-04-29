import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "../ui/button"
import { Checkbox } from "../ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { Label } from "../ui/label"
import { ScrollArea } from "../ui/scroll-area"
import type { TuiyanPlanningLevel } from "../../db/types"
import {
  filterPlanningPushCandidatesBySubtreeScope,
  type TuiyanPushSubtreeScope,
} from "../../util/tuiyan-planning-push"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"
import { estimateKnowledgeTokenRange, type KnowledgeExtractInput } from "../../ai/tuiyan-knowledge-extract"

export type TuiyanPlanningPushCandidate = {
  id: string
  parentId: string | null
  level: TuiyanPlanningLevel
  order: number
  title: string
  content: string
}

/** 用户在推送弹窗里选定的知识生成与范围选项 */
export type KnowledgePushOptions = {
  generateCharacters: boolean
  generateTerms: boolean
  /** 只抽取这些层级的节点（空数组 = 全选） */
  levelFilter: TuiyanPlanningLevel[]
  /**
   * 推送范围：整树，或若干子树根的并集（`rootIds` 只含 1 个时与单选子树等价）。
   */
  subtreeScope: TuiyanPushSubtreeScope
}

export const DEFAULT_KNOWLEDGE_PUSH_OPTIONS: KnowledgePushOptions = {
  generateCharacters: false,
  generateTerms: false,
  levelFilter: [],
  subtreeScope: { kind: "full" },
}

export type TuiyanPlanningPushDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: TuiyanPlanningPushCandidate[]
  onConfirmPush: (opts: KnowledgePushOptions) => Promise<void>
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

/** 格式化 token 估算展示 */
function formatTokenRange(low: number, high: number): string {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  return `~${fmt(low)}–${fmt(high)} tokens`
}

/** 推演 → 写作章纲：一键推送整棵五层规划树到写作编辑页「章纲」栏。 */
export function TuiyanPlanningPushDialog({
  open,
  onOpenChange,
  candidates,
  onConfirmPush,
}: TuiyanPlanningPushDialogProps) {
  const [busy, setBusy] = useState(false)
  const [wholeTree, setWholeTree] = useState(true)
  const [selectedRootIds, setSelectedRootIds] = useState<string[]>([])
  const [generateCharacters, setGenerateCharacters] = useState(false)
  const [generateTerms, setGenerateTerms] = useState(false)
  const [levelFilter, setLevelFilter] = useState<TuiyanPlanningLevel[]>([])

  useEffect(() => {
    if (open) {
      setWholeTree(true)
      setSelectedRootIds([])
    }
  }, [open])

  const subtreeScope: TuiyanPushSubtreeScope = useMemo(
    () =>
      wholeTree
        ? { kind: "full" }
        : { kind: "subtrees", rootIds: selectedRootIds },
    [wholeTree, selectedRootIds],
  )

  const tree = useMemo(() => buildTree(candidates), [candidates])
  const effectiveCandidates = useMemo(
    () => filterPlanningPushCandidatesBySubtreeScope(candidates, subtreeScope),
    [candidates, subtreeScope],
  )

  const counts = useMemo(() => {
    const map: Record<TuiyanPlanningLevel, number> = {
      master_outline: 0,
      outline: 0,
      volume: 0,
      chapter_outline: 0,
      chapter_detail: 0,
    }
    for (const c of effectiveCandidates) map[c.level] += 1
    return map
  }, [effectiveCandidates])

  const activeLevels = useMemo(
    () => LEVEL_COUNT_ORDER.filter((lv) => counts[lv] > 0),
    [counts],
  )

  const needsKnowledge = generateCharacters || generateTerms

  const knowledgeCandidates = useMemo((): KnowledgeExtractInput[] => {
    if (!needsKnowledge) return []
    return effectiveCandidates
      .filter((c) => levelFilter.length === 0 || levelFilter.includes(c.level))
      .map((c) => ({
        nodeId: c.id,
        level: c.level,
        title: c.title,
        content: c.content,
      }))
  }, [needsKnowledge, effectiveCandidates, levelFilter])

  const tokenRange = useMemo(
    () =>
      needsKnowledge && knowledgeCandidates.length > 0
        ? estimateKnowledgeTokenRange(knowledgeCandidates)
        : null,
    [needsKnowledge, knowledgeCandidates],
  )

  const toggleLevel = (lv: TuiyanPlanningLevel) => {
    setLevelFilter((prev) => (prev.includes(lv) ? prev.filter((x) => x !== lv) : [...prev, lv]))
  }

  const toggleRoot = useCallback((id: string) => {
    setSelectedRootIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const onWholeTreeChange = (v: boolean) => {
    setWholeTree(v)
    if (v) setSelectedRootIds([])
  }

  const push = async () => {
    if (candidates.length === 0 || effectiveCandidates.length === 0) return
    setBusy(true)
    try {
      await onConfirmPush({
        generateCharacters,
        generateTerms,
        levelFilter,
        subtreeScope,
      })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const nPush = effectiveCandidates.length
  const btnLabel = busy
    ? needsKnowledge
      ? "推送并生成中…"
      : "推送中…"
    : needsKnowledge
      ? `确认推送并生成配套库`
      : `确认推送章纲（共 ${nPush} 条）`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,820px)] w-[min(94vw,1040px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/40 px-6 py-4 text-left">
          <DialogTitle>推送到写作章纲</DialogTitle>
          <DialogDescription>
            将选中的范围（整棵树，或一个或多个子树的并集）作为章纲快照写入写作编辑页左侧「章纲」栏。不会创建章节，也不会动章节正文。父节点在范围外时，子树根会在章纲里作为顶层显示。
          </DialogDescription>
        </DialogHeader>

        {/* 层级统计栏 */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/40 px-6 py-3 text-xs text-muted-foreground">
          {LEVEL_COUNT_ORDER.map((lv) => (
            <span
              key={lv}
              className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/40 px-2 py-0.5"
            >
              <span className="text-foreground/70">{PLANNING_LEVEL_LABEL[lv]}</span>
              <span className="text-foreground">{counts[lv]}</span>
            </span>
          ))}
          <span className="ml-auto text-amber-400">本次推送会整体覆盖上一次快照。</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 章纲树预览 */}
          <ScrollArea className="min-h-0 flex-1 border-b border-border/40 md:border-b-0 md:border-r">
            <div className="space-y-1 p-5 text-sm">
              {tree.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 p-8 text-center text-muted-foreground">
                  当前规划树为空。请先在推演页生成总纲 / 大纲 / 卷纲 / 细纲。
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2 rounded-md py-1.5 pr-2 pl-1">
                    <Checkbox
                      id="tuiyan-planning-push-full"
                      className="mt-0.5"
                      checked={wholeTree}
                      onCheckedChange={(c) => onWholeTreeChange(Boolean(c))}
                    />
                    <Label
                      htmlFor="tuiyan-planning-push-full"
                      className="cursor-pointer text-sm font-normal leading-snug text-foreground"
                    >
                      整棵规划树（默认）
                    </Label>
                  </div>
                  <p className="mb-2 pl-1 text-[11px] leading-relaxed text-muted-foreground">
                    取消勾选后，可勾选一个或多个节点为子树根：将推送这些子树的<strong className="font-medium text-foreground/80">并集</strong>
                    。只勾一个即与「单选子树」相同；多勾可一次合并多卷/多线已展开的细纲。
                  </p>
                  {tree.map((root) => (
                    <TreeRow
                      key={root.id}
                      node={root}
                      depth={0}
                      wholeTree={wholeTree}
                      selectedRootIds={selectedRootIds}
                      onToggleRoot={toggleRoot}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>

          {/* 配套知识推送选项 */}
          <div className="w-full shrink-0 space-y-4 p-5 md:w-[280px]">
            <div className="text-xs font-medium text-foreground/70">配套知识推送（可选）</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              勾选后将额外调用 AI 从规划内容中抽取人物和词条，写入当前作品的书斋。不勾选则仅推送章纲快照。
            </p>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={generateCharacters}
                  onCheckedChange={(v) => setGenerateCharacters(Boolean(v))}
                />
                <span>生成人物库</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={generateTerms} onCheckedChange={(v) => setGenerateTerms(Boolean(v))} />
                <span>生成词条库</span>
              </label>
            </div>

            {needsKnowledge && activeLevels.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground">抽取范围（层级，默认全选）</div>
                <div className="space-y-1.5">
                  {activeLevels.map((lv) => (
                    <label key={lv} className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={levelFilter.length === 0 || levelFilter.includes(lv)}
                        onCheckedChange={() => {
                          if (levelFilter.length === 0) {
                            // 从"全选"变为"仅排除此项"
                            setLevelFilter(activeLevels.filter((x) => x !== lv))
                          } else {
                            toggleLevel(lv)
                            // 若取消后全部勾选 = 重置为全选
                            const next = levelFilter.includes(lv)
                              ? levelFilter.filter((x) => x !== lv)
                              : [...levelFilter, lv]
                            if (next.length === activeLevels.length) setLevelFilter([])
                          }
                        }}
                      />
                      <span>{PLANNING_LEVEL_LABEL[lv]}</span>
                      <span className="ml-auto text-muted-foreground/60">{counts[lv]} 个</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {needsKnowledge && tokenRange && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-400/90">
                <div className="font-medium">Token 估算</div>
                <div className="mt-1">
                  预计额外消耗 {formatTokenRange(tokenRange.low, tokenRange.high)}
                  （{knowledgeCandidates.length} 个节点，各调用一次）
                </div>
              </div>
            )}

            {needsKnowledge && (
              <div className="rounded-lg border border-border/30 bg-background/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <div className="font-medium text-foreground/60">合并规则</div>
                <div className="mt-1">同名人物/词条自动合并更新，不会重复创建。</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            推送后在写作编辑页切到「章纲」即可查看任一层内容。
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              取消
            </Button>
            <Button
              type="button"
              onClick={push}
              disabled={busy || candidates.length === 0 || nPush === 0}
            >
              {btnLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TreeRow({
  node,
  depth,
  wholeTree,
  selectedRootIds,
  onToggleRoot,
}: {
  node: TreeNode
  depth: number
  wholeTree: boolean
  selectedRootIds: string[]
  onToggleRoot: (id: string) => void
}) {
  const checked = selectedRootIds.includes(node.id)
  const showPick = !wholeTree
  const itemId = `tuiyan-planning-push-sub-${node.id}`

  return (
    <div>
      <div
        className="flex items-start gap-2 rounded-md py-1 pr-2"
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        {showPick ? (
          <Checkbox
            id={itemId}
            className="mt-0.5 shrink-0"
            checked={checked}
            onCheckedChange={() => onToggleRoot(node.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="mt-0.5 w-4 shrink-0" aria-hidden />
        )}
        {showPick ? (
          <Label
            htmlFor={itemId}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal"
          >
            <span className="inline-flex h-5 min-w-[3.5rem] shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/40 px-1.5 text-[10px] text-foreground/70">
              {PLANNING_LEVEL_LABEL[node.level]}
            </span>
            <span className="truncate text-sm text-foreground">{node.title || "未命名"}</span>
          </Label>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 font-normal">
            <span className="inline-flex h-5 min-w-[3.5rem] shrink-0 items-center justify-center rounded-full border border-border/40 bg-background/40 px-1.5 text-[10px] text-foreground/70">
              {PLANNING_LEVEL_LABEL[node.level]}
            </span>
            <span className="truncate text-sm text-foreground">{node.title || "未命名"}</span>
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              wholeTree={wholeTree}
              selectedRootIds={selectedRootIds}
              onToggleRoot={onToggleRoot}
            />
          ))}
        </div>
      )}
    </div>
  )
}
