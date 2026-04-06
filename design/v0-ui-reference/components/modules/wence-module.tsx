"use client"

import { useState, useRef, useEffect } from "react"
import {
  MessageSquare,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  BookOpen,
  Sparkles,
  Brain,
  Users,
  Swords,
  Heart,
  TrendingUp,
  Target,
  Lightbulb,
  FileText,
  MoreHorizontal,
  Pin,
  Trash2,
  Edit3,
  Plus,
  Clock,
  Star,
  Zap,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Search,
  Filter,
  ArrowRight,
  History,
  Wand2,
  Network,
  Quote,
  AlertCircle,
  CheckCircle2,
  Circle,
  BookMarked,
  Layers,
  MessageCircle,
  HelpCircle,
  PenTool,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AIModelSelector, AI_MODELS } from "@/components/ai-model-selector"

// 策略类型定义
type StrategyType = "plot" | "character" | "worldbuilding" | "pacing" | "conflict" | "foreshadow"

interface Conversation {
  id: string
  title: string
  type: StrategyType
  lastMessage: string
  timestamp: Date
  isPinned?: boolean
  messageCount: number
  relatedWork?: string
}

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  suggestions?: string[]
  references?: { title: string; chapter: string; excerpt: string }[]
  actionItems?: { id: string; text: string; completed: boolean }[]
}

interface AnalysisCard {
  id: string
  title: string
  type: "technique" | "structure" | "character" | "pacing"
  source: string
  content: string
  tags: string[]
  isSaved: boolean
}

// 策略类型配置
const strategyConfig: Record<StrategyType, { icon: typeof Brain; label: string; color: string; description: string }> = {
  plot: { icon: Network, label: "情节设计", color: "text-blue-400", description: "故事走向与转折点" },
  character: { icon: Users, label: "人物塑造", color: "text-emerald-400", description: "性格、动机与弧光" },
  worldbuilding: { icon: BookOpen, label: "世界构建", color: "text-purple-400", description: "设定与规则体系" },
  pacing: { icon: TrendingUp, label: "节奏把控", color: "text-amber-400", description: "松紧与张弛有度" },
  conflict: { icon: Swords, label: "冲突设计", color: "text-rose-400", description: "矛盾与对抗升级" },
  foreshadow: { icon: Lightbulb, label: "伏笔铺设", color: "text-cyan-400", description: "埋线与回收时机" },
}

// 快捷问题模板
const quickQuestions = [
  { icon: Brain, label: "分析人物动机", prompt: "请帮我分析主角在这个情节中的行为动机是否合理，以及如何让读者更容易共情？" },
  { icon: Swords, label: "设计冲突升级", prompt: "当前章节的冲突强度不够，如何在保持合理性的前提下让矛盾更加尖锐？" },
  { icon: TrendingUp, label: "调整叙事节奏", prompt: "这几章的节奏有些拖沓，如何在不删减关键情节的情况下提升阅读体验？" },
  { icon: Lightbulb, label: "伏笔回收建议", prompt: "我在第 X 章埋下了这个伏笔，现在想在第 Y 章回收，请给我几个回收方案。" },
  { icon: Heart, label: "情感共鸣设计", prompt: "如何让这个场景更有感染力，让读者产生强烈的情感共鸣？" },
  { icon: Target, label: "章节目标检查", prompt: "请检查这章是否达成了应有的叙事目标，有哪些地方需要加强？" },
]

// 模拟数据
const mockConversations: Conversation[] = [
  {
    id: "1",
    title: "第12章情节走向讨论",
    type: "plot",
    lastMessage: "建议在揭示玉佩真相前，先增加一个误导性线索...",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    isPinned: true,
    messageCount: 12,
    relatedWork: "风起苍穹",
  },
  {
    id: "2",
    title: "萧然性格弧光分析",
    type: "character",
    lastMessage: "从第1章的隐忍到第15章的爆发，建议中间增加...",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    messageCount: 8,
    relatedWork: "风起苍穹",
  },
  {
    id: "3",
    title: "武学体系设计咨询",
    type: "worldbuilding",
    lastMessage: "建议简化品级划分，突出特色功法差异...",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    messageCount: 15,
    relatedWork: "风起苍穹",
  },
  {
    id: "4",
    title: "第二卷节奏问题",
    type: "pacing",
    lastMessage: "中段可以考虑插入一个短期目标来维持紧张感...",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    messageCount: 6,
    relatedWork: "风起苍穹",
  },
]

