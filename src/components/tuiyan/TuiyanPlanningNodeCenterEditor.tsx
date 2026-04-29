import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel, TuiyanPlanningMeta, TuiyanPlanningNode } from "../../db/types"
import { useTextareaAutoHeight } from "../../hooks/useTextareaAutoHeight"
import { PLANNING_LEVEL_LABEL, STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { StructuredMetaChips } from "./StructuredMetaChips"

/**
 * 推演中栏「大纲」纸面样式：故意不复用 shadcn Input/Textarea，
 * 改用 native input/textarea + 自定义类，避免 shadcn 自带的 border/shadow
 * 在「合并进同一张纸」时露出内嵌方框。
 */
const PAPER_INPUT_BASE =
  "block w-full border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"

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
  const mainTextareaRef = useTextareaAutoHeight(mainText)

  const bodyLabel = node.level === "chapter_detail" ? "详细细纲（800-1500 字）" : "本层摘要"

  return (
    <div className="mx-auto w-full max-w-6xl p-3 md:p-4">
      {/* 推演中栏「一张纸」：保留页面原 bg-card/20 配色，把「层级 / 标题 / 摘要正文 / 结构化字段」并入同一框；title/summary/body 全用 native 元素以彻底避开 shadcn 默认边框，靠虚线分段而非内嵌方框。 */}
      <div
        className="flex flex-col rounded-xl border border-border/30 bg-card/20"
        style={{ padding: "1.25rem clamp(1rem, 4vw, 2rem) 1.5rem" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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

        {/* 标题：大字号 + 虚线下划线（同 .editor-chapter-title 视觉） */}
        <input
          type="text"
          value={node.title}
          onChange={(e) => onTitleChange(node.id, e.target.value)}
          className={`${PAPER_INPUT_BASE} pb-3 text-xl font-bold leading-snug text-foreground md:text-2xl`}
          style={{ borderBottom: "1px dashed color-mix(in srgb, var(--border) 60%, transparent)" }}
          placeholder="请输入标题"
          disabled={disabled}
        />

        {/* 正文区：和标题在同一张纸内连续，仅靠小标签和留白分段 */}
        <div className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {bodyLabel}
        </div>
        <textarea
          ref={mainTextareaRef}
          value={mainText}
          onChange={(e) =>
            node.level === "chapter_detail"
              ? onDraftChange(node.id, e.target.value)
              : onSummaryChange(node.id, e.target.value)
          }
          className={`${PAPER_INPUT_BASE} ${
            node.level === "chapter_detail" ? "min-h-[5rem]" : "min-h-[200px]"
          } resize-none overflow-hidden text-[15px] leading-[1.85] text-foreground`}
          placeholder={node.level === "chapter_detail" ? "详细细纲会显示在这里..." : "可手动编辑本层摘要..."}
          disabled={disabled}
        />

        {hasStructuredFields && (
          <div
            className="mt-5 pt-4"
            style={{ borderTop: "1px dashed color-mix(in srgb, var(--border) 60%, transparent)" }}
          >
            <StructuredMetaChips
              nodeId={node.id}
              level={node.level}
              meta={structuredMeta}
              workId={workId}
              disabled={disabled}
              onChange={onStructuredMetaChange}
              libraryRefreshKey={libraryRefreshKey}
            />
          </div>
        )}
      </div>
    </div>
  )
}
