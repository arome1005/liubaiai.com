"use client"

import { useState } from "react"
import {
  Settings,
  User,
  Bell,
  Search,
  Command,
  Moon,
  Sun,
  Keyboard,
  HelpCircle,
  LogOut,
  ChevronDown,
  BookOpen,
  FileText,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  X,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

// 当前作品上下文类型
interface CurrentWorkContext {
  workId: string
  workTitle: string
  currentChapterId?: string
  currentChapterTitle?: string
  currentChapterNumber?: number
  totalChapters?: number
  lastEditedAt?: Date
  wordCount?: number
  tags?: string[]
}

interface AppShellProps {
  activeModule: string
  onModuleChange: (module: string) => void
  children: React.ReactNode
  currentWork?: CurrentWorkContext
  onWorkChange?: (workId: string | null) => void
}

// 模拟当前作品数据
const mockCurrentWork: CurrentWorkContext = {
  workId: "work-1",
  workTitle: "星辰变",
  currentChapterId: "ch-15",
  currentChapterTitle: "第十五章：突破瓶颈",
  currentChapterNumber: 15,
  totalChapters: 42,
  lastEditedAt: new Date(),
  wordCount: 156800,
  tags: ["玄幻", "升级", "热血"],
}

const modules = [
  { id: "liubai", label: "留白", description: "作品库", shortcut: "1" },
  { id: "tuiyan", label: "推演", description: "大纲与逻辑", shortcut: "2" },
  { id: "liuguang", label: "流光", description: "灵感碎片", shortcut: "3" },
  { id: "wence", label: "问策", description: "策略对话", shortcut: "4" },
  { id: "luobi", label: "落笔", description: "写作编辑", shortcut: "5" },
  { id: "shenghui", label: "生辉", description: "AI 仿写", shortcut: "6" },
  { id: "cangjing", label: "藏经", description: "参考书库", shortcut: "7" },
]

export function AppShell({ 
  activeModule, 
  onModuleChange, 
  children,
  currentWork = mockCurrentWork,
  onWorkChange,
}: AppShellProps) {
  const [showSearch, setShowSearch] = useState(false)
  const [showAIDeclaration, setShowAIDeclaration] = useState(false)
  const [aiDeclarationAccepted, setAiDeclarationAccepted] = useState(false)
  const [hasAcceptedDeclaration, setHasAcceptedDeclaration] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 lg:px-6">
          {/* Logo */}
          <div className="mr-6 flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <span className="text-base font-semibold text-primary">留</span>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent" />
            </div>
            <div className="hidden sm:block">
              <span className="text-sm font-semibold tracking-wide text-foreground">留白写作</span>
              <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                BETA
              </span>
            </div>
          </div>

          {/* Current Work Context Button - 当前作品上下文（可隐藏弹窗） */}
          {currentWork && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="mr-2 flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 transition-colors hover:bg-primary/10">
                  <BookOpen className="h-4 w-4 text-primary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-0">
                {/* 作品信息头部 */}
                <div className="border-b border-border/50 bg-muted/30 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">{currentWork.workTitle}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        第{currentWork.currentChapterNumber}章 · {currentWork.currentChapterTitle}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {currentWork.tags?.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* 统计信息 */}
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-background/60 p-2 text-center">
                      <p className="text-lg font-semibold text-foreground">{currentWork.totalChapters}</p>
                      <p className="text-[10px] text-muted-foreground">总章节</p>
                    </div>
                    <div className="rounded-lg bg-background/60 p-2 text-center">
                      <p className="text-lg font-semibold text-foreground">{((currentWork.wordCount || 0) / 10000).toFixed(1)}万</p>
                      <p className="text-[10px] text-muted-foreground">总字数</p>
                    </div>
                    <div className="rounded-lg bg-background/60 p-2 text-center">
                      <p className="text-lg font-semibold text-foreground">{currentWork.currentChapterNumber}</p>
                      <p className="text-[10px] text-muted-foreground">当前章</p>
                    </div>
                  </div>
                </div>
                
                {/* 快捷操作 */}
                <div className="p-2">
                  <DropdownMenuItem onClick={() => onModuleChange("luobi")} className="gap-2 rounded-lg">
                    <FileText className="h-4 w-4 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">继续编辑</p>
                      <p className="text-xs text-muted-foreground">打开落笔模块</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onModuleChange("tuiyan")} className="gap-2 rounded-lg">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <div className="flex-1">
                      <p className="font-medium">查看大纲</p>
                      <p className="text-xs text-muted-foreground">打开推演模块</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onModuleChange("liubai")} className="gap-2 rounded-lg">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">切换作品</p>
                      <p className="text-xs text-muted-foreground">返回作品库</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Navigation Modules */}
          <nav className="flex flex-1 items-center gap-0.5">
            {modules.map((module) => (
              <button
                key={module.id}
                onClick={() => onModuleChange(module.id)}
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  "rounded-lg",
                  activeModule === module.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span>{module.label}</span>
                <span className="hidden text-[10px] opacity-50 lg:inline">
                  {module.shortcut}
                </span>
                {activeModule === module.id && (
                  <span className="absolute -bottom-[9px] left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-1">
            {/* Global Search */}
            <button
              onClick={() => setShowSearch(true)}
              className="flex h-8 items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">搜索</span>
              <kbd className="pointer-events-none hidden h-5 items-center gap-1 rounded border border-border/50 bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground lg:flex">
                <Command className="h-3 w-3" />K
              </kbd>
            </button>

            <div className="mx-2 h-5 w-px bg-border/50" />

            {/* Notifications */}
            <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            </button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 items-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/20">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-foreground">写作者</p>
                  <p className="text-xs text-muted-foreground">writer@liubai.app</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModuleChange("settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Keyboard className="mr-2 h-4 w-4" />
                  快捷键
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Moon className="mr-2 h-4 w-4" />
                  深色模式
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  帮助与反馈
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Search Modal Placeholder */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 pt-[15vh] backdrop-blur-sm"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border/50 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索作品、章节、人物..."
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <kbd className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
                ESC
              </kbd>
            </div>
            <div className="p-4">
              <p className="text-center text-sm text-muted-foreground">
                输入关键词开始搜索
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Declaration Dialog - 虚构创作声明 */}
      <Dialog open={showAIDeclaration} onOpenChange={setShowAIDeclaration}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center text-xl">AI 辅助创作声明</DialogTitle>
            <DialogDescription className="text-center">
              ��使用 AI 功能前，请阅读并确认以下内容
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 核心声明 */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                虚构创作说明
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>AI 生成的内容仅供<strong className="text-foreground">虚构创作</strong>参考，不代表任何真实事件或观点</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>创作内容应遵守法律法规，<strong className="text-foreground">不鼓励任何现实伤害行为</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>AI 可能产生不准确或不当内容，<strong className="text-foreground">最终内容由您审核负责</strong></span>
                </li>
              </ul>
            </div>

            {/* 数据说明 */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <FileText className="h-4 w-4 text-primary" />
                数据使用说明
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>您的作品内容将按需发送至 AI 服务商处理</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>「藏经」参考书库内容<strong className="text-foreground">仅存储在本地</strong>，不会上传至云端</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>详细的数据政策请查阅<a href="#" className="text-primary hover:underline">隐私政策</a></span>
                </li>
              </ul>
            </div>

            {/* 同人/二创提示 */}
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <h4 className="mb-2 flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                同人/二创创作提示
              </h4>
              <p className="text-sm text-muted-foreground">
                若您的创作涉及同人或二次创作，请确保遵守原作品的版权规定和发布平台的相关规则。
                <strong className="text-foreground">版权与平台规则合规由创作者自行负责</strong>。
              </p>
            </div>

            {/* 确认勾选 */}
            <div className="flex items-start gap-3 rounded-lg border border-border/50 p-4">
              <Checkbox
                id="ai-declaration"
                checked={aiDeclarationAccepted}
                onCheckedChange={(checked) => setAiDeclarationAccepted(checked === true)}
              />
              <label htmlFor="ai-declaration" className="text-sm text-foreground">
                我已阅读并理解上述内容，同意在遵守相关规定的前提下使用 AI 辅助创作功能
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowAIDeclaration(false)}
            >
              稍后再说
            </Button>
            <Button
              disabled={!aiDeclarationAccepted}
              onClick={() => {
                setHasAcceptedDeclaration(true)
                setShowAIDeclaration(false)
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              确认并继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