const mockMessages: Message[] = [
  {
    id: "1",
    role: "system",
    content: "已加载：《风起苍穹》作品设定 + 第12章上下文 + 前11章摘要",
    timestamp: new Date(),
  },
  {
    id: "2",
    role: "user",
    content: "第12章结尾处，萧然发现了父亲的玉佩。我想让这个发现产生更大的戏剧张力，但又不想太刻意。有什么建议吗？",
    timestamp: new Date(),
  },
  {
    id: "3",
    role: "assistant",
    content: `这是一个关键转折点，我理解你想要的是「意料之外、情理之中」的效果。以下是几个可以增强戏剧张力的方向：

**方向一：情感前置**
在发现玉佩之前，先让萧然经历一个「看似与父亲无关」的情感触动。比如福伯无意间的一句话，或是一个相似的场景，让读者先进入怀旧/伤感的情绪轨道，再出现玉佩，情感冲击会更强。

**方向二：误导后揭示**
先让萧然发现一个「假线索」——比如他以为找到了重要证据，结果是虚惊一场。就在他失望/放松警惕的时候，玉佩出现。这种「先抑后扬」能放大惊喜感。

**方向三：旁观者反应**
通过福伯的反应来侧面烘托。老仆见到玉佩时的震惊、颤抖、欲言又止，比直接描写萧然的震惊更有留白感，也暗示玉佩背后可能有更深的秘密。`,
    timestamp: new Date(),
    suggestions: [
      "是否需要我针对「方向一」展开，写一个具体的情感铺垫段落？",
      "要不要分析一下这三种方向分别适合什么类型的读者？",
      "需要我检查前面章节是否有适合作为铺垫的既有素材？",
    ],
    actionItems: [
      { id: "1", text: "确定采用哪个方向", completed: false },
      { id: "2", text: "修改第12章大纲中的发现节点", completed: false },
      { id: "3", text: "检查是否需要在第11章增加铺垫", completed: false },
    ],
  },
]

const mockAnalysisCards: AnalysisCard[] = [
  {
    id: "1",
    title: "悬念层叠技法",
    type: "technique",
    source: "《诡秘之主》",
    content: "在揭示一个谜底的同时，立即抛出更大的谜团。读者获得满足感的同时，好奇心被进一步勾起。",
    tags: ["悬念", "节奏", "钩子"],
    isSaved: true,
  },
  {
    id: "2",
    title: "人物弧光三段式",
    type: "character",
    source: "《斗罗大陆》",
    content: "起点状态（弱小但有特质）→ 成长催化（外部压力+内心觉醒）→ 蜕变展现（关键时刻的选择证明成长）",
    tags: ["人物塑造", "成长线", "结构"],
    isSaved: true,
  },
  {
    id: "3",
    title: "���斗节奏控制",
    type: "pacing",
    source: "《全职高手》",
    content: "长战斗中穿��「呼吸点」——技能冷却、双方喘息、旁观者反应——让读者有消化空间，避免疲劳。",
    tags: ["战斗", "节奏", "技巧"],
    isSaved: false,
  },
]

