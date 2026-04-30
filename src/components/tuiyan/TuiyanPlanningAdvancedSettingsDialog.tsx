import { useCallback, useMemo } from "react"
import { Layers } from "lucide-react"
import {
  type PlanningThickness,
  type PlanningThicknessKey,
  PLANNING_THICKNESS_LIMITS,
  planningNextThicknessKey,
  normalizePlanningThickness,
} from "../../util/tuiyan-planning-thickness"
import type { TuiyanPlanningNode } from "../../db/types"
import { cn } from "../../lib/utils"
import {
  DEFAULT_PLANNING_SCALE,
  PLANNING_OUTLINE_ITEM_MAX,
  PLANNING_OUTLINE_ITEM_MIN,
  PLANNING_SCALE_CHAPTERS_MAX,
  PLANNING_SCALE_CHAPTERS_MIN,
  PLANNING_SCALE_VOLUME_MAX,
  PLANNING_SCALE_VOLUME_MIN,
  clampPlanningOutlineItemCount,
  clampPlanningOutlineVolumeTarget,
  clampPlanningVolumeChapterTarget,
  resolveOutlineTargetVolumeCount,
  resolveVolumeTargetChapterCount,
  type PlanningScale,
} from "../../util/tuiyan-planning"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { TuiyanPlanningAdvancedSettingsHelp } from "./TuiyanPlanningAdvancedSettingsHelp"
import { TuiyanPlanningThicknessDraftInput } from "./TuiyanPlanningThicknessDraftInput"

export type TuiyanPlanningAdvancedSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  planningSelectedNode: TuiyanPlanningNode | null
  planningActiveOutline: TuiyanPlanningNode | null
  planningScale: PlanningScale
  onPlanningScaleChange: (s: PlanningScale) => void
  planningThickness: PlanningThickness
  onPlanningThicknessChange: (t: PlanningThickness) => void
  planningOutlineTargetVolumesByNodeId: Record<string, number>
  onPlanningOutlineTargetVolumesChange: (outlineId: string, value: number) => void
  planningVolumeTargetChaptersByNodeId: Record<string, number>
  onPlanningVolumeTargetChaptersChange: (volumeId: string, value: number) => void
}

