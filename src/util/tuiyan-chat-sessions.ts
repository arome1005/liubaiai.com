import type { ChatMessage } from "../components/tuiyan/TuiyanChatPanel"
import type { TuiyanChatMessageRow, TuiyanChatThreadStored, TuiyanState } from "../db/types"

/** 推演对话会话在内存中的形态（消息带 Date） */
export type HydratedChatThread = {
  id: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

/** 单条会话超过该时长未更新则从持久化中删除（15 天） */
export const TUIYAN_CHAT_THREAD_RETENTION_MS = 15 * 24 * 60 * 60 * 1000

export function pruneStoredChatThreads(
  threads: TuiyanChatThreadStored[],
  nowMs: number,
): TuiyanChatThreadStored[] {
  const cutoff = nowMs - TUIYAN_CHAT_THREAD_RETENTION_MS
  return threads.filter((t) => t.updatedAt >= cutoff)
}

function storedMessagesToChatMessages(rows: TuiyanChatMessageRow[]): ChatMessage[] {
  return rows.map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  })) as ChatMessage[]
}

/** 从 DB 快照迁移/修剪会话，供页面与 hook 恢复状态 */
export function migrateAndPruneChatThreadsToHydrated(
  st: TuiyanState | undefined,
  nowMs = Date.now(),
): { threads: HydratedChatThread[]; activeChatThreadId: string } {
  let stored: TuiyanChatThreadStored[] = []

  if (st?.chatThreads?.length) {
    stored = st.chatThreads.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      messages: Array.isArray(t.messages) ? t.messages : [],
    }))
  } else if (st?.chatHistory?.length) {
    const msgs = st.chatHistory
    const lastTs = Math.max(...msgs.map((m) => m.timestamp), nowMs)
    const firstTs = Math.min(...msgs.map((m) => m.timestamp), nowMs)
    const id = `th-mig-${firstTs}`
    stored = [
      {
        id,
        createdAt: firstTs,
        updatedAt: lastTs,
        messages: msgs,
      },
    ]
  } else {
    const id = `th-${nowMs}`
    stored = [{ id, createdAt: nowMs, updatedAt: nowMs, messages: [] }]
  }

  stored = pruneStoredChatThreads(stored, nowMs)

  let activeId = (st?.activeChatThreadId ?? stored[0]?.id) || ""
  if (!stored.some((t) => t.id === activeId)) {
    activeId = stored[0]?.id ?? ""
  }

  if (!stored.length) {
    const id = `th-${nowMs}`
    return {
      threads: [{ id, createdAt: nowMs, updatedAt: nowMs, messages: [] }],
      activeChatThreadId: id,
    }
  }

  return {
    threads: stored.map((t) => ({
      ...t,
      messages: storedMessagesToChatMessages(t.messages),
    })),
    activeChatThreadId: activeId,
  }
}

/** 写入 DB 前：修剪、保证活跃 id 合法，并生成 chatHistory 镜像 */
export function toPersistedChatSessions(
  threads: HydratedChatThread[],
  activeChatThreadId: string,
  nowMs = Date.now(),
): {
  chatThreads: TuiyanChatThreadStored[]
  activeChatThreadId: string | null
  chatHistory: TuiyanState["chatHistory"]
} {
  const serial: TuiyanChatThreadStored[] = threads.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: t.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.getTime() : Date.now(),
      relatedOutlineId: m.relatedOutlineId,
    })),
  }))

  let pruned = pruneStoredChatThreads(serial, nowMs)

  if (!pruned.length) {
    const id = `th-${nowMs}`
    pruned = [{ id, createdAt: nowMs, updatedAt: nowMs, messages: [] }]
  }

  let activeId = activeChatThreadId
  if (!pruned.some((t) => t.id === activeId)) {
    activeId = pruned[0]!.id
  }

  const active = pruned.find((t) => t.id === activeId)!

  return {
    chatThreads: pruned,
    activeChatThreadId: activeId,
    chatHistory: active.messages,
  }
}
