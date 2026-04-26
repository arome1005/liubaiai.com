import { useEffect, useRef } from "react"
import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel, TuiyanPlanningMeta, TuiyanPlanningNode } from "../../db/types"
import { cn } from "../../lib/utils"
import { PLANNING_LEVEL_LABEL, STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { StructuredMetaChips } from "./StructuredMetaChips"

/** 让 textarea 随内容自动伸高，不产生内部滚动条 */
function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}

export type TuiyanPlanningNodeCenterEditorProps = {
  node: TuiyanPlanningNode
  meta: TuiyanPlanningMeta | undefined
  structuredMeta: PlanningNodeStructuredMeta | undefined
  draftText: string
  disabled: boolean
  planningBusyLevel: TuiyanPlanningLevel | null
  parentChapterNode: TuiyanPlanningNode | null
  workId: string | null
  onTitleChange: (nodeId: string, title: string) => void
  onSummaryChange: (nodeId: string, summary: string) => void
  onDraftChange: (nodeId: string, draft: string) => void
  onStructuredMetaChange: (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => void
  onRegenerateChapterDetail: (chapterNode: TuiyanPlanningNode) => void
  /** 生成后自动入库完成时外部递增，触发 chip 库重新加载 */
  libraryRefreshKey?: number
}

/** 推演中栏「大纲」Tab：当前规划节点的标题、摘要与详细细纲草稿编辑。 */
export function TuiyanPlanningNodeCenterEditor({
  node,
  meta,
  structuredMeta,
  draftText,
  disabled,
  planningBusyLevel,
  parentChapterNode,
  workId,
  onTitleChange,
  onSummaryChange,
  onDraftChange,
  onStructuredMetaChange,
  onRegenerateChapterDetail,
  libraryRefreshKey,
}: TuiyanPlanningNodeCenterEditorProps) {
  const modeHint = meta?.mode === "template" ? "模板高级模式" : "模型一键模式"
  const mainText = node.level === "chapter_detail" ? draftText : node.summary
  const hasStructuredFields = STRUCTURED_FIELDS_BY_LEVEL[node.level].length > 0
  const mainTextareaRef = useAutoResize(mainText)

  return (
    <div className="mx-auto w-full max-w-6xl p-3 md:p-4">
      <div className="flex flex-col rounded-xl border border-border/30 bg-card/20 p-3 md:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{PLANNING_LEVEL_LABEL[node.level]}</Badge>
            <span className="text-xs text-muted-foreground">{modeHint}</span>
          </div>
          {node.level === "chapter_detail" && (
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={planningBusyLevel !== null || !parentChapterNode}
              onClick={() => parentChapterNode && onRegenerateChapterDetail(parentChapterNode)}
            >
              重生成
            </Button>
          )}
        </div>
        <Input
          value={node.title}
          onChange={(e) => onTitleChange(node.id, e.target.value)}
          className="h-11 border-border/50 bg-background/30 text-base font-semibold"
          placeholder="请输入标题"
          disabled={disabled}
        />
        {node.level === "chapter_detail" && (
          <div className="mt-2">
            <Input
              value={node.summary}
              onChange={(e) => onSummaryChange(node.id, e.target.value)}
              className="h-10 border-border/50 bg-background/30"
              placeholder="一句话概括本章细纲..."
              disabled={disabled}
            />
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{node.level === "chapter_detail" ? "详细细纲（800-1500 字）" : "本层摘要"}</span>
        </div>
        <Textarea
          ref={mainTextareaRef}
          value={mainText}
          onChange={(e) =>
            node.level === "chapter_detail"
              ? onDraftChange(node.id, e.target.value)
              : onSummaryChange(node.id, e.target.value)
          }
          className="mt-1 min-h-[160px] resize-none overflow-hidden border-border/50 bg-background/30 text-sm leading-relaxed"
          placeholder={node.level === "chapter_detail" ? "详细细纲会显示在这里..." : "可手动编辑本层摘要..."}
          disabled={disabled}
        />
        {hasStructuredFields && (
          <StructuredMetaChips
            nodeId={node.id}
            level={node.level}
            meta={structuredMeta}
            workId={workId}
            disabled={disabled}
            onChange={onStructuredMetaChange}
            libraryRefreshKey={libraryRefreshKey}
          />
        )}
      </div>
    </div>
  )
}
