import { useMemo } from "react"
import { Bot, ChevronLeft, X } from "lucide-react"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { cn } from "../../lib/utils"
import type { ChatMessage } from "./TuiyanChatPanel"
import type { HydratedChatThread } from "../../util/tuiyan-chat-sessions"

function previewSnippet(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")
  if (first?.content?.trim()) {
    const t = first.content.trim().replace(/\s+/g, " ")
    return t.length > 36 ? `${t.slice(0, 36)}…` : t
  }
  if (messages.length) return "（仅有助手回复）"
  return "（空对话）"
}

export type TuiyanChatHistoryOverlayProps = {
  open: boolean
  onClose: () => void
  threads: HydratedChatThread[]
  /** 当前正在编辑的会话（仅标注，点行不会切换） */
  activeChatThreadId: string
  previewThreadId: string | null
  previewMessages: ChatMessage[]
  onSelectPreviewThread: (threadId: string) => void
  /** 从全屏预览回到目字格列表 */
  onClearPreview: () => void
}

/** 历史列表 + 全屏预览：点某行后，标题栏与底栏之间的整块区域均为该会话预览页。 */
export function TuiyanChatHistoryOverlay(props: TuiyanChatHistoryOverlayProps) {
  const {
    open,
    onClose,
    threads,
    activeChatThreadId,
    previewThreadId,
    previewMessages,
    onSelectPreviewThread,
    onClearPreview,
  } = props

  const ordered = useMemo(
    () => [...threads].sort((a, b) => a.createdAt - b.createdAt),
    [threads],
  )

  const previewMeta = useMemo(() => {
    if (!previewThreadId) return null
    const th = threads.find((t) => t.id === previewThreadId)
    if (!th) return null
    const num = ordered.findIndex((t) => t.id === previewThreadId) + 1
    return {
      num,
      snippet: previewSnippet(th.messages),
      isActive: th.id === activeChatThreadId,
    }
  }, [previewThreadId, threads, ordered, activeChatThreadId])

  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-[#f9f6ef] text-foreground shadow-inner dark:bg-[#1c1914]"
      role="dialog"
      aria-modal="true"
      aria-label="对话历史"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-amber-900/25 bg-[#f3efe6] px-3 py-2 dark:border-amber-100/15 dark:bg-[#252018]">
        <div className="text-sm font-medium tracking-tight">对话历史</div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" type="button" title="关闭" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {previewThreadId && previewMeta ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-900/20 bg-[#faf7f0]/95 px-2 py-2 dark:border-amber-100/10 dark:bg-[#221c14]/95">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 shrink-0 gap-1 px-2 text-xs"
                onClick={onClearPreview}
              >
                <ChevronLeft className="h-4 w-4" />
                返回列表
              </Button>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">#{previewMeta.num}</span>
                  {previewMeta.isActive && (
                    <span className="ml-1.5 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[10px] text-primary">
                      当前会话
                    </span>
                  )}
                  <span className="mx-1 text-amber-900/40 dark:text-amber-100/30">·</span>
                  <span>{previewMeta.snippet}</span>
                </div>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 bg-[#fffcf5] dark:bg-[#1a1610]">
              <div className="space-y-3 p-3 pb-6">
                {previewMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "rounded-tl-sm bg-muted/60 text-foreground",
                      )}
                    >
                      <span className="whitespace-pre-wrap">{message.content}</span>
                    </div>
                  </div>
                ))}
                {previewMessages.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">该会话暂无消息</p>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-[#faf7f0]/90 dark:bg-[#221c14]/90">
            <div className="grid shrink-0 grid-cols-[2.25rem_1fr_auto] gap-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <div className="border-b border-r border-amber-900/15 px-1 py-1.5 text-center dark:border-amber-100/10">#</div>
              <div className="border-b border-r border-amber-900/15 px-2 py-1.5 dark:border-amber-100/10">摘要</div>
              <div className="border-b border-amber-900/15 px-2 py-1.5 text-right dark:border-amber-100/10">时间</div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="divide-y divide-amber-900/15 dark:divide-amber-100/10">
                {ordered.map((th, idx) => {
                  const num = idx + 1
                  const isActive = th.id === activeChatThreadId
                  return (
                    <button
                      key={th.id}
                      type="button"
                      className="grid w-full grid-cols-[2.25rem_1fr_auto] gap-0 text-left text-sm transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-950/40"
                      onClick={() => onSelectPreviewThread(th.id)}
                    >
                      <div className="border-r border-amber-900/10 py-2.5 text-center font-mono text-xs text-muted-foreground dark:border-amber-100/10">
                        {num}
                      </div>
                      <div className="min-w-0 border-r border-amber-900/10 px-2 py-2 dark:border-amber-100/10">
                        <div className="truncate text-[13px] leading-snug">{previewSnippet(th.messages)}</div>
                        {isActive && (
                          <span className="mt-0.5 inline-block rounded border border-primary/30 bg-primary/10 px-1 py-px text-[10px] text-primary">
                            当前会话
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 px-2 py-2 text-right text-[10px] text-muted-foreground tabular-nums">
                        {new Date(th.createdAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <p className="shrink-0 border-t border-amber-900/20 bg-[#f3efe6] px-3 py-2 text-[10px] leading-relaxed text-muted-foreground dark:border-amber-100/10 dark:bg-[#252018]">
        仅预览历史内容；关闭后仍停留在当前进行中的会话。超过 15 天未活动的记录会自动从库中删除。
      </p>
    </div>
  )
}
