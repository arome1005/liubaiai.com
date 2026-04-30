import { Maximize2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useTextareaAutoHeight } from "../../hooks/useTextareaAutoHeight"
import type { PlanningThickness } from "../../util/tuiyan-planning-thickness"
import type {
  GlobalPromptTemplate,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
} from "../../db/types"
import { cn } from "../../lib/utils"
import {
  PLANNING_LEVEL_LABEL,
  clampPlanningOutlineItemCount,
  resolveOutlineTargetVolumeCount,
  resolveVolumeTargetChapterCount,
  type PlanningScale,
} from "../../util/tuiyan-planning"
import { PromptPicker, PROMPT_PICKER_TUIYAN_SLOTS } from "../PromptPicker"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { TuiyanReferenceAssemblySummaryBar } from "./TuiyanReferenceAssemblySummaryBar"
import { TuiyanPlanningAdvancedSettingsDialog } from "./TuiyanPlanningAdvancedSettingsDialog"
import { TuiyanPlanningMoreOpsPanel } from "./TuiyanPlanningMoreOpsPanel"

export type TuiyanPlanningUnifiedPanelProps = {
  workId: string | null
  planningMode: "model" | "template"
  onPlanningModeChange: (mode: "model" | "template") => void
  planningIdea: string
  onPlanningIdeaChange: (value: string) => void
  onOpenBigIdeaDialog: () => void
  selectedPromptTemplate: GlobalPromptTemplate | null
  onPickPromptTemplate: (t: GlobalPromptTemplate | null) => void
  onClearPromptTemplate: () => void
  planningBusyLevel: TuiyanPlanningLevel | null
  planningError: string
  planningMasterTotal: number
  planningOutlineNodesLength: number
  planningVolumeTotal: number
  planningChapterOutlineTotal: number
  planningSelectedNode: TuiyanPlanningNode | null
  planningSelectedMeta: TuiyanPlanningMeta | undefined
  planningActiveOutline: TuiyanPlanningNode | null
  planningActiveVolume: TuiyanPlanningNode | null
  /** 当前激活大纲下已生成的卷数 */
  volumeCountForActiveOutline: number
  /** 规模设置：目标卷数与每卷章节数 */
  planningScale: PlanningScale
  onPlanningScaleChange: (s: PlanningScale) => void
  /** 各层最低字数，与提示词/校验一致；见高级设置弹窗 */
  planningThickness: PlanningThickness
  onPlanningThicknessChange: (t: PlanningThickness) => void
  /** 分一级大纲：该节点 id → 本分支目标卷数；未设则回退到全局目标卷数 */
  planningOutlineTargetVolumesByNodeId: Record<string, number>
  onPlanningOutlineTargetVolumesChange: (outlineId: string, value: number) => void
  /** 分卷：该卷节点 id → 本卷章细纲条数；未设则回退到全局每卷章节 */
  planningVolumeTargetChaptersByNodeId: Record<string, number>
  onPlanningVolumeTargetChaptersChange: (volumeId: string, value: number) => void
  onUpdateSelectedNodeSummary: (nodeId: string, value: string) => void
  /** 所选为「详细细纲」时编辑的是草稿，与 `selectedChapterDetailDraft` 成对 */
  onUpdateSelectedNodeDetailDraft: (nodeId: string, value: string) => void
  /** 当前选中的「详细细纲」节点对应正文（`planningDraftsByNodeId`） */
  selectedChapterDetailDraft: string
  onOpenPushDialog: () => void
  onGenerateMasterOutline: () => void
  onGenerateOutline: () => void
  onGenerateVolumeForActiveOutline: () => void
  onGenerateChapterOutlinesForActiveVolume: () => void
  onGenerateVolume: (node: TuiyanPlanningNode) => void
  onRegenerateMasterOutline: () => void
  onRegenerateOutlineRoot: () => void
  onGenerateChapterOutlines: (node: TuiyanPlanningNode) => void
  onRegenerateVolume: () => void
  onGenerateChapterDetail: (node: TuiyanPlanningNode) => void
  onRegenerateChapterOutlines: () => void
  onDeleteSelectedNode: () => void
  onClearAllPlanning: () => void
  /** 终止当前规划层生成（Abort 流式请求） */
  onCancelPlanningGeneration?: () => void
  /** 真实流式进度：0-100 表示进行中，null 表示隐藏 */
  genProgress: number | null
  /** 可选：主「生成」按钮上方只读「本次参考装配」摘要行（推演参考仿写 P0） */
  referenceAssemblySummaryLines?: string[]
  /** 参考策略块生成失败等需显式降级的短说明（第十批：装配链） */
  referenceAssemblyHardError?: string | null
}

