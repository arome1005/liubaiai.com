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

export type PlanningDeleteTarget =
  | { type: "node"; nodeId: string; nodeTitle: string }
  | { type: "all" }
  | null

type Props = {
  target: PlanningDeleteTarget
  onConfirm: (target: NonNullable<PlanningDeleteTarget>) => void
  onCancel: () => void
}

/** 删除规划节点 / 清空全部规划的二次确认弹窗。 */
export function PlanningDeleteConfirmDialog({ target, onConfirm, onCancel }: Props) {
  if (!target) return null

  const isAll = target.type === "all"
  const title = isAll ? "清空全部规划？" : "删除该节点？"
  const description = isAll
    ? "将删除当前作品的所有规划节点（总纲、大纲、卷纲、章纲、详细细纲），此操作不可撤销。"
    : `将删除「${(target as { type: "node"; nodeTitle: string }).nodeTitle}」及其所有子节点，此操作不可撤销。`

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(target)}
          >
            {isAll ? "清空规划" : "删除节点"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
