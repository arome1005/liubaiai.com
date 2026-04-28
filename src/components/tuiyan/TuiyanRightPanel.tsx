import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, History, PanelRightClose, Plus } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover"

export type TuiyanRightPanelTab = "detail" | "chat" | "reference"

export type TuiyanChatTabMenuActions = {
  onNewChat: () => void
  onOpenHistory: () => void
}

export type TuiyanRightPanelProps = {
  show: boolean
  width: number
  activeTab: TuiyanRightPanelTab
  onChangeTab: (tab: TuiyanRightPanelTab) => void
  onCollapse: () => void
  onExpand: () => void
  onBeginResize: (clientX: number) => void
  onResetWidth: () => void
  detail: ReactNode
  chat: ReactNode
  reference: ReactNode
  /** AI 对话：点击或悬停停顿后小弹窗（新建 / 历史） */
  chatTabMenuActions?: TuiyanChatTabMenuActions
}

const RIGHT_TABS: { value: TuiyanRightPanelTab; label: string }[] = [
  { value: "detail", label: "详情" },
  { value: "chat", label: "AI 对话" },
  { value: "reference", label: "参考" },
]

/** 悬停多久打开会话菜单（ms） */
const CHAT_TAB_HOVER_OPEN_MS = 320
/** 指针离开 tab 或菜单后多久关闭（ms） */
const CHAT_TAB_HOVER_CLOSE_MS = 200

function TuiyanChatTabWithPopover(props: {
  active: boolean
  label: string
  onActivateTab: () => void
  chatTabMenuActions: TuiyanChatTabMenuActions
}) {
  const { active, label, onActivateTab, chatTabMenuActions } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const openTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  const onTriggerMouseEnter = useCallback(() => {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    if (menuOpen) return
    clearTimeout(openTimerRef.current)
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      onActivateTab()
      setMenuOpen(true)
    }, CHAT_TAB_HOVER_OPEN_MS)
  }, [menuOpen, onActivateTab])

  const scheduleCloseMenu = useCallback(() => {
    clearTimeout(openTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setMenuOpen(false)
    }, CHAT_TAB_HOVER_CLOSE_MS)
  }, [])

  const handlePopoverOpenChange = useCallback(
    (next: boolean) => {
      if (!next) clearTimers()
      setMenuOpen(next)
    },
    [clearTimers],
  )

  const handleTabClick = useCallback(() => {
    clearTimers()
    onActivateTab()
    setMenuOpen((prev) => !prev)
  }, [clearTimers, onActivateTab])

  return (
    <Popover open={menuOpen} onOpenChange={handlePopoverOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <button
          type="button"
          className={cn(
            "relative flex min-w-0 flex-1 py-3 text-sm font-medium transition-colors outline-none",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onMouseEnter={onTriggerMouseEnter}
          onMouseLeave={scheduleCloseMenu}
          onClick={handleTabClick}
        >
          <span className="block truncate px-1">{label}</span>
          {active && (
            <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={4}
        className="w-[7.5rem] border-border/80 p-1 shadow-md"
        onPointerEnter={clearTimers}
        onPointerLeave={scheduleCloseMenu}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onActivateTab()
            chatTabMenuActions.onNewChat()
            setMenuOpen(false)
          }}
        >
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          新建
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          onClick={() => {
            onActivateTab()
            chatTabMenuActions.onOpenHistory()
            setMenuOpen(false)
          }}
        >
          <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          历史
        </button>
      </PopoverContent>
    </Popover>
  )
}

/** 右侧 Detail / Chat / Reference 三联：负责右栏壳、tab 切换、折叠与宽度拖拽。 */
export function TuiyanRightPanel(props: TuiyanRightPanelProps) {
  const {
    show,
    width,
    activeTab,
    onChangeTab,
    onCollapse,
    onExpand,
    onBeginResize,
    onResetWidth,
    detail,
    chat,
    reference,
    chatTabMenuActions,
  } = props

  if (!show) {
    return (
      <div className="flex w-8 shrink-0 items-start border-l border-border/40 bg-card/10 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="mx-auto h-7 w-7 p-0"
          type="button"
          title="展开右侧栏"
          onClick={onExpand}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右侧栏宽度"
        title="拖拽调整宽度；双击恢复默认"
        onMouseDown={(e) => {
          e.preventDefault()
          onBeginResize(e.clientX)
        }}
        onDoubleClick={onResetWidth}
      />
      <div
        className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden border-l border-border/40 bg-card/20"
        style={{ width: `${width}px` }}
      >
        <div className="flex items-center border-b border-border/40">
          <div className="flex h-[45px] w-10 shrink-0 items-center justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              type="button"
              title="收起右侧栏"
              onClick={onCollapse}
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
          {RIGHT_TABS.map((tab) =>
            tab.value === "chat" && chatTabMenuActions ? (
              <TuiyanChatTabWithPopover
                key={tab.value}
                active={activeTab === tab.value}
                label={tab.label}
                onActivateTab={() => onChangeTab("chat")}
                chatTabMenuActions={chatTabMenuActions}
              />
            ) : (
              <button
                key={tab.value}
                type="button"
                className={cn(
                  "relative flex-1 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.value
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onChangeTab(tab.value)}
              >
                {tab.label}
                {activeTab === tab.value && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            ),
          )}
        </div>

        {activeTab === "chat" && chat}
        {activeTab === "reference" && reference}
        {activeTab === "detail" && detail}
      </div>
    </>
  )
}