/** 右侧详情单卡片（激进版）：默认一个主按钮，其余动作折叠到「更多操作」。 */
export function TuiyanPlanningUnifiedPanel({
  workId,
  planningMode,
  onPlanningModeChange,
  planningIdea,
  onPlanningIdeaChange,
  onOpenBigIdeaDialog,
  selectedPromptTemplate,
  onPickPromptTemplate,
  onClearPromptTemplate,
  planningBusyLevel,
  planningError,
  planningMasterTotal,
  planningOutlineNodesLength,
  planningVolumeTotal,
  planningChapterOutlineTotal,
  planningSelectedNode,
  planningSelectedMeta,
  planningActiveOutline,
  planningActiveVolume,
  volumeCountForActiveOutline,
  planningScale,
  onPlanningScaleChange,
  planningThickness,
  onPlanningThicknessChange,
  planningOutlineTargetVolumesByNodeId,
  onPlanningOutlineTargetVolumesChange,
  planningVolumeTargetChaptersByNodeId,
  onPlanningVolumeTargetChaptersChange,
  onUpdateSelectedNodeSummary,
  onUpdateSelectedNodeDetailDraft,
  selectedChapterDetailDraft,
  onOpenPushDialog,
  onGenerateMasterOutline,
  onGenerateOutline,
  onGenerateVolumeForActiveOutline,
  onGenerateChapterOutlinesForActiveVolume,
  onGenerateVolume,
  onRegenerateMasterOutline,
  onRegenerateOutlineRoot,
  onGenerateChapterOutlines,
  onRegenerateVolume,
  onGenerateChapterDetail,
  onRegenerateChapterOutlines,
  onDeleteSelectedNode,
  onClearAllPlanning,
  onCancelPlanningGeneration,
  genProgress,
  referenceAssemblySummaryLines,
  referenceAssemblyHardError,
}: TuiyanPlanningUnifiedPanelProps) {
  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false)
  const showNodeMode = Boolean(planningSelectedNode)
  const isSelectedChapterDetail = planningSelectedNode?.level === "chapter_detail"
  const rightNodePanelValue = useMemo(() => {
    if (!planningSelectedNode) return ""
    if (isSelectedChapterDetail) return selectedChapterDetailDraft
    return planningSelectedNode.summary
  }, [planningSelectedNode, isSelectedChapterDetail, selectedChapterDetailDraft])
  const rightNodeTextareaRef = useTextareaAutoHeight(showNodeMode ? rightNodePanelValue : "")
  const modeLabel = planningSelectedMeta?.mode === "template" ? "模板高级模式" : "模型一键模式"
  const resolvedOutlineVolTarget = planningActiveOutline
    ? resolveOutlineTargetVolumeCount(
        planningActiveOutline.id,
        planningOutlineTargetVolumesByNodeId,
        planningScale.volumeCount,
      )
    : planningScale.volumeCount
  const volumeForChapterTarget = planningSelectedNode?.level === "volume" ? planningSelectedNode : null
  const resolvedVolChapterTarget = volumeForChapterTarget
    ? resolveVolumeTargetChapterCount(
        volumeForChapterTarget.id,
        planningVolumeTargetChaptersByNodeId,
        planningScale.chaptersPerVolume,
      )
    : planningScale.chaptersPerVolume
  const disabledBase = !workId || planningBusyLevel !== null
  const showPlanningCancel = planningBusyLevel !== null && Boolean(onCancelPlanningGeneration)

  const primaryAction = (() => {
    if (!planningSelectedNode) {
      return {
        label: planningBusyLevel === "master_outline" ? "生成中" : "生成总纲",
        disabled: disabledBase,
        onClick: onGenerateMasterOutline,
      }
    }
    if (planningSelectedNode.level === "master_outline") {
      return {
        label: planningBusyLevel === "outline" ? "生成中" : "生成一级大纲",
        disabled: planningBusyLevel !== null,
        onClick: onGenerateOutline,
      }
    }
    if (planningSelectedNode.level === "outline") {
      const nextVol = volumeCountForActiveOutline + 1
      const allDone = volumeCountForActiveOutline >= resolvedOutlineVolTarget
      return {
        label:
          planningBusyLevel === "volume"
            ? "生成中"
            : allDone
              ? `已完成全部 ${resolvedOutlineVolTarget} 卷卷纲`
              : `生成第 ${nextVol} 卷卷纲`,
        disabled: planningBusyLevel !== null || allDone,
        onClick: () => onGenerateVolume(planningSelectedNode),
      }
    }
    if (planningSelectedNode.level === "volume") {
      return {
        label: planningBusyLevel === "chapter_outline" ? "生成中" : "生成章纲",
        disabled: planningBusyLevel !== null,
        onClick: () => onGenerateChapterOutlines(planningSelectedNode),
      }
    }
    if (planningSelectedNode.level === "chapter_outline") {
      return {
        label: planningBusyLevel === "chapter_detail" ? "生成中" : "生成详细细纲",
        disabled: planningBusyLevel !== null,
        onClick: () => onGenerateChapterDetail(planningSelectedNode),
      }
    }
    return {
      label: planningBusyLevel === "chapter_detail" ? "生成中" : "重生成详细细纲",
      disabled: planningBusyLevel !== null || !planningActiveVolume,
      onClick: onRegenerateChapterOutlines,
    }
  })()

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{showNodeMode ? "当前节点操作" : "五层规划生成"}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] text-muted-foreground"
          onClick={() => setAdvancedDialogOpen(true)}
        >
          高级设置
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-border/30 bg-background/20 p-2">
        <div className="flex items-center gap-1 rounded-md border border-border/40 bg-card/40 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-[10px]",
              planningMode === "model" ? "bg-primary/15 text-primary" : "text-muted-foreground",
            )}
            onClick={() => onPlanningModeChange("model")}
          >
            模型一键
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-[10px]",
              planningMode === "template" ? "bg-primary/15 text-primary" : "text-muted-foreground",
            )}
            onClick={() => onPlanningModeChange("template")}
          >
            模板高级
          </button>
        </div>
        {planningMode === "template" ? (
          <div className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <PromptPicker
                selectedId={selectedPromptTemplate?.id}
                selectedLabel={selectedPromptTemplate?.title ?? null}
                emptyPlaceholder="请选择您喜欢的提示词风格"
                triggerVariant="field"
                onPick={onPickPromptTemplate}
                filterSlots={PROMPT_PICKER_TUIYAN_SLOTS}
              />
            </div>
            {selectedPromptTemplate && (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="清除提示词选择"
                onClick={onClearPromptTemplate}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showNodeMode && planningSelectedNode ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{PLANNING_LEVEL_LABEL[planningSelectedNode.level]}</Badge>
            <span className="line-clamp-1 text-xs text-muted-foreground">{planningSelectedNode.title}</span>
          </div>
          <Textarea
            ref={rightNodeTextareaRef}
            value={rightNodePanelValue}
            onChange={(e) => {
              if (isSelectedChapterDetail) {
                onUpdateSelectedNodeDetailDraft(planningSelectedNode.id, e.target.value)
              } else {
                onUpdateSelectedNodeSummary(planningSelectedNode.id, e.target.value)
              }
            }}
            className="min-h-[3.5rem] resize-none overflow-hidden text-sm leading-relaxed"
            placeholder={
              isSelectedChapterDetail ? "详细细纲（与中间编辑区同步为同一草稿）" : "编辑当前节点摘要..."
            }
            disabled={!workId}
            rows={1}
          />
          <p className="text-[11px] text-muted-foreground">{modeLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={planningIdea}
            onChange={(e) => onPlanningIdeaChange(e.target.value)}
            placeholder="可写梗概、人设、矛盾、结局走向等；支持多段长文。"
            className="min-h-[7rem] max-h-[14rem] resize-y text-sm leading-relaxed"
            disabled={!workId}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">约 {planningIdea.length} 字</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 text-xs"
              disabled={!workId}
              onClick={onOpenBigIdeaDialog}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              大窗编辑
            </Button>
          </div>
        </div>
      )}

      {planningError ? (
        <div className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] leading-snug text-destructive">
          {planningError}
        </div>
      ) : null}

      <div className="space-y-2 border-t border-border/40 pt-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="tabular-nums text-foreground/70">
            {planningMasterTotal} 总 / {planningOutlineNodesLength} 纲 / {planningVolumeTotal} 卷 / {planningChapterOutlineTotal} 章
          </span>
          {planningActiveOutline ? (
            <span className="tabular-nums">
              {volumeCountForActiveOutline}/{resolvedOutlineVolTarget} 卷已生成
            </span>
          ) : (
            <span>{showNodeMode ? "节点模式" : "全局模式"}</span>
          )}
        </div>

        {/* 生成进度条 */}
        {genProgress !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {planningBusyLevel
                  ? `${PLANNING_LEVEL_LABEL[planningBusyLevel]}生成中`
                  : "生成完成"}
              </span>
              <span className={cn(
                "tabular-nums text-[10px] font-semibold transition-colors",
                genProgress === 100 ? "text-emerald-500" : "text-primary",
              )}>
                {Math.round(genProgress)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn(
                  "h-full rounded-full",
                  genProgress === 100 ? "bg-emerald-500" : "bg-primary",
                )}
                style={{
                  width: `${genProgress}%`,
                  transition: genProgress === 100 ? "width 0.3s ease-out" : "width 0.22s linear",
                }}
              />
            </div>
          </div>
        )}

        {referenceAssemblySummaryLines && referenceAssemblySummaryLines.length > 0 ? (
          <TuiyanReferenceAssemblySummaryBar lines={referenceAssemblySummaryLines} />
        ) : null}

        {referenceAssemblyHardError ? (
          <div
            className="rounded-lg border border-amber-500/45 bg-amber-500/8 px-2.5 py-2 text-[10px] leading-snug text-amber-950 dark:text-amber-100/90"
            role="status"
          >
            <div className="mb-0.5 font-medium text-foreground/90">参考装配</div>
            <p className="[text-wrap:pretty]">{referenceAssemblyHardError}</p>
          </div>
        ) : null}

        {showPlanningCancel ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 min-w-0 flex-1 text-sm"
              type="button"
              disabled
            >
              {primaryAction.label}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="h-9 shrink-0 px-3 text-sm"
              onClick={onCancelPlanningGeneration}
            >
              终止
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="h-9 w-full text-sm"
            type="button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        )}
        {planningChapterOutlineTotal > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full text-sm"
            type="button"
            disabled={!workId}
            onClick={onOpenPushDialog}
          >
            推送到写作章纲
          </Button>
        )}
        <TuiyanPlanningMoreOpsPanel
          workId={workId}
          planningBusyLevel={planningBusyLevel}
          planningSelectedNode={planningSelectedNode}
          planningActiveOutline={planningActiveOutline}
          planningActiveVolume={planningActiveVolume}
          onGenerateMasterOutline={onGenerateMasterOutline}
          onGenerateOutline={onGenerateOutline}
          onGenerateVolumeForActiveOutline={onGenerateVolumeForActiveOutline}
          onGenerateChapterOutlinesForActiveVolume={onGenerateChapterOutlinesForActiveVolume}
          onGenerateVolume={onGenerateVolume}
          onRegenerateMasterOutline={onRegenerateMasterOutline}
          onRegenerateOutlineRoot={onRegenerateOutlineRoot}
          onGenerateChapterOutlines={onGenerateChapterOutlines}
          onRegenerateVolume={onRegenerateVolume}
          onGenerateChapterDetail={onGenerateChapterDetail}
          onRegenerateChapterOutlines={onRegenerateChapterOutlines}
          onDeleteSelectedNode={onDeleteSelectedNode}
          onClearAllPlanning={onClearAllPlanning}
          onOpenPushDialog={onOpenPushDialog}
        />
      </div>

      <TuiyanPlanningAdvancedSettingsDialog
        open={advancedDialogOpen}
        onOpenChange={setAdvancedDialogOpen}
        planningSelectedNode={planningSelectedNode}
        planningScale={planningScale}
        onPlanningScaleChange={onPlanningScaleChange}
        planningThickness={planningThickness}
        onPlanningThicknessChange={onPlanningThicknessChange}
      />
    </div>
  )
}
