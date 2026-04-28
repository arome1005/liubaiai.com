import { Loader2 } from "lucide-react"
import type { TuiyanPlanningLevel } from "../../db/types"
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"

type Props = {
  open: boolean
  busy: boolean
  /** 当前刚完成生成的是哪一层；弹窗关闭时可为 null */
  level: TuiyanPlanningLevel | null
  onOpenChange: (open: boolean) => void
  onSkip: () => void
  onEnrich: () => void
}

/**
 * 各层规划生成结束后：问是否用模型为书斋补人物/词条正文（与仅 chip 名入库区分）。
 */
export function TuiyanPostPlanningKnowledgeDialog({ open, busy, level, onOpenChange, onSkip, onEnrich }: Props) {
  const label = level ? PLANNING_LEVEL_LABEL[level] : "本层"
  const manyBatches =
    level === "chapter_outline"
      ? "本层可能包含较多章节点，将按节点串行抽取，耗时与用量会随章数增加。"
      : null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>「{label}」已生成</AlertDialogTitle>
          <AlertDialogDescription className="text-left text-sm leading-relaxed">
            是否根据当前「{label}」内容调用模型，为作品写入
            <span className="text-foreground/90">书斋人物库、词条库</span>
            的简要信息（非仅名称）？会按本层规划正文与结构化字段做知识抽取，用量与节点数量相关。
            {manyBatches ? (
              <>
                <br />
                <br />
                {manyBatches}
              </>
            ) : null}
            <br />
            <br />
            选「是」会合并进已有卡片（已有内容不覆盖）。选「先不生成」则与此前一致，仅受右上角「生成即入库」控制是否按 chip 入名/句。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            type="button"
            disabled={busy}
            onClick={() => onSkip()}
            className="mt-0"
          >
            先不生成
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={busy}
            className="gap-1.5 sm:ml-0"
            onClick={(e) => {
              e.preventDefault()
              void onEnrich()
            }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
            是，写入书斋
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
