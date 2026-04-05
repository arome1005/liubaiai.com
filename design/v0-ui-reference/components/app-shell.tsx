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
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface AppShellProps {
  activeModule: string
  onModuleChange: (module: string) => void
  children: React.ReactNode
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

export function AppShell({ activeModule, onModuleChange, children }: AppShellProps) {
  const [showSearch, setShowSearch] = useState(false)

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
                <DropdownMenuItem>
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
    </div>
  )
}
