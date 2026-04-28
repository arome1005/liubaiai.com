import { useCallback, useMemo, useState } from "react"
import type { ChatMessage } from "../components/tuiyan/TuiyanChatPanel"
import type { TuiyanState } from "../db/types"
import {
  migrateAndPruneChatThreadsToHydrated,
  type HydratedChatThread,
} from "../util/tuiyan-chat-sessions"

/**
 * 推演页右侧 AI 对话：多会话、历史遮罩预览（不切换活跃会话）、新建会话。
 */
export function useTuiyanChatSessions() {
  const [threads, setThreads] = useState<HydratedChatThread[]>([])
  const [activeChatThreadId, setActiveChatThreadId] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyPreviewThreadId, setHistoryPreviewThreadId] = useState<string | null>(null)

  const activeMessages = useMemo(
    () => threads.find((x) => x.id === activeChatThreadId)?.messages ?? [],
    [threads, activeChatThreadId],
  )

  const resetFromDb = useCallback((st: TuiyanState | undefined) => {
    const { threads: t, activeChatThreadId: aid } = migrateAndPruneChatThreadsToHydrated(st)
    setThreads(t)
    setActiveChatThreadId(aid)
    setHistoryPreviewThreadId(null)
    setHistoryOpen(false)
  }, [])

  const clearAll = useCallback(() => {
    resetFromDb(undefined)
  }, [resetFromDb])

  const appendUserToActive = useCallback(
    (msg: ChatMessage) => {
      const now = Date.now()
      setThreads((prev) =>
        prev.map((th) =>
          th.id === activeChatThreadId
            ? { ...th, messages: [...th.messages, msg], updatedAt: now }
            : th,
        ),
      )
    },
    [activeChatThreadId],
  )

  const appendAssistantToActive = useCallback(
    (content: string, relatedOutlineId?: string) => {
      const msg: ChatMessage = {
        id: `m${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: "assistant",
        content,
        timestamp: new Date(),
        relatedOutlineId,
      }
      const now = Date.now()
      setThreads((prev) =>
        prev.map((th) =>
          th.id === activeChatThreadId
            ? { ...th, messages: [...th.messages, msg], updatedAt: now }
            : th,
        ),
      )
    },
    [activeChatThreadId],
  )

  const createNewThread = useCallback(() => {
    const now = Date.now()
    const id = `th-${now}-${Math.random().toString(36).slice(2, 7)}`
    setThreads((prev) => [...prev, { id, createdAt: now, updatedAt: now, messages: [] }])
    setActiveChatThreadId(id)
    setHistoryOpen(false)
    setHistoryPreviewThreadId(null)
  }, [])

  const openHistory = useCallback(() => {
    setHistoryOpen(true)
    setHistoryPreviewThreadId(null)
  }, [])

  const closeHistory = useCallback(() => {
    setHistoryOpen(false)
    setHistoryPreviewThreadId(null)
  }, [])

  const selectHistoryPreview = useCallback((threadId: string) => {
    setHistoryPreviewThreadId(threadId)
  }, [])

  const clearHistoryPreview = useCallback(() => {
    setHistoryPreviewThreadId(null)
  }, [])

  const previewMessages = useMemo(() => {
    if (!historyPreviewThreadId) return [] as ChatMessage[]
    return threads.find((t) => t.id === historyPreviewThreadId)?.messages ?? []
  }, [threads, historyPreviewThreadId])

  return {
    threads,
    activeChatThreadId,
    activeMessages,
    historyOpen,
    historyPreviewThreadId,
    previewMessages,
    resetFromDb,
    clearAll,
    appendUserToActive,
    appendAssistantToActive,
    createNewThread,
    openHistory,
    closeHistory,
    selectHistoryPreview,
    clearHistoryPreview,
  }
}
