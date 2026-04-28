import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  BookOpen,
  ChevronDown,
  History,
  LibraryBig,
  List,
  Network,
  PenLine,
  PersonStanding,
  Plus,
  Settings,
  Sparkles,
  Undo2,
} from "lucide-react"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip"
import { UnifiedAIModelSelector as AIModelSelector } from "../ai-model-selector-unified"
import type { Work } from "../../db/types"
import { cn } from "../../lib/utils"

export type TuiyanTopBarTab = "outline" | "mindmap" | "wence"

export type TuiyanTopBarProps = {
  /** 作品下拉与切换 */
  works: Work[]
  workId: string | null
  toolbarWorkTitle: string
  primaryTag: string
  onSelectWork: (id: string) => void
  onGoLibrary: () => void

  /** 视图模式（大纲 / 导图 / 文策） */
  activeTab: TuiyanTopBarTab
  onChangeActiveTab: (tab: TuiyanTopBarTab) => void

  /** 返回写作页（按 workLinkSeg 跳转），为空时不显示按钮 */
  workLinkSeg: string | null

  /** 进入生辉·仿写（带作品/当前章 deep link），为空时不显示 */
  shengHuiHref: string | null

  /** 「生成即入库」全局开关 */
  autoLinkEnabled: boolean
  onToggleAutoLink: () => void

  /** AI 模型选择 */
  selectedAiModel: { icon: ReactNode; name: string }
  selectedModelId: string
  onSelectAiModel: (id: string) => void
  showModelSelector: boolean
  onSetShowModelSelector: (open: boolean) => void

  /** 顶栏的「AI 生成」快捷按钮 */
  isGenerating: boolean
  onAiGenerate: () => void
}

/**
 * 推演工作台顶栏：返回主页 / 作品下拉 / 视图模式 Tabs / 返回写作 / 自动入库 / 设置 / 模型选择 / AI 生成。
 *
 * 仅做数据驱动的布局，所有副作用通过回调上抛；不在组件内做任何持久化或路由跳转之外的逻辑。
 */
export function TuiyanTopBar(props: TuiyanTopBarProps) {
  const {
    works,
    workId,
    toolbarWorkTitle,
    primaryTag,
    onSelectWork,
    onGoLibrary,
    activeTab,
    onChangeActiveTab,
    workLinkSeg,
    shengHuiHref,
    autoLinkEnabled,
    onToggleAutoLink,
    selectedAiModel,
    selectedModelId,
    onSelectAiModel,
    showModelSelector,
    onSetShowModelSelector,
    isGenerating,
    onAiGenerate,
  } = props

  return (
    <div className="flex h-12 items-center justify-between border-b border-border/40 bg-card/45 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        {/* 返回主页（图标） */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onGoLibrary}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>返回主页</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Work Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-medium max-w-[10rem] truncate">{toolbarWorkTitle}</span>
              <Badge variant="secondary" className="h-4 text-[10px] shrink-0">
                {primaryTag}
              </Badge>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {works.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => onSelectWork(w.id)}>
                <BookOpen className="mr-2 h-4 w-4" />
                {w.title || "未命名"}
              </DropdownMenuItem>
            ))}
            {works.length === 0 && (
              <DropdownMenuItem disabled>暂无作品</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onGoLibrary}>
              <Plus className="mr-2 h-4 w-4" />
              去作品库新建
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-5 w-px bg-border/50" />

        {/* View Mode Tabs */}
        <div className="flex items-center rounded-xl border border-border/35 bg-card/70 p-0.5 shadow-sm backdrop-blur-sm">
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-all",
              activeTab === "outline"
                ? "bg-background/95 text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
            )}
            onClick={() => onChangeActiveTab("outline")}
          >
            <List className="h-4 w-4" />
            大纲
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-all",
              activeTab === "mindmap"
                ? "bg-background/95 text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
            )}
            onClick={() => onChangeActiveTab("mindmap")}
          >
            <Network className="h-4 w-4" />
            导图
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-all",
              activeTab === "wence"
                ? "bg-background/95 text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
            )}
            onClick={() => onChangeActiveTab("wence")}
          >
            <History className="h-4 w-4" />
            文策
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {workLinkSeg && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-base leading-none"
                  asChild
                >
                  <Link to={`/work/${workLinkSeg}`} aria-label="返回写作">
                    <PersonStanding className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>返回写作</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {shengHuiHref ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-base leading-none" asChild>
                  <Link to={shengHuiHref} aria-label="进入生辉">
                    <PenLine className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>进入生辉（本作品·当前章）</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                aria-label={autoLinkEnabled ? "生成即入库（已开）" : "生成即入库（已关）"}
                className={cn(
                  "h-8 w-8 p-0 transition-colors",
                  autoLinkEnabled ? "text-emerald-400" : "text-muted-foreground/40",
                )}
                onClick={onToggleAutoLink}
              >
                <LibraryBig className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {autoLinkEnabled ? "生成即入库（开）— 点击关闭" : "生成即入库（关）— 点击开启"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                <Link to="/settings" aria-label="推演设置">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>推演设置</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="h-8 max-w-[10.5rem] gap-1 px-2"
                onClick={() => onSetShowModelSelector(true)}
                aria-label="选择 AI 模型"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center [&>div]:h-6 [&>div]:w-6 [&>div]:scale-[0.72] [&>div]:origin-center">
                  {selectedAiModel.icon}
                </span>
                <span className="min-w-0 truncate text-xs font-medium">
                  {selectedAiModel.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">当前模型（与全局 AI 设置同步）</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button
          size="sm"
          className="h-8 gap-2"
          type="button"
          disabled={isGenerating || !workId}
          onClick={onAiGenerate}
        >
          <Sparkles className="h-4 w-4" />
          AI 生成
        </Button>

        <AIModelSelector
          open={showModelSelector}
          onOpenChange={onSetShowModelSelector}
          selectedModelId={selectedModelId}
          onSelectModel={onSelectAiModel}
          title="选择模型"
        />
      </div>
    </div>
  )
}
