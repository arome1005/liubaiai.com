import { useEffect, useRef } from "react"
import type { PlanningNodeStructuredMeta, TuiyanPlanningLevel, TuiyanPlanningMeta, TuiyanPlanningNode } from "../../db/types"
import { cn } from "../../lib/utils"
import { PLANNING_LEVEL_LABEL, STRUCTURED_FIELDS_BY_LEVEL } from "../../util/tuiyan-planning"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"

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
  onTitleChange: (nodeId: string, title: string) => void
  onSummaryChange: (nodeId: string, summary: string) => void
  onDraftChange: (nodeId: string, draft: string) => void
  onStructuredMetaChange: (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => void
  onRegenerateChapterDetail: (chapterNode: TuiyanPlanningNode) => void
}

// UI-only extras: placeholder & rows per field key
const FIELD_UI: Partial<Record<keyof PlanningNodeStructuredMeta, { placeholder?: string; rows?: number }>> = {
  logline:             { placeholder: "一句话：谁、在什么处境、追求什么、代价是什么", rows: 2 },
  worldSetting:        { placeholder: "描述故事世界规则、修炼体系或社会背景…", rows: 3 },
  mainConflict:        { placeholder: "贯穿全书的核心矛盾与对立力量…", rows: 2 },
  coreCharacters:      { placeholder: "主角、反派及主要配角一行一个，附简短定位…", rows: 3 },
  storyStages:         { placeholder: "全书大弧结构，如：崛起 → 磨难 → 破局 → 巅峰…", rows: 2 },
  stageGoal:           { placeholder: "这一级大纲要完成的核心叙事目标…", rows: 2 },
  characterAllocation: { placeholder: "各卷主要出场人物分配…", rows: 3 },
  mainFactions:        { placeholder: "在本阶段活跃的势力及其立场…", rows: 2 },
  characterArcs:       { placeholder: "关键人物在本阶段的成长或转变…", rows: 2 },
  mainCharacters:      { placeholder: "一行一人，附简短说明…", rows: 3 },
  coreFactions:        { placeholder: "本卷涉及的主要势力及关系…", rows: 2 },
  keyLocations:        { placeholder: "本卷重要场景地点…", rows: 2 },
  keyItems:            { placeholder: "推动情节的关键物件或机缘…", rows: 2 },
  volumeHook:          { placeholder: "卷末留白或下一卷的引子…", rows: 2 },
  conflictPoints:      { placeholder: "本章核心矛盾或对抗…", rows: 2 },
  appearedCharacters:  { placeholder: "一行一人，附本章内的状态/目的…", rows: 3 },
  locations:           { placeholder: "场景切换顺序…", rows: 2 },
  keyBeats:            { placeholder: "推进情节的关键动作或转折，一行一条…", rows: 3 },
  requiredInfo:        { placeholder: "必须写进本章的伏笔、设定或信息…", rows: 2 },
  tags:                { placeholder: "如：爽点 / 感情线 / 战斗 / 反转…", rows: 1 },
}

function StructuredMetaSection({
  nodeId,
  level,
  meta,
  disabled,
  onChange,
}: {
  nodeId: string
  level: TuiyanPlanningLevel
  meta: PlanningNodeStructuredMeta | undefined
  disabled: boolean
  onChange: (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => void
}) {
  const fields = STRUCTURED_FIELDS_BY_LEVEL[level]
  if (!fields.length) return null

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border/30 bg-card/10 p-3 md:p-4">
      <div className="text-xs font-medium text-muted-foreground">结构化元数据</div>
      {fields.map(({ key, label }) => {
        const ui = FIELD_UI[key] ?? {}
        return (
          <div key={key} className="space-y-1">
            <label className="text-xs text-muted-foreground">{label}</label>
            <Textarea
              value={meta?.[key] ?? ""}
              onChange={(e) => onChange(nodeId, { [key]: e.target.value })}
              placeholder={ui.placeholder}
              rows={ui.rows ?? 2}
              disabled={disabled}
              className="resize-none border-border/40 bg-background/30 text-sm leading-relaxed"
            />
          </div>
        )
      })}
    </div>
  )
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
  onTitleChange,
  onSummaryChange,
  onDraftChange,
  onStructuredMetaChange,
  onRegenerateChapterDetail,
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
          <StructuredMetaSection
            nodeId={node.id}
            level={node.level}
            meta={structuredMeta}
            disabled={disabled}
            onChange={onStructuredMetaChange}
          />
        )}
      </div>
    </div>
  )
}
