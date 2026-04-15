"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Plus,
  FileText,
  Save,
  Search,
  MoreVertical,
  Trash2,
  Pin,
  Copy,
  Maximize2,
  Minimize2,
  Undo,
  Redo,
  Settings2,
  Keyboard,
  Target,
  Wand2,
  Brain,
  MessageSquare,
  Check,
  GripVertical,
  Edit3,
  FolderOpen,
  X,
  Eye,
  EyeOff,
  Type,
  AlignLeft,
  Moon,
  Sun,
  Palette,
  Zap,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Send,
  RefreshCw,
  History,
  LayoutGrid,
  List,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AIModelSelector, AI_MODELS } from "@/components/ai-model-selector"

// 类型定义
interface Chapter {
  id: string
  title: string
  wordCount: number
  status: "draft" | "writing" | "complete"
  volumeId?: string
  order: number
  summary?: string
  lastEditedAt?: Date
}

interface Volume {
  id: string
  title: string
  order: number
}

interface WritingSettings {
  // 排版
  fontSize: number
  fontFamily: string
  lineHeight: number
  // 外观
  theme: "light" | "dark" | "system"
  skin: string
  eyeProtection: boolean
  // 输入习惯
  chineseQuotes: boolean
  paragraphIndent: number
  paragraphSpacing: number
  // 快捷
  continuationShortcut: "space" | "ctrlK" | "off"
  // AI
  aiPanelPosition: "sidebar" | "popup"
}

interface AIMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

// 模拟数据
const mockVolumes: Volume[] = [
  { id: "v1", title: "第一卷 · 风起青云", order: 1 },
  { id: "v2", title: "第二卷 · 江湖恩怨", order: 2 },
  { id: "v3", title: "第三卷 · 复仇之路", order: 3 },
]

const mockChapters: Chapter[] = [
  { id: "c1", title: "序章 · 大火之夜", wordCount: 3200, status: "complete", volumeId: "v1", order: 1, lastEditedAt: new Date("2024-03-01") },
  { id: "c2", title: "第一章 · 三年之后", wordCount: 4100, status: "complete", volumeId: "v1", order: 2, lastEditedAt: new Date("2024-03-02") },
  { id: "c3", title: "第二章 · 暗夜访客", wordCount: 3800, status: "complete", volumeId: "v1", order: 3, lastEditedAt: new Date("2024-03-03") },
  { id: "c4", title: "第三章 · 初露锋芒", wordCount: 4500, status: "complete", volumeId: "v1", order: 4, lastEditedAt: new Date("2024-03-04") },
  { id: "c5", title: "第四章 · 旧日恩怨", wordCount: 3600, status: "writing", volumeId: "v1", order: 5, lastEditedAt: new Date("2024-03-05") },
  { id: "c6", title: "第五章 · 山雨欲来", wordCount: 2100, status: "draft", volumeId: "v1", order: 6, lastEditedAt: new Date("2024-03-06") },
  { id: "c7", title: "第六章 · 江湖再见", wordCount: 0, status: "draft", volumeId: "v2", order: 1, lastEditedAt: new Date("2024-03-07") },
]

const defaultContent = `夜色如墨，青云城西的萧府笼罩在一片死寂之中。

三年前那场大火，将曾经繁华的府邸化为废墟，也将萧然的人生撕成两半——火光之前，他是城主之子，锦衣玉食；火光之后，他只剩下一颗复仇的心和福伯留下的一柄残剑。

"少爷，时候到了。"

身后传来苍老而沙哑的声音。萧然没有回头，目光依然停在远处灯火通明的城主府。

那里，正是他要复仇的地方。

"福伯，三年了。"萧然的声音很轻，却带着不容置疑的决绝，"今夜，我们从长乐坊开始。"

老仆弓着腰，将一件黑色披风递上前来："老奴已经打探清楚，长乐坊的刘掌柜今晚会在后院清点账目，护卫不过三五人。"

萧然接过披风，眼中闪过一丝寒光："刘掌柜当年是父亲的账房，却在大火前三日突然辞去，带着府中所有账册投靠了......"`