export function WenCeModule() {
  const [activeTab, setActiveTab] = useState<"chat" | "analysis" | "history">("chat")
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(mockConversations[0])
  const [messages, setMessages] = useState<Message[]>(mockMessages)
  const [inputValue, setInputValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeStrategyFilter, setActiveStrategyFilter] = useState<StrategyType | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState("jianshan")
  const [showModelSelector, setShowModelSelector] = useState(false)
  const selectedModel = AI_MODELS.find(m => m.id === selectedModelId) || AI_MODELS[0]
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSend = () => {
    if (!inputValue.trim()) return
    
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    }
    setMessages([...messages, newMessage])
    setInputValue("")
    setIsGenerating(true)
    
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "这是一个很好的问题。让我根据你的作品设定和当前情节上下文来分析...\n\n（AI 详细回复将在这里展示）",
        timestamp: new Date(),
        suggestions: [
          "需要我进一步展开这个方向吗？",
          "要不要我提供一些具体的文本示例？",
        ],
      }
      setMessages((prev) => [...prev, aiResponse])
      setIsGenerating(false)
    }, 2000)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const filteredConversations = mockConversations.filter((conv) => {
    const matchesSearch = !searchQuery || 
      conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = !activeStrategyFilter || conv.type === activeStrategyFilter
    return matchesSearch && matchesFilter
  })

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left Sidebar - Conversation List */}
        {isSidebarOpen && (
          <div className="flex w-[320px] flex-col border-r border-border/40 bg-card/20">
            {/* Sidebar Header */}
            <div className="border-b border-border/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">问策</h2>
                    <p className="text-xs text-muted-foreground">策略对话 · 创作咨询</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>新建对话</TooltipContent>
                </Tooltip>
              </div>

              {/* Search */}
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索对话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-sm bg-muted/30 border-border/50"
                />
              </div>

              {/* Strategy Type Filters */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveStrategyFilter(null)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    activeStrategyFilter === null
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  全部
                </button>
                {Object.entries(strategyConfig).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setActiveStrategyFilter(key as StrategyType)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                      activeStrategyFilter === key
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <config.icon className="h-3 w-3" />
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation List */}
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {filteredConversations.map((conv) => {
                  const config = strategyConfig[conv.type]
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "group flex w-full cursor-pointer flex-col gap-1.5 rounded-lg p-3 text-left transition-colors",
                        selectedConversation?.id === conv.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/30"
                      )}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedConversation(conv)
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {conv.isPinned && (
                            <Pin className="h-3 w-3 text-primary" />
                          )}
                          <span className="font-medium text-foreground text-sm line-clamp-1">
                            {conv.title}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Pin className="mr-2 h-4 w-4" />
                              {conv.isPinned ? "取消置顶" : "置顶"}
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit3 className="mr-2 h-4 w-4" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={cn(
                              "h-5 gap-1 text-[10px]",
                              `${config.color} bg-muted/50`
                            )}
                          >
                            <config.icon className="h-3 w-3" />
                            {config.label}
                          </Badge>
                          {conv.relatedWork && (
                            <span className="text-[10px] text-muted-foreground">
                              {conv.relatedWork}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {conv.messageCount} 条
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            {/* Sidebar Stats */}
            <div className="border-t border-border/40 p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/30 p-2">
                  <p className="text-lg font-semibold text-foreground">{mockConversations.length}</p>
                  <p className="text-[10px] text-muted-foreground">对话</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <p className="text-lg font-semibold text-foreground">
                    {mockConversations.reduce((acc, c) => acc + c.messageCount, 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">消息</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <p className="text-lg font-semibold text-foreground">{mockAnalysisCards.filter(c => c.isSaved).length}</p>
                  <p className="text-[10px] text-muted-foreground">收藏</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Header with Tabs */}
          <div className="flex items-center justify-between border-b border-border/40 bg-card/30 px-4 py-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
              
              {selectedConversation && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{selectedConversation.title}</span>
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {strategyConfig[selectedConversation.type].label}
                  </Badge>
                </div>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="h-9">
                <TabsTrigger value="chat" className="gap-1.5 text-xs">
                  <MessageCircle className="h-3.5 w-3.5" />
                  对话
                </TabsTrigger>
                <TabsTrigger value="analysis" className="gap-1.5 text-xs">
                  <BookMarked className="h-3.5 w-3.5" />
                  技法卡
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5 text-xs">
                  <History className="h-3.5 w-3.5" />
                  历史
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tab Content */}
          {activeTab === "chat" && (
            <>
              {/* Messages Area */}
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="mx-auto max-w-3xl space-y-6">
                  {/* Context Banner */}
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">当前上下文</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                        <Settings2 className="h-3.5 w-3.5" />
                        配置
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className="gap-1.5">
                        <FileText className="h-3 w-3" />
                        《风起苍穹》
                      </Badge>
                      <Badge variant="outline" className="gap-1.5">
                        <Layers className="h-3 w-3" />
                        第三卷 · 第12章
                      </Badge>
                      <Badge variant="outline" className="gap-1.5">
                        <Users className="h-3 w-3" />
                        圣经设定 8 条
                      </Badge>
                      <Badge variant="outline" className="gap-1.5">
                        <Clock className="h-3 w-3" />
                        前11章摘要
                      </Badge>
                    </div>
                  </div>

                  {/* Messages */}
                  {messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      onCopy={handleCopy}
                      copiedId={copiedId}
                    />
                  ))}

                  {isGenerating && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">正在思考...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Quick Questions */}
              <div className="border-t border-border/40 bg-card/20 px-4 py-3">
                <p className="mb-2 text-xs text-muted-foreground">快捷问题</p>
                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => setInputValue(q.prompt)}
                      className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <q.icon className="h-3.5 w-3.5" />
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-border/40 p-4">
                <div className="relative">
                  <Textarea
                    placeholder="描述你的创作问题，我来帮你分析..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    className="min-h-[100px] resize-none bg-muted/30 pr-12 border-border/50"
                  />
                  <Button
                    size="icon"
                    className="absolute bottom-3 right-3 h-9 w-9"
                    disabled={!inputValue.trim() || isGenerating}
                    onClick={handleSend}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => setShowModelSelector(true)}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted/50"
                  >
                    {selectedModel.icon}
                    <span className="font-medium text-foreground">{selectedModel.name}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <span className="text-xs text-muted-foreground">Enter 发送 · Shift + Enter 换行</span>
                </div>

                {/* AI Model Selector Dialog */}
                <AIModelSelector
                  open={showModelSelector}
                  onOpenChange={setShowModelSelector}
                  selectedModelId={selectedModelId}
                  onSelectModel={setSelectedModelId}
                  title="选择模型"
                />
              </div>
            </>
          )}

          {activeTab === "analysis" && (
            <ScrollArea className="flex-1 p-6">
              <div className="mx-auto max-w-4xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">技法卡片</h2>
                    <p className="text-sm text-muted-foreground">从参考书中提炼的写作技法与结构分析</p>
                  </div>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    新建卡片
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {mockAnalysisCards.map((card) => (
                    <div
                      key={card.id}
                      className="group rounded-xl border border-border/40 bg-card/30 p-5 transition-all hover:border-primary/30 hover:bg-card/50"
                    >
                      <div className="flex items-start justify-between">
                        <Badge variant="secondary" className="mb-3">
                          {card.type === "technique" && "技法"}
                          {card.type === "structure" && "结构"}
                          {card.type === "character" && "人物"}
                          {card.type === "pacing" && "节奏"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            card.isSaved ? "text-primary" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <Bookmark className={cn("h-4 w-4", card.isSaved && "fill-current")} />
                        </Button>
                      </div>
                      <h3 className="font-medium text-foreground">{card.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">来源：{card.source}</p>
                      <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{card.content}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}

          {activeTab === "history" && (
            <ScrollArea className="flex-1 p-6">
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-6 text-lg font-semibold text-foreground">历史记录</h2>
                <div className="space-y-4">
                  {mockConversations.map((conv) => {
                    const config = strategyConfig[conv.type]
                    return (
                      <div
                        key={conv.id}
                        className="rounded-xl border border-border/40 bg-card/30 p-4 transition-colors hover:bg-card/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50")}>
                              <config.icon className={cn("h-5 w-5", config.color)} />
                            </div>
                            <div>
                              <h3 className="font-medium text-foreground">{conv.title}</h3>
                              <p className="text-xs text-muted-foreground">
                                {conv.relatedWork} · {conv.messageCount} 条消息
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1.5">
                            继续
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                          {conv.lastMessage}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

// Chat Message Component
function ChatMessage({
  message,
  onCopy,
  copiedId,
}: {
  message: Message
  onCopy: (content: string, id: string) => void
  copiedId: string | null
}) {
  if (message.role === "system") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
        <BookOpen className="h-4 w-4 shrink-0" />
        {message.content}
      </div>
    )
  }

  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn("max-w-[85%]", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted/40 rounded-bl-md"
          )}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
        </div>

        {/* Action Items */}
        {message.actionItems && message.actionItems.length > 0 && (
          <div className="mt-3 rounded-lg border border-border/40 bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">待办事项</p>
            <div className="space-y-2">
              {message.actionItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <button className="flex-shrink-0">
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-[oklch(0.7_0.15_145)]" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <span className={cn("text-sm", item.completed && "text-muted-foreground line-through")}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {message.suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Message Actions */}
        {!isUser && (
          <div className="mt-2 flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onCopy(message.content, message.id)}
                >
                  {copiedId === message.id ? (
                    <Check className="h-3.5 w-3.5 text-[oklch(0.7_0.15_145)]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>复制</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>有帮助</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ThumbsDown className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>需改进</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新生成</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
