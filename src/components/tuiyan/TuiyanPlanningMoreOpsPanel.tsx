import { useState } from "react"
import { ChevronDown, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import type { TuiyanPlanningLevel, TuiyanPlanningNode } from "../../db/types"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"

export type TuiyanPlanningMoreOpsPanelProps = {
  workId: string | null
  planningBusyLevel: TuiyanPlanningLevel | null
  planningSelectedNode: TuiyanPlanningNode | null
  planningActiveOutline: TuiyanPlanningNode | null
  planningActiveVolume: TuiyanPlanningNode | null
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
  onOpenPushDialog: () => void
}

/**
 * 五层规划详情卡内「更多操作」折叠区：快捷生成网格、危险操作、按当前节点层级的次按钮。
 */
export function TuiyanPlanningMoreOpsPanel({
  workId,
  planningBusyLevel,
  planningSelectedNode,
  planningActiveOutline,
  planningActiveVolume,
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
  onOpenPushDialog,
}: TuiyanPlanningMoreOpsPanelProps) {
  const [open, setOpen] = useState(false)
  const disabledBase = !workId || planningBusyLevel !== null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full text-xs text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        更多操作
        <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
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
              className="h-8 text-xs"
              type="button"
              disabled={!planningActiveVolume || planningBusyLevel !== null}
              onClick={onGenerateChapterOutlinesForActiveVolume}
            >
              {planningBusyLevel === "chapter_outline" ? "生成中" : "生成章纲"}
            </Button>
          </div>
          <div className="space-y-1.5 border-t border-border/30 pt-2">
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
                  <Button size="sm" variant="outline" type="button" onClick={onOpenPushDialog}>
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
                  <Button size="sm" variant="outline" type="button" onClick={onOpenPushDialog}>
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
    </>
  )
}
