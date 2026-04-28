import { ChevronDown, Maximize2, RefreshCw, Sparkles, Trash2, X } from "lucide-react"
import { useState } from "react"
import type {
  GlobalPromptTemplate,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
} from "../../db/types"
import { cn } from "../../lib/utils"
import {
  DEFAULT_PLANNING_SCALE,
  PLANNING_LEVEL_LABEL,
  PLANNING_SCALE_CHAPTERS_MAX,
  PLANNING_SCALE_CHAPTERS_MIN,
  PLANNING_SCALE_VOLUME_MAX,
  PLANNING_SCALE_VOLUME_MIN,
  clampPlanningOutlineVolumeTarget,
  clampPlanningVolumeChapterTarget,
  resolveOutlineTargetVolumeCount,
  resolveVolumeTargetChapterCount,
  type PlanningScale,
} from "../../util/tuiyan-planning"
import { PromptPicker, PROMPT_PICKER_TUIYAN_SLOTS } from "../PromptPicker"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { TuiyanReferenceAssemblySummaryBar } from "./TuiyanReferenceAssemblySummaryBar"

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
  /** 分一级大纲：该节点 id → 本分支目标卷数；未设则回退到全局目标卷数 */
  planningOutlineTargetVolumesByNodeId: Record<string, number>
  onPlanningOutlineTargetVolumesChange: (outlineId: string, value: number) => void
  /** 分卷：该卷节点 id → 本卷章细纲条数；未设则回退到全局每卷章节 */
  planningVolumeTargetChaptersByNodeId: Record<string, number>
  onPlanningVolumeTargetChaptersChange: (volumeId: string, value: number) => void
  onUpdateSelectedNodeSummary: (nodeId: string, value: string) => void
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
  planningOutlineTargetVolumesByNodeId,
  onPlanningOutlineTargetVolumesChange,
  planningVolumeTargetChaptersByNodeId,
  onPlanningVolumeTargetChaptersChange,
  onUpdateSelectedNodeSummary,
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [opsOpen, setOpsOpen] = useState(false)
  const showNodeMode = Boolean(planningSelectedNode)
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
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          高级设置
          <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
        </Button>
      </div>

      {showNodeMode && planningSelectedNode ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{PLANNING_LEVEL_LABEL[planningSelectedNode.level]}</Badge>
            <span className="line-clamp-1 text-xs text-muted-foreground">{planningSelectedNode.title}</span>
          </div>
          <Textarea
            value={planningSelectedNode.summary}
            onChange={(e) => onUpdateSelectedNodeSummary(planningSelectedNode.id, e.target.value)}
            className="min-h-[6.5rem] resize-y text-sm leading-relaxed"
            placeholder="编辑当前节点摘要..."
            disabled={!workId}
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

      {advancedOpen && (
        <div className="space-y-2 rounded-lg border border-border/30 bg-background/25 p-2.5">
          {/* ── 规模设置 ── */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">规模设置（默认）</p>
            <p className="text-[9px] leading-tight text-muted-foreground/90">
              新节点未单独设置时采用下列数值；分大纲/分卷见下方。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">
                  目标卷数（{PLANNING_SCALE_VOLUME_MIN}-{PLANNING_SCALE_VOLUME_MAX}）
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={PLANNING_SCALE_VOLUME_MIN}
                    max={PLANNING_SCALE_VOLUME_MAX}
                    step={1}
                    value={planningScale.volumeCount}
                    onChange={(e) =>
                      onPlanningScaleChange({ ...planningScale, volumeCount: Number(e.target.value) })
                    }
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-4 text-center text-[11px] font-medium tabular-nums text-foreground">
                    {planningScale.volumeCount}
                  </span>
                </div>
              </div>
              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">
                  每卷章节（{PLANNING_SCALE_CHAPTERS_MIN}-{PLANNING_SCALE_CHAPTERS_MAX}）
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min={PLANNING_SCALE_CHAPTERS_MIN}
                    max={PLANNING_SCALE_CHAPTERS_MAX}
                    step={5}
                    value={planningScale.chaptersPerVolume}
                    onChange={(e) =>
                      onPlanningScaleChange({ ...planningScale, chaptersPerVolume: Number(e.target.value) })
                    }
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-6 text-center text-[11px] font-medium tabular-nums text-foreground">
                    {planningScale.chaptersPerVolume}
                  </span>
                </div>
              </div>
            </div>
            {/* 预设快选 */}
            <div className="flex gap-1">
              {(
                [
                  { label: "短篇", volumeCount: 3, chaptersPerVolume: 30 },
                  { label: "标准", volumeCount: 5, chaptersPerVolume: 40 },
                  { label: "长篇", volumeCount: 7, chaptersPerVolume: 60 },
                ] satisfies (PlanningScale & { label: string })[]
              ).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] border",
                    planningScale.volumeCount === preset.volumeCount &&
                      planningScale.chaptersPerVolume === preset.chaptersPerVolume
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onPlanningScaleChange({ volumeCount: preset.volumeCount, chaptersPerVolume: preset.chaptersPerVolume })}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className="rounded px-2 py-0.5 text-[10px] border border-border/30 text-muted-foreground hover:text-foreground"
                onClick={() => onPlanningScaleChange(DEFAULT_PLANNING_SCALE)}
              >
                重置
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-medium text-muted-foreground">分大纲 / 分卷（覆盖默认）</p>
              {planningActiveOutline ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[10px] text-muted-foreground shrink-0">
                    当前一级大纲 · 目标卷数（{PLANNING_SCALE_VOLUME_MIN}–{PLANNING_SCALE_VOLUME_MAX}）
                  </label>
                  <input
                    type="number"
                    min={PLANNING_SCALE_VOLUME_MIN}
                    max={PLANNING_SCALE_VOLUME_MAX}
                    value={resolvedOutlineVolTarget}
                    onChange={(e) => {
                      const n = clampPlanningOutlineVolumeTarget(Number(e.target.value))
                      onPlanningOutlineTargetVolumesChange(planningActiveOutline.id, n)
                    }}
                    className="h-7 w-14 rounded border border-border/40 bg-background/60 px-1.5 text-center text-[11px] tabular-nums"
                  />
                </div>
              ) : null}
              {volumeForChapterTarget ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[10px] text-muted-foreground shrink-0">
                    当前卷 · 本卷章细纲条数（{PLANNING_SCALE_CHAPTERS_MIN}–{PLANNING_SCALE_CHAPTERS_MAX}）
                  </label>
                  <input
                    type="number"
                    min={PLANNING_SCALE_CHAPTERS_MIN}
                    max={PLANNING_SCALE_CHAPTERS_MAX}
                    value={resolvedVolChapterTarget}
                    onChange={(e) => {
                      const n = clampPlanningVolumeChapterTarget(Number(e.target.value))
                      onPlanningVolumeTargetChaptersChange(volumeForChapterTarget.id, n)
                    }}
                    className="h-7 w-14 rounded border border-border/40 bg-background/60 px-1.5 text-center text-[11px] tabular-nums"
                  />
                </div>
              ) : null}
              {!planningActiveOutline && !volumeForChapterTarget ? (
                <p className="text-[9px] text-muted-foreground/80">
                  在左侧树选中「一级大纲」可设本段卷数；选中「卷纲」可设本卷章细纲条数。
                </p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-border/30 pt-2" />
          {/* ── 模式与提示词 ── */}
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
          <div className="flex items-center gap-1">
            <PromptPicker
              selectedId={selectedPromptTemplate?.id}
              onPick={onPickPromptTemplate}
              filterSlots={PROMPT_PICKER_TUIYAN_SLOTS}
            />
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs text-muted-foreground"
          onClick={() => setOpsOpen((v) => !v)}
        >
          更多操作
          <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", opsOpen && "rotate-180")} />
        </Button>
      </div>

      {opsOpen && (
        <div className="space-y-2 rounded-lg border border-border/30 bg-background/20 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              type="button"
              disabled={disabledBase}
              onClick={onGenerateMasterOutline}
            >
              {planningBusyLevel === "master_outline" ? "生成中" : "生成总纲"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              type="button"
              disabled={disabledBase}
              onClick={onGenerateOutline}
            >
              {planningBusyLevel === "outline" ? "生成中" : "生成一级大纲"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              type="button"
              disabled={!planningActiveOutline || planningBusyLevel !== null}
              onClick={onGenerateVolumeForActiveOutline}
            >
              {planningBusyLevel === "volume" ? "生成中" : "生成卷纲"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="col-span-2 h-8 text-xs"
              type="button"
              disabled={!planningActiveVolume || planningBusyLevel !== null}
              onClick={onGenerateChapterOutlinesForActiveVolume}
            >
              {planningBusyLevel === "chapter_outline" ? "生成中" : "生成章纲"}
            </Button>
          </div>
          <div className="border-t border-border/30 pt-2 space-y-1.5">
            {planningSelectedNode && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                type="button"
                disabled={planningBusyLevel !== null}
                onClick={onDeleteSelectedNode}
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                删除当前节点及子项
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
              type="button"
              disabled={planningBusyLevel !== null}
              onClick={onClearAllPlanning}
            >
              <Trash2 className="mr-1.5 h-3 w-3" />
              清空全部规划
            </Button>
          </div>

          {planningSelectedNode && (
            <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
              {planningSelectedNode.level === "master_outline" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={onGenerateOutline}
                  >
                    生成一级大纲
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={onRegenerateMasterOutline}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    重生成总纲
                  </Button>
                </>
              )}
              {planningSelectedNode.level === "outline" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={() => onGenerateVolume(planningSelectedNode)}
                  >
                    生成卷纲
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={onRegenerateOutlineRoot}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    重生成大纲
                  </Button>
                </>
              )}
              {planningSelectedNode.level === "volume" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={() => onGenerateChapterOutlines(planningSelectedNode)}
                  >
                    生成细纲
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={onOpenPushDialog}
                  >
                    打开推送弹窗
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="col-span-2"
                    type="button"
                    disabled={planningBusyLevel !== null || !planningActiveOutline}
                    onClick={onRegenerateVolume}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    重生成本卷
                  </Button>
                </>
              )}
              {planningSelectedNode.level === "chapter_outline" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={planningBusyLevel !== null}
                    onClick={() => onGenerateChapterDetail(planningSelectedNode)}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    生成详细细纲
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={onOpenPushDialog}
                  >
                    打开推送弹窗
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="col-span-2"
                    type="button"
                    disabled={planningBusyLevel !== null || !planningActiveVolume}
                    onClick={onRegenerateChapterOutlines}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    重生成本章细纲
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
