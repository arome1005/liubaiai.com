import { useCallback, type Dispatch, type SetStateAction } from "react"
import type { WenCeEntry } from "../components/tuiyan/WenCeCard"
import type { ReferenceLibraryEntry } from "../db/types"
import { listReferenceExcerpts } from "../db/repo"
import { makeRefWenCeEntry } from "../util/tuiyan-handoffs"
import { clampTuiyanReferenceInjectBody, TUIYAN_REF_INJECT_MAX_CHARS } from "../util/tuiyan-reference-inject-text"

export type UseTuiyanReferenceActionsArgs = {
  selectedOutlineId: string | null
  planningSelectedNodeId: string | null
  setWenCe: Dispatch<SetStateAction<WenCeEntry[]>>
  setActiveTab: Dispatch<SetStateAction<"outline" | "mindmap" | "wence">>
  setRightPanelTab: Dispatch<SetStateAction<"detail" | "chat" | "reference">>
  setChatInput: Dispatch<SetStateAction<string>>
  setLinkedRefWorkIds: Dispatch<SetStateAction<string[]>>
}

export type UseTuiyanReferenceActionsResult = {
  applyRefToOutline: (ref: ReferenceLibraryEntry) => Promise<void>
  handleLinkRef: (id: string) => void
  handleUnlinkRef: (id: string) => void
  handleInjectRefToChat: (text: string) => void
}

/** 参考面板动作：书目关联、引用入文策、摘录注入 AI 对话。 */
export function useTuiyanReferenceActions({
  selectedOutlineId,
  planningSelectedNodeId,
  setWenCe,
  setActiveTab,
  setRightPanelTab,
  setChatInput,
  setLinkedRefWorkIds,
}: UseTuiyanReferenceActionsArgs): UseTuiyanReferenceActionsResult {
  const applyRefToOutline = useCallback(
    async (ref: ReferenceLibraryEntry) => {
      const excerpts = await listReferenceExcerpts(ref.id)
      const entry = makeRefWenCeEntry({
        ref,
        excerpts,
        selectedOutlineId,
        planningSelectedNodeId,
      })
      setWenCe((prev) => [entry, ...prev])
      setActiveTab("wence")
    },
    [selectedOutlineId, planningSelectedNodeId, setWenCe, setActiveTab],
  )

  const handleLinkRef = useCallback(
    (id: string) => {
      setLinkedRefWorkIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    },
    [setLinkedRefWorkIds],
  )

  const handleUnlinkRef = useCallback(
    (id: string) => {
      setLinkedRefWorkIds((prev) => prev.filter((x) => x !== id))
    },
    [setLinkedRefWorkIds],
  )

  const handleInjectRefToChat = useCallback(
    (text: string) => {
      const { text: safe } = clampTuiyanReferenceInjectBody(text, TUIYAN_REF_INJECT_MAX_CHARS.absolute)
      setChatInput((prev) => (prev ? `${prev}\n\n【参考段落】\n${safe}` : `【参考段落】\n${safe}`))
      setRightPanelTab("chat")
    },
    [setChatInput, setRightPanelTab],
  )

  return {
    applyRefToOutline,
    handleLinkRef,
    handleUnlinkRef,
    handleInjectRefToChat,
  }
}
