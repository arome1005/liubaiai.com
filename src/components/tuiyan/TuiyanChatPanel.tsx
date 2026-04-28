import { useCallback } from "react"
import { Bot, Send, Brain, Zap, Swords, Users, GitMerge, ThumbsUp, ThumbsDown, Copy, Wand2 } from "lucide-react"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { ScrollArea } from "../ui/scroll-area"
import { Badge } from "../ui/badge"
import { cn } from "../../lib/utils"
import type { TuiyanPlanningNode } from "../../db/types"

// ── 公共类型（由页面 import） ───────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  relatedOutlineId?: string
  suggestedChanges?: {
    type: "add" | "modify" | "delete"
    target: string
    content: string
  }[]
  isApplied?: boolean
}

// ── 快捷提示词 ─────────────────────────────────────────────────────────────

/** 规划模式快捷词：针对结构建构，不是续写 */
const PLANNING_QUICK_PROMPTS = [
  { icon: Zap, text: "展开这个节点" },
  { icon: Swords, text: "强化冲突设计" },
  { icon: Users, text: "角色弧光建议" },
  { icon: GitMerge, text: "如何连接上下层" },
] as const

/** 兜底模式（无规划节点时）保留续写向 */
const WRITING_QUICK_PROMPTS = [
  { icon: Zap, text: "优化节奏" },
  { icon: Users, text: "完善人物" },
  { icon: Swords, text: "强化冲突" },
  { icon: Brain, text: "理清逻辑" },
] as const

// ── ChatMessageBubble ──────────────────────────────────────────────────────

function ChatMessageBubble({
  message,
  onWriteToDraft,
  onGoWence,
  inline = false,
}: {
  message: ChatMessage
  onWriteToDraft?: (content: string) => void
  onGoWence?: (content: string) => void
  inline?: boolean
}) {
  const isAssistant = message.role === "assistant"
  const isBranchLike = isAssistant && /分支\d+：/.test(message.content)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(message.content)
  }, [message.content])

  const actionBar = (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      {isBranchLike && (
        <>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            onClick={() => onWriteToDraft?.(message.content)}
            type="button"
          >
            写入侧栏草稿
          </button>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            onClick={() => onGoWence?.(message.content)}
            type="button"
          >
            去问策跟进
          </button>
        </>
      )}
      {isAssistant && (
        <div className="flex items-center gap-0.5 ml-auto">
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="有帮助" type="button">
            <ThumbsUp className="h-3 w-3 text-muted-foreground" />
          </button>
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="无帮助" type="button">
            <ThumbsDown className="h-3 w-3 text-muted-foreground" />
          </button>
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="复制" type="button" onClick={handleCopy}>
            <Copy className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  )

  if (inline) {
    return (
      <div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
        {message.suggestedChanges && message.suggestedChanges.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.suggestedChanges.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-1.5">
                <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1 text-xs text-muted-foreground">
                  {change.type === "add" && "添加："}
                  {change.type === "modify" && "修改："}
                  {change.type === "delete" && "删除："}
                  {change.content}
                </span>
                {!message.isApplied && (
                  <Badge variant="secondary" className="h-5 text-[10px]">采纳</Badge>
                )}
                {message.isApplied && (
                  <Badge variant="secondary" className="h-5 text-[10px]">已应用</Badge>
                )}
              </div>
            ))}
          </div>
        )}
        {actionBar}
      </div>
    )
  }

  return null
}

// ── TuiyanChatPanel ────────────────────────────────────────────────────────

export interface TuiyanChatPanelProps {
  /** 当前选中的规划节点（有则进入规划顾问模式） */
  planningSelectedNode: TuiyanPlanningNode | null
  /** 无规划节点时写作大纲选中节点的标题（仅用于 placeholder 显示） */
  outlineNodeTitle: string | null
  chatHistory: ChatMessage[]
  isGenerating: boolean
  chatInput: string
  setChatInput: (v: string) => void
  /** 父组件负责构建 context 并调用 AI，此回调只传用户文本 */
  onSend: (text: string) => void
  onWriteToDraft: (content: string) => void
  onGoWence: (content: string) => void
  chatScrollRef: React.RefObject<HTMLDivElement | null>
}

export function TuiyanChatPanel({
  planningSelectedNode,
  outlineNodeTitle,
  chatHistory,
  isGenerating,
  chatInput,
  setChatInput,
  onSend,
  onWriteToDraft,
  onGoWence,
  chatScrollRef,
}: TuiyanChatPanelProps) {
  const isPlanningMode = planningSelectedNode !== null
  const quickPrompts = isPlanningMode ? PLANNING_QUICK_PROMPTS : WRITING_QUICK_PROMPTS
  const activeTitle = planningSelectedNode?.title ?? outlineNodeTitle

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        const text = chatInput.trim()
        if (text && !isGenerating) onSend(text)
      }
    },
    [chatInput, isGenerating, onSend],
  )

  const handleSend = useCallback(() => {
    const text = chatInput.trim()
    if (text && !isGenerating) onSend(text)
  }, [chatInput, isGenerating, onSend])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* 消息列表 */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={chatScrollRef}>
        <div className="space-y-3">
          {chatHistory.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Bot className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {isPlanningMode
                  ? <>选中节点：<span className="font-medium text-foreground/70">{planningSelectedNode?.title}</span><br />就规划结构、冲突、人物弧光等提问</>
                  : <>选择左侧规划节点，或描述想法开始对话</>
                }
              </p>
            </div>
          )}
          {chatHistory.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-2", message.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              {message.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div className={cn("flex flex-col gap-1 max-w-[85%]", message.role === "user" ? "items-end" : "items-start")}>
                <div className={cn(
                  "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted/60 text-foreground rounded-tl-sm"
                )}>
                  {message.role === "assistant" ? (
                    <ChatMessageBubble
                      message={message}
                      onWriteToDraft={onWriteToDraft}
                      onGoWence={onGoWence}
                      inline
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {message.timestamp instanceof Date
                    ? message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
                    : ""}
                </span>
              </div>
            </div>
          ))}
          {isGenerating && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
              </div>
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="shrink-0 border-t border-border/40 p-3 space-y-2">
        {/* 快捷提示词 */}
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((p) => (
            <button
              key={p.text}
              type="button"
              className="flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              onClick={() => setChatInput(chatInput ? chatInput + " " + p.text : p.text)}
            >
              <p.icon className="h-3 w-3" />
              {p.text}
            </button>
          ))}
        </div>

        {/* Textarea + 发送 */}
        <div className="relative">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={
              activeTitle
                ? `对「${activeTitle}」提问…`
                : "描述你的想法，Enter 发送…"
            }
            className="min-h-[72px] max-h-[140px] resize-none pr-12 text-sm"
            onKeyDown={handleKeyDown}
          />
          <Button
            size="icon"
            className="absolute bottom-2 right-2 h-7 w-7 rounded-full"
            onClick={handleSend}
            disabled={!chatInput.trim() || isGenerating}
            title="发送 (Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 状态栏 */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {isPlanningMode ? (
              <>模式：<span className="text-primary/80">规划顾问</span>
              {" · "}已选：<span className="text-foreground/70">{planningSelectedNode?.title}</span></>
            ) : (
              <>已选节点：<span className="text-foreground/70">{outlineNodeTitle ?? "无"}</span></>
            )}
          </span>
          <span>Shift+Enter 换行</span>
        </div>
      </div>
    </div>
  )
}