const defaultSettings: WritingSettings = {
  fontSize: 16,
  fontFamily: "system",
  lineHeight: 1.8,
  theme: "dark",
  skin: "default",
  eyeProtection: false,
  chineseQuotes: true,
  paragraphIndent: 2,
  paragraphSpacing: 1,
  continuationShortcut: "ctrlK",
  aiPanelPosition: "sidebar",
}

interface ImmersiveEditorProps {
  workTitle?: string
  onExit?: () => void
}

export function ImmersiveEditor({ workTitle = "星辰变", onExit }: ImmersiveEditorProps) {
  // 布局状态
  const [isImmersive, setIsImmersive] = useState(true)
  const [showChapterSidebar, setShowChapterSidebar] = useState(true)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [chapterSidebarWidth, setChapterSidebarWidth] = useState(280)
  const [aiPanelWidth, setAiPanelWidth] = useState(360)
  
  // 章节状态
  const [chapters, setChapters] = useState(mockChapters)
  const [volumes] = useState(mockVolumes)
  const [currentChapter, setCurrentChapter] = useState(mockChapters[4])
  const [expandedVolumes, setExpandedVolumes] = useState<string[]>(["v1", "v2"])
  const [chapterSearch, setChapterSearch] = useState("")
  const [draggedChapter, setDraggedChapter] = useState<string | null>(null)
  
  // 编辑器状态
  const [content, setContent] = useState(defaultContent)
  const [wordCount, setWordCount] = useState(0)
  const [isSaved, setIsSaved] = useState(true)
  const [dailyGoal] = useState(2000)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  
  // 设置状态
  const [settings, setSettings] = useState<WritingSettings>(defaultSettings)
  const [showSettings, setShowSettings] = useState(false)
  
  // AI 状态
  const [selectedModelId, setSelectedModelId] = useState("tingyu")
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([])
  const [aiInput, setAiInput] = useState("")
  const [aiTab, setAiTab] = useState<"chat" | "continue" | "polish">("chat")
  const selectedModel = AI_MODELS.find(m => m.id === selectedModelId) || AI_MODELS[0]

  // 字数统计
  useEffect(() => {
    const count = content.replace(/\s/g, "").length
    setWordCount(count)
    setIsSaved(false)
  }, [content])

  // 拖拽调整宽度
  const handleChapterResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = chapterSidebarWidth

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      setChapterSidebarWidth(Math.max(200, Math.min(400, startWidth + delta)))
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [chapterSidebarWidth])

  const handleAiResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = aiPanelWidth

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX
      setAiPanelWidth(Math.max(300, Math.min(500, startWidth + delta)))
    }

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }, [aiPanelWidth])

  // 章节过滤
  const filteredChapters = chapters.filter(ch => 
    ch.title.toLowerCase().includes(chapterSearch.toLowerCase())
  )

  const goalProgress = Math.min((wordCount / dailyGoal) * 100, 100)

  // 新建章节
  const handleNewChapter = (volumeId: string) => {
    const volumeChapters = chapters.filter(ch => ch.volumeId === volumeId)
    const newChapter: Chapter = {
      id: `c${Date.now()}`,
      title: `新章节 ${volumeChapters.length + 1}`,
      wordCount: 0,
      status: "draft",
      volumeId,
      order: volumeChapters.length + 1,
      lastEditedAt: new Date(),
    }
    setChapters([...chapters, newChapter])
    setCurrentChapter(newChapter)
  }

  // 删除章节
  const handleDeleteChapter = (chapterId: string) => {
    setChapters(chapters.filter(ch => ch.id !== chapterId))
    if (currentChapter?.id === chapterId) {
      setCurrentChapter(chapters[0])
    }
  }

  // 发送 AI 消息
  const handleSendAiMessage = () => {
    if (!aiInput.trim()) return
    
    const userMessage: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: aiInput,
      timestamp: new Date(),
    }
    
    setAiMessages([...aiMessages, userMessage])
    setAiInput("")
    
    // 模拟 AI 回复
    setTimeout(() => {
      const aiResponse: AIMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "我理解您的需求。根据当前章节的上下文，我建议...",
        timestamp: new Date(),
      }
      setAiMessages(prev => [...prev, aiResponse])
    }, 1000)
  }

  return (
    <TooltipProvider>
      <div className={cn(
        "flex h-screen w-screen flex-col bg-background",
        isImmersive && "fixed inset-0 z-50"
      )}>
        {/* 顶栏 - 沉浸模式下极简 */}
        <div className={cn(
          "flex items-center justify-between border-b border-border/30 bg-card/50 backdrop-blur-sm transition-all",
          isImmersive ? "h-10 px-3" : "h-12 px-4"
        )}>
          {/* 左侧 */}
          <div className="flex items-center gap-2">
            {/* 退出/返回 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onExit}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>退出沉浸模式</TooltipContent>
            </Tooltip>
            
            {/* 章节栏切换 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowChapterSidebar(!showChapterSidebar)}
                >
                  {showChapterSidebar ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showChapterSidebar ? "隐藏章节栏" : "显示章节栏"}
              </TooltipContent>
            </Tooltip>
            
            <div className="h-4 w-px bg-border/50" />
            
            {/* 当前章节信息 */}
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{workTitle}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-sm font-medium text-foreground">{currentChapter?.title}</span>
            </div>
          </div>
          
          {/* 中间 - 字数与保存状态 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                "font-medium",
                wordCount >= dailyGoal && "text-green-500"
              )}>
                {wordCount.toLocaleString()} 字
              </span>
              <span>/</span>
              <span>{dailyGoal.toLocaleString()} 目标</span>
              <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    wordCount >= dailyGoal ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-1 text-xs">
              {isSaved ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-muted-foreground">已保存</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">未保存</span>
                </>
              )}
            </div>
          </div>
          
          {/* 右侧 */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Undo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>撤销</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Redo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>重做</TooltipContent>
            </Tooltip>
            
            <div className="h-4 w-px bg-border/50" />
            
            {/* AI 面板切换 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showAiPanel ? "secondary" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowAiPanel(!showAiPanel)}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showAiPanel ? "隐藏 AI 面板" : "显示 AI 面板"}
              </TooltipContent>
            </Tooltip>
            
            {/* 设置 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>写作设置</TooltipContent>
            </Tooltip>
            
            {/* 全屏切换 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsImmersive(!isImmersive)}
                >
                  {isImmersive ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isImmersive ? "退出全屏" : "全屏模式"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧章节栏 */}
          {showChapterSidebar && (
            <>
              <div 
                className="flex flex-col border-r border-border/30 bg-card/30"
                style={{ width: chapterSidebarWidth }}
              >
                {/* 章节栏头部 */}
                <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">章节</span>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleNewChapter("v1")}>
                          新建章节
                        </DropdownMenuItem>
                        <DropdownMenuItem>新建卷</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                
                {/* 搜索 */}
                <div className="border-b border-border/30 px-3 py-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="搜索章节..."
                      value={chapterSearch}
                      onChange={(e) => setChapterSearch(e.target.value)}
                      className="h-7 pl-7 text-xs"
                    />
                  </div>
                </div>
                
                {/* 章节列表 */}
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {volumes.map((volume) => {
                      const volumeChapters = filteredChapters.filter(ch => ch.volumeId === volume.id)
                      const isExpanded = expandedVolumes.includes(volume.id)
                      const totalWords = volumeChapters.reduce((sum, ch) => sum + ch.wordCount, 0)
                      
                      return (
                        <div key={volume.id} className="mb-2">
                          {/* 卷标题 */}
                          <button
                            onClick={() => {
                              setExpandedVolumes(
                                isExpanded
                                  ? expandedVolumes.filter(id => id !== volume.id)
                                  : [...expandedVolumes, volume.id]
                              )
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                          >
                            <ChevronRight className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform",
                              isExpanded && "rotate-90"
                            )} />
                            <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
                            <span className="flex-1 text-xs font-medium text-foreground">
                              {volume.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {volumeChapters.length}章 · {(totalWords / 10000).toFixed(1)}万
                            </span>
                          </button>
                          
                          {/* 章节列表 */}
                          {isExpanded && (
                            <div className="ml-4 mt-1 space-y-0.5">
                              {volumeChapters.map((chapter) => (
                                <div
                                  key={chapter.id}
                                  draggable
                                  onDragStart={() => setDraggedChapter(chapter.id)}
                                  onDragEnd={() => setDraggedChapter(null)}
                                  onClick={() => setCurrentChapter(chapter)}
                                  className={cn(
                                    "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                                    currentChapter?.id === chapter.id
                                      ? "bg-primary/10 text-primary"
                                      : "hover:bg-muted/50",
                                    draggedChapter === chapter.id && "opacity-50"
                                  )}
                                >
                                  <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                  <div className="flex-1 min-w-0">
                                    <p className={cn(
                                      "truncate text-xs",
                                      currentChapter?.id === chapter.id
                                        ? "font-medium"
                                        : "text-foreground"
                                    )}>
                                      {chapter.title}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {chapter.wordCount.toLocaleString()} 字
                                    </p>
                                  </div>
                                  <div className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    chapter.status === "complete" && "bg-green-500",
                                    chapter.status === "writing" && "bg-amber-500",
                                    chapter.status === "draft" && "bg-muted-foreground"
                                  )} />
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem>
                                        <Edit3 className="mr-2 h-3.5 w-3.5" />
                                        重命名
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        <Copy className="mr-2 h-3.5 w-3.5" />
                                        复制
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteChapter(chapter.id)
                                        }}
                                      >
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        删除
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
                
                {/* 章节栏底部统计 */}
                <div className="border-t border-border/30 px-3 py-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{chapters.length} 章</span>
                    <span>{(chapters.reduce((sum, ch) => sum + ch.wordCount, 0) / 10000).toFixed(1)} 万字</span>
                  </div>
                </div>
              </div>
              
              {/* 拖拽调整宽度 */}
              <div
                className="w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20"
                onMouseDown={handleChapterResize}
              />
            </>
          )}

          {/* 编辑器主区域 */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl px-8 py-12">
                <Textarea
                  ref={editorRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="开始写作..."
                  className={cn(
                    "min-h-[calc(100vh-200px)] w-full resize-none border-none bg-transparent focus-visible:ring-0",
                    "text-foreground placeholder:text-muted-foreground/50"
                  )}
                  style={{
                    fontSize: `${settings.fontSize}px`,
                    lineHeight: settings.lineHeight,
                    fontFamily: settings.fontFamily === "system" 
                      ? "inherit" 
                      : settings.fontFamily,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 右侧 AI 面板 */}
          {showAiPanel && (
            <>
              {/* 拖拽调整宽度 */}
              <div
                className="w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20"
                onMouseDown={handleAiResize}
              />
              
              <div 
                className="flex flex-col border-l border-border/30 bg-card/30"
                style={{ width: aiPanelWidth }}
              >
                {/* AI 面板头部 */}
                <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">AI 助手</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setShowAiPanel(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                {/* 模型选择 */}
                <div className="border-b border-border/30 px-3 py-2">
                  <button
                    onClick={() => setShowModelSelector(true)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    {selectedModel.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{selectedModel.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{selectedModel.subtitle}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                
                {/* AI 功能 Tabs */}
                <Tabs value={aiTab} onValueChange={(v) => setAiTab(v as typeof aiTab)} className="flex flex-1 flex-col">
                  <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
                    <TabsTrigger value="chat" className="text-xs">对话</TabsTrigger>
                    <TabsTrigger value="continue" className="text-xs">续写</TabsTrigger>
                    <TabsTrigger value="polish" className="text-xs">润色</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="chat" className="flex flex-1 flex-col px-3 pb-3">
                    {/* 消息列表 */}
                    <ScrollArea className="flex-1 py-3">
                      {aiMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Brain className="mb-3 h-10 w-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">开始与 AI 对话</p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            可以询问剧情建议、角色发展等
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {aiMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={cn(
                                "rounded-lg p-3",
                                msg.role === "user"
                                  ? "ml-6 bg-primary/10"
                                  : "mr-6 bg-muted/50"
                              )}
                            >
                              <p className="text-sm text-foreground">{msg.content}</p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {msg.timestamp.toLocaleTimeString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                    
                    {/* 输入区 */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入问题..."
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSendAiMessage()
                          }
                        }}
                        className="flex-1 text-sm"
                      />
                      <Button size="icon" onClick={handleSendAiMessage}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="continue" className="flex flex-1 flex-col px-3 pb-3">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Wand2 className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">AI 续写功能</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        基于当前内容自动续写
                      </p>
                      <Button className="mt-4 gap-2">
                        <Sparkles className="h-4 w-4" />
                        开始续写
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="polish" className="flex flex-1 flex-col px-3 pb-3">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">AI 润色功能</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        选中文本后进行润色优化
                      </p>
                      <Button variant="outline" className="mt-4 gap-2">
                        选择文本开始润色
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </div>

        {/* AI 模型选择器 */}
        <AIModelSelector
          open={showModelSelector}
          onOpenChange={setShowModelSelector}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          title="选择模型"
        />

        {/* 写作设置弹窗 */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>写作设置</DialogTitle>
              <DialogDescription>
                配置您的写作环境，设置仅影响当前作品
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="typography" className="mt-4">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="typography">排版</TabsTrigger>
                <TabsTrigger value="appearance">外观</TabsTrigger>
                <TabsTrigger value="input">输入</TabsTrigger>
                <TabsTrigger value="shortcuts">快捷</TabsTrigger>
                <TabsTrigger value="ai">AI</TabsTrigger>
              </TabsList>
              
              {/* 排版设置 */}
              <TabsContent value="typography" className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>字号</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[settings.fontSize]}
                        onValueChange={([v]) => setSettings({ ...settings, fontSize: v })}
                        min={12}
                        max={24}
                        step={1}
                        className="w-32"
                      />
                      <span className="w-12 text-right text-sm text-muted-foreground">
                        {settings.fontSize}px
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label>字体</Label>
                    <Select
                      value={settings.fontFamily}
                      onValueChange={(v) => setSettings({ ...settings, fontFamily: v })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">系统默认</SelectItem>
                        <SelectItem value="serif">宋体</SelectItem>
                        <SelectItem value="sans-serif">黑体</SelectItem>
                        <SelectItem value="monospace">等宽字体</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label>行高</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[settings.lineHeight * 10]}
                        onValueChange={([v]) => setSettings({ ...settings, lineHeight: v / 10 })}
                        min={12}
                        max={24}
                        step={1}
                        className="w-32"
                      />
                      <span className="w-12 text-right text-sm text-muted-foreground">
                        {settings.lineHeight.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* 外观设置 */}
              <TabsContent value="appearance" className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>主题</Label>
                    <Select
                      value={settings.theme}
                      onValueChange={(v) => setSettings({ ...settings, theme: v as WritingSettings["theme"] })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">亮色</SelectItem>
                        <SelectItem value="dark">暗色</SelectItem>
                        <SelectItem value="system">跟随系统</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label>护眼模式</Label>
                    <Switch
                      checked={settings.eyeProtection}
                      onCheckedChange={(v) => setSettings({ ...settings, eyeProtection: v })}
                    />
                  </div>
                </div>
              </TabsContent>
              
              {/* 输入习惯 */}
              <TabsContent value="input" className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>中文引号强制</Label>
                    <Switch
                      checked={settings.chineseQuotes}
                      onCheckedChange={(v) => setSettings({ ...settings, chineseQuotes: v })}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label>段首缩进</Label>
                    <Select
                      value={String(settings.paragraphIndent)}
                      onValueChange={(v) => setSettings({ ...settings, paragraphIndent: Number(v) })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">无缩进</SelectItem>
                        <SelectItem value="2">2 字符</SelectItem>
                        <SelectItem value="4">4 字符</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
              
              {/* 快捷键 */}
              <TabsContent value="shortcuts" className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>续写快捷键</Label>
                    <Select
                      value={settings.continuationShortcut}
                      onValueChange={(v) => setSettings({ ...settings, continuationShortcut: v as WritingSettings["continuationShortcut"] })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="space">空格</SelectItem>
                        <SelectItem value="ctrlK">Ctrl+K</SelectItem>
                        <SelectItem value="off">关闭</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
              
              {/* AI 设置 */}
              <TabsContent value="ai" className="space-y-4 py-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>AI 面板形式</Label>
                    <Select
                      value={settings.aiPanelPosition}
                      onValueChange={(v) => setSettings({ ...settings, aiPanelPosition: v as WritingSettings["aiPanelPosition"] })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sidebar">侧边栏</SelectItem>
                        <SelectItem value="popup">弹窗</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSettings(false)}>
                取消
              </Button>
              <Button onClick={() => setShowSettings(false)}>
                保存设置
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