export function TuiyanPlanningAdvancedSettingsDialog({
  open,
  onOpenChange,
  planningSelectedNode,
  planningActiveOutline,
  planningScale,
  onPlanningScaleChange,
  planningThickness,
  onPlanningThicknessChange,
  planningOutlineTargetVolumesByNodeId,
  onPlanningOutlineTargetVolumesChange,
  planningVolumeTargetChaptersByNodeId,
  onPlanningVolumeTargetChaptersChange,
}: TuiyanPlanningAdvancedSettingsDialogProps) {
  const nextThicknessKey = useMemo(
    () => planningNextThicknessKey(planningSelectedNode),
    [planningSelectedNode],
  )
  const commitThickness = useCallback(
    (key: PlanningThicknessKey, n: number) => {
      onPlanningThicknessChange(normalizePlanningThickness({ ...planningThickness, [key]: n }))
    },
    [onPlanningThicknessChange, planningThickness],
  )

  const volumeForChapterTarget = planningSelectedNode?.level === "volume" ? planningSelectedNode : null
  const resolvedOutlineVolTarget = planningActiveOutline
    ? resolveOutlineTargetVolumeCount(
        planningActiveOutline.id,
        planningOutlineTargetVolumesByNodeId,
        planningScale.volumeCount,
      )
    : planningScale.volumeCount
  const resolvedVolChapterTarget = volumeForChapterTarget
    ? resolveVolumeTargetChapterCount(
        volumeForChapterTarget.id,
        planningVolumeTargetChaptersByNodeId,
        planningScale.chaptersPerVolume,
      )
    : planningScale.chaptersPerVolume

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,760px)] gap-0 overflow-y-auto border-border/40 bg-background p-0 shadow-xl sm:max-w-md"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 pb-3 pt-4 sm:px-5">
          <DialogHeader className="min-w-0 flex-1 space-y-0 p-0 text-left">
            <DialogTitle className="text-base font-semibold leading-none tracking-tight">高级设置</DialogTitle>
            <DialogDescription className="sr-only">推演规划规模、覆盖项与建议生成字数</DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 items-center gap-0.5">
            <TuiyanPlanningAdvancedSettingsHelp />
            <DialogClose
              type="button"
              className="ring-offset-background focus:ring-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-80 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
              <span className="sr-only">关闭</span>
            </DialogClose>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <section className="rounded-xl border border-border/45 bg-muted/20 p-3">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-foreground/90">
              <Layers className="h-3.5 w-3.5 opacity-60" aria-hidden />
              规模
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">
                  卷数 {PLANNING_SCALE_VOLUME_MIN}–{PLANNING_SCALE_VOLUME_MAX}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="range"
                    min={PLANNING_SCALE_VOLUME_MIN}
                    max={PLANNING_SCALE_VOLUME_MAX}
                    step={1}
                    value={planningScale.volumeCount}
                    onChange={(e) =>
                      onPlanningScaleChange({ ...planningScale, volumeCount: Number(e.target.value) })
                    }
                    className="h-1.5 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-4 text-center text-[11px] font-medium tabular-nums text-foreground">
                    {planningScale.volumeCount}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">
                  每卷章 {PLANNING_SCALE_CHAPTERS_MIN}–{PLANNING_SCALE_CHAPTERS_MAX}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="range"
                    min={PLANNING_SCALE_CHAPTERS_MIN}
                    max={PLANNING_SCALE_CHAPTERS_MAX}
                    step={5}
                    value={planningScale.chaptersPerVolume}
                    onChange={(e) =>
                      onPlanningScaleChange({ ...planningScale, chaptersPerVolume: Number(e.target.value) })
                    }
                    className="h-1.5 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-6 text-center text-[11px] font-medium tabular-nums text-foreground">
                    {planningScale.chaptersPerVolume}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label
                className="shrink-0 text-[10px] text-muted-foreground"
                htmlFor="planning-outline-item-count-adv"
              >
                一级大纲条数 {PLANNING_OUTLINE_ITEM_MIN}–{PLANNING_OUTLINE_ITEM_MAX}
              </label>
              <input
                id="planning-outline-item-count-adv"
                type="number"
                min={PLANNING_OUTLINE_ITEM_MIN}
                max={PLANNING_OUTLINE_ITEM_MAX}
                value={planningScale.outlineItemCount}
                onChange={(e) =>
                  onPlanningScaleChange({
                    ...planningScale,
                    outlineItemCount: clampPlanningOutlineItemCount(Number(e.target.value)),
                  })
                }
                className="h-8 w-11 rounded-md border border-border/50 bg-background px-1.5 text-center text-[11px] tabular-nums"
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(
                [
                  { label: "短篇", volumeCount: 3, chaptersPerVolume: 30, outlineItemCount: 2 },
                  { label: "标准", volumeCount: 5, chaptersPerVolume: 40, outlineItemCount: 3 },
                  { label: "长篇", volumeCount: 7, chaptersPerVolume: 60, outlineItemCount: 4 },
                ] satisfies (PlanningScale & { label: string })[]
              ).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors",
                    planningScale.volumeCount === preset.volumeCount &&
                      planningScale.chaptersPerVolume === preset.chaptersPerVolume &&
                      planningScale.outlineItemCount === preset.outlineItemCount
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/50 bg-background/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() =>
                    onPlanningScaleChange({
                      volumeCount: preset.volumeCount,
                      chaptersPerVolume: preset.chaptersPerVolume,
                      outlineItemCount: preset.outlineItemCount,
                    })
                  }
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                className="rounded-md border border-border/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => onPlanningScaleChange(DEFAULT_PLANNING_SCALE)}
              >
                重置
              </button>
            </div>

            <div className="mt-3 border-t border-border/35 pt-3">
              <h4 className="mb-2 text-[11px] font-semibold text-foreground/85">覆盖</h4>
              {planningActiveOutline ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="shrink-0 text-[10px] text-muted-foreground">
                    本大纲 · 卷数 {PLANNING_SCALE_VOLUME_MIN}–{PLANNING_SCALE_VOLUME_MAX}
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
                    className="h-8 w-14 rounded-md border border-border/50 bg-background px-1.5 text-center text-[11px] tabular-nums"
                  />
                </div>
              ) : null}
              {volumeForChapterTarget ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="shrink-0 text-[10px] text-muted-foreground">
                    本卷 · 章细纲条数 {PLANNING_SCALE_CHAPTERS_MIN}–{PLANNING_SCALE_CHAPTERS_MAX}
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
                    className="h-8 w-14 rounded-md border border-border/50 bg-background px-1.5 text-center text-[11px] tabular-nums"
                  />
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border/45 bg-muted/20 px-2.5 pb-2 pt-2 sm:px-3">
            <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold leading-tight text-foreground/90">
              建议生成字数（含标点）
            </h3>
            <div className="overflow-hidden rounded-md border border-border/40 divide-y divide-border/40">
              {(
                [
                  { key: "masterOutlineMinNoPunct" as const, name: "总纲" },
                  { key: "outlineTotalWithPunct" as const, name: "" },
                  { key: "volumeWithPunct" as const, name: "每卷卷纲" },
                  { key: "chapterOutlineMinPerNodeWithPunct" as const, name: "章细纲（每条：标题+摘要+结构化项）" },
                  { key: "detailMinTotalWithPunct" as const, name: "详细细纲整段" },
                ] as const
              ).map((row) => {
                const lim = PLANNING_THICKNESS_LIMITS[row.key]
                return (
                  <TuiyanPlanningThicknessDraftInput
                    key={row.key}
                    tKey={row.key}
                    variant="row"
                    compact
                    dialogOpen={open}
                    highlighted={nextThicknessKey === row.key}
                    committed={planningThickness[row.key]}
                    min={lim.min}
                    max={lim.max}
                    onCommit={commitThickness}
                    label={
                      row.key === "outlineTotalWithPunct"
                        ? `一级大纲（${clampPlanningOutlineItemCount(planningScale.outlineItemCount)} 条）合计`
                        : row.name
                    }
                  />
                )
              })}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
