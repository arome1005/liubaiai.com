import { useCallback, type Dispatch, type SetStateAction } from "react"
import type { useToast } from "../components/ui/use-toast"
import type { WenCeEntry } from "../components/tuiyan/WenCeCard"

type ToastFn = ReturnType<typeof useToast>["toast"]

export type UseTuiyanWenCeActionsArgs = {
  wenCe: WenCeEntry[]
  setWenCe: Dispatch<SetStateAction<WenCeEntry[]>>
  toast: ToastFn
}

export type UseTuiyanWenCeActionsResult = {
  handlePinWenCe: (id: string) => void
  handleCopyWenCe: (id: string) => void
  handleDeleteWenCe: (id: string) => void
  handleCreateWenCe: (entry: WenCeEntry) => void
}

/** 文策时间线动作：置顶、复制、删除、新建。 */
export function useTuiyanWenCeActions({
  wenCe,
  setWenCe,
  toast,
}: UseTuiyanWenCeActionsArgs): UseTuiyanWenCeActionsResult {
  const handlePinWenCe = useCallback((id: string) => {
    setWenCe((prev) =>
      prev.map((entry) =>
        entry.id === id ? { ...entry, isPinned: !entry.isPinned } : entry,
      ),
    )
  }, [setWenCe])

  const handleCopyWenCe = useCallback(
    (id: string) => {
      const entry = wenCe.find((e) => e.id === id)
      if (!entry) return
      const text = entry.content ?? ""
      if (!text) {
        toast({ title: "无内容可复制" })
        return
      }
      void navigator.clipboard
        .writeText(text)
        .then(() => toast({ title: "已复制到剪贴板" }))
        .catch(() => toast({ title: "复制失败", variant: "destructive" }))
    },
    [wenCe, toast],
  )

  const handleDeleteWenCe = useCallback(
    (id: string) => {
      setWenCe((prev) => prev.filter((e) => e.id !== id))
      toast({ title: "已删除记录" })
    },
    [setWenCe, toast],
  )

  const handleCreateWenCe = useCallback(
    (entry: WenCeEntry) => {
      setWenCe((prev) => [entry, ...prev])
    },
    [setWenCe],
  )

  return {
    handlePinWenCe,
    handleCopyWenCe,
    handleDeleteWenCe,
    handleCreateWenCe,
  }
}
