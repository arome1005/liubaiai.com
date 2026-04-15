"use client"

import { useState, useRef, useEffect } from "react"
import {
  Sparkles,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Coins,
  FileText,
  BookOpen,
  Wand2,
  AlertCircle,
  Settings2,
  Zap,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  PanelRightClose,
  PanelRight,
  Loader2,
  History,
  Layers,
  Pencil,
  Brain,
  Lightbulb,
  Eye,
  EyeOff,
  Diff,
  GitCompare,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Target,
  Users,
  Globe,
  AlertTriangle,
  Star,
  Bot,
  User,
  ChevronLeft,
  Play,
  Pause,
  Square,
  MoreHorizontal,
  Lock,
  Unlock,
  ArrowDown,
  Maximize2,
  Minimize2,
  Info,
  Shield,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
import { AIModelSelector, AI_MODELS } from "@/components/ai-model-selector"

// 类型定义
interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  tokens?: number
  cost?: number
  status?: "generating" | "complete" | "error"
}

interface GeneratedDraft {
  id: string
  version: number
  content: string
  tokens: number
  cost: number
  rating?: "up" | "down"
  isAccepted: boolean
  temperature: number
  timestamp: Date
}

interface ContextItem {
  id: string
  type: "outline" | "bible" | "style" | "summary" | "chapter"
  label: string
  value: string
  tokens: number
  loaded: boolean
  priority: "required" | "optional"
}

interface OutlineNode {
  id: string
  title: string
  summary: string
  status: "draft" | "finalized" | "generated"
  wordTarget: number
  wordCurrent: number
}

// 模型选项
const modelOptions = [
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", price: "¥0.01/1k", speed: "中", quality: "高" },
  { id: "claude-3-opus", name: "Claude 3 Opus", price: "¥0.015/1k", speed: "慢", quality: "极高" },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet", price: "¥0.003/1k", speed: "快", quality: "高" },
  { id: "moonshot-v1", name: "Moonshot v1", price: "¥0.008/1k", speed: "快", quality: "中" },
  { id: "deepseek-v2", name: "DeepSeek v2", price: "¥0.001/1k", speed: "快", quality: "中" },
]

// 快捷 prompt
const quickPrompts = [
  { icon: Pencil, label: "续写段落", prompt: "请续写当前段落，保持原有风格和节奏，约200字" },
  { icon: RefreshCw, label: "重写选中", prompt: "请重写选中的段落，使其更加生动，保持原意" },
  { icon: Brain, label: "扩展细节", prompt: "请为选中段落添加更多细节描写和心理活动" },
  { icon: Lightbulb, label: "优化对话", prompt: "请优化对话部分的节奏和张力，使之更自然" },
  { icon: Zap, label: "生成全章", prompt: "请根据已定稿细纲生成完整章节内容" },
  { icon: Target, label: "达成目标", prompt: "请检查当前内容是否达成细纲中的章节目标" },
]

// 模拟上下文数据
const mockContextItems: ContextItem[] = [
  { id: "1", type: "outline", label: "细纲", value: "第 12 章「暗流涌动」已定稿", tokens: 1240, loaded: true, priority: "required" },
  { id: "2", type: "bible", label: "本书锦囊", value: "人物 8 条 · 世界观 5 条 · 术语 3 条", tokens: 2350, loaded: true, priority: "required" },
  { id: "3", type: "style", label: "文策", value: "第一人称 · 悬疑基调 · 紧凑节奏", tokens: 580, loaded: true, priority: "required" },
  { id: "4", type: "style", label: "风格卡", value: "古风武侠 · 节奏紧凑 · 禁用套话", tokens: 420, loaded: true, priority: "required" },
  { id: "5", type: "summary", label: "前情摘要", value: "第 1-11 章剧情梗概", tokens: 890, loaded: true, priority: "optional" },
  { id: "6", type: "chapter", label: "上一章", value: "第 11 章「风雨欲来」尾段 500 字", tokens: 320, loaded: false, priority: "optional" },
]

// 模拟细纲节点
const mockOutlineNodes: OutlineNode[] = [
  { id: "1", title: "开篇：密信预警", summary: "萧然收到密信，暗示三日内有变故", status: "generated", wordTarget: 500, wordCurrent: 520 },
  { id: "2", title: "转折：玉佩重现", summary: "福伯发现父亲的云纹玉佩，打破三年的平静", status: "generated", wordTarget: 800, wordCurrent: 780 },
  { id: "3", title: "深入：追问真相", summary: "萧然追问玉佩来源，福伯透露部分信息", status: "finalized", wordTarget: 600, wordCurrent: 0 },
  { id: "4", title: "结尾：暗影闪现", summary: "窗外黑影闪过，萧然警觉，引出下章", status: "draft", wordTarget: 400, wordCurrent: 0 },
]

// 模拟生成的草稿
const mockDrafts: GeneratedDraft[] = [
  {
    id: "1",
    version: 1,
    content: `夜色如墨，笼罩着整座青云城。

城主府深处的书房内，烛火摇曳，将萧然的侧脸映得明暗交错。他指尖轻叩桌面，目光落在那封刚送达的密信上，眸中掠过一丝不易察觉的寒意。

"三日之内，必有变故。"

身后传来轻微的脚步声，是跟随他多年的老仆福伯。老人将一盏热茶置于案头，欲言又止。

"说。"萧然并未回头。

"少主，老奴方才在后院发现了这个。"福伯颤巍巍地递上一枚玉佩，其上的云纹在烛光下泛着幽幽寒光。

萧然猛然起身，一把抓过那枚玉佩。这分明是——三年前随父亲一同葬身火海的信物。

"在哪发现的？"

"后院枯井旁的老槐树下。老奴今晚去查看漏水的水缸，却见树根处似有异样......"

窗外，一道黑影倏忽闪过。萧然眼神一凛，右手已悄然握住腰间剑柄。`,
    tokens: 892,
    cost: 0.0089,
    rating: "up",
    isAccepted: true,
    temperature: 0.7,
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "2",
    version: 2,
    content: `月隐云中，青云城笼罩在一片死寂之中。

萧然独坐书房，案上摊开一封密信，信纸边角已被他捏得微微发皱。三年蛰伏，三年隐忍，他一直在等一个契机。而今，契机似乎来了。

"少主。"

福伯的声音在身后响起，苍老而沉稳。萧然没有回头，只是轻轻"嗯"了一声。

"老奴有一物，须得交给少主过目。"

这回萧然转过身来。他看见福伯双手捧着一枚玉佩，那熟悉的云纹图案让他瞳孔骤然紧缩。

"这是......"

"今晚在后院枯井旁发现的。"福伯的声音微微发颤，"老奴认得，这是老爷的贴身之物。"

萧然接过玉佩，指腹摩挲着温润的玉质。三年了，他以为这枚玉佩已随父亲一同化为灰烬。

窗棂忽然轻响，有什么东西一闪而过。`,
    tokens: 856,
    cost: 0.0086,
    rating: undefined,
    isAccepted: false,
    temperature: 0.8,
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
  },
]

const mockMessages: Message[] = [
  {
    id: "1",
    role: "system",
    content: "已加载：《风起苍穹》第三卷·第 12 章细纲 + 锦囊设定 + 文策风格 + 前情摘要",
    timestamp: new Date(),
  },
  {
    id: "2",
    role: "user",
    content: "请根据细纲生成第 12 章「暗流涌动」的开篇 500 字，重点表现萧然的隐忍和暗流涌动的氛围",
    timestamp: new Date(),
  },
  {
    id: "3",
    role: "assistant",
    content: "好的，我将根据已定稿的细纲和锦囊设定，生成符合「古风武侠·悬疑复仇」风格的开篇。注意保持第三人称限制视角，主跟萧然。",
    timestamp: new Date(),
    status: "complete",
  },
]

export function ShengHuiModule() {
  const [messages, setMessages] = useState<Message[]>(mockMessages)
  const [inputValue, setInputValue] = useState("")
  const [isContextExpanded, setIsContextExpanded] = useState(true)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [selectedModelId, setSelectedModelId] = useState("tingyu")
  const [showModelSelector, setShowModelSelector] = useState(false)
  const selectedModel = AI_MODELS.find(m => m.id === selectedModelId) || AI_MODELS[0]
  const [temperature, setTemperature] = useState([0.7])
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeOutlineNode, setActiveOutlineNode] = useState<string>("2")
  const [viewMode, setViewMode] = useState<"editor" | "diff" | "versions">("editor")
  const [drafts, setDrafts] = useState<GeneratedDraft[]>(mockDrafts)
  const [selectedDraft, setSelectedDraft] = useState<GeneratedDraft>(mockDrafts[0])
  const [showCostConfirm, setShowCostConfirm] = useState(false)
  const [contextItems, setContextItems] = useState<ContextItem[]>(mockContextItems)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const totalTokens = messages.reduce((acc, m) => acc + (m.tokens || 0), 0)
  const totalCost = messages.reduce((acc, m) => acc + (m.cost || 0), 0)
  const contextTokens = contextItems.filter(i => i.loaded).reduce((acc, item) => acc + item.tokens, 0)
  const estimatedCost = (contextTokens + 500) * 0.00001

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleContextItem = (id: string) => {
    setContextItems(items => 
      items.map(item => 
        item.id === id ? { ...item, loaded: !item.loaded } : item
      )
    )
  }

  const handleSend = () => {
    if (!inputValue.trim()) return
    
    // Check if cost exceeds threshold
    if (estimatedCost > 0.05) {
      setShowCostConfirm(true)
      return
    }
    
    doSend()
  }

  const doSend = () => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    }
    setMessages([...messages, newMessage])
    setInputValue("")
    setIsGenerating(true)
    setShowCostConfirm(false)
    
    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "生成的内容已添加到草稿区，请在左侧查看并选择是否采纳。",
        timestamp: new Date(),
        tokens: Math.floor(Math.random() * 500) + 200,
        cost: Math.random() * 0.01,
        status: "complete",
      }
      setMessages((prev) => [...prev, aiResponse])
      setIsGenerating(false)
    }, 2000)
  }

  const rateDraft = (draftId: string, rating: "up" | "down") => {
    setDrafts(drafts.map(d => 
      d.id === draftId ? { ...d, rating } : d
    ))
  }

  const acceptDraft = (draftId: string) => {
    setDrafts(drafts.map(d => ({
      ...d,
      isAccepted: d.id === draftId,
    })))
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const outlineProgress = mockOutlineNodes.filter(n => n.status === "generated").length / mockOutlineNodes.length * 100

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left Panel - Editor/Preview */}
        <div className="flex flex-1 flex-col border-r border-border/40">
          {/* Editor Header */}
          <div className="flex items-center justify-between border-b border-border/40 bg-card/30 px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">生辉</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">风起苍穹</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">第 12 章 · 暗流涌动</span>
              <Badge variant="outline" className="ml-2 h-5 gap-1 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                生成中
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center rounded-lg border border-border/50 p-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "editor" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode("editor")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>编辑器视图</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "diff" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode("diff")}
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>草稿对比</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "versions" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode("versions")}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>版本历史</TooltipContent>
                </Tooltip>
              </div>

              <div className="h-5 w-px bg-border/50" />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsPanelOpen(!isPanelOpen)}
              >
                {isPanelOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Outline Progress Bar */}
          <div className="border-b border-border/40 bg-muted/20 px-4 py-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">本章生成进度</span>
              </div>
              <span className="font-medium text-foreground">{outlineProgress.toFixed(0)}%</span>
            </div>
            <Progress value={outlineProgress} className="mt-1.5 h-1.5" />
            <div className="mt-2 flex gap-2">
              {mockOutlineNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => setActiveOutlineNode(node.id)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                    activeOutlineNode === node.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/40 bg-card/30 hover:bg-card/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "font-medium",
                      node.status === "generated" ? "text-[oklch(0.7_0.15_145)]" :
                      node.status === "finalized" ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {node.title}
                    </span>
                    {node.status === "generated" && <CheckCircle2 className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />}
                    {node.status === "finalized" && <Circle className="h-3 w-3 text-primary" />}
                    {node.status === "draft" && <Circle className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {node.wordCurrent}/{node.wordTarget} 字
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editor Content */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl p-8">
              <h1 className="mb-2 text-2xl font-bold text-foreground">
                第十二章 暗流涌动
              </h1>
              <p className="mb-6 text-sm text-muted-foreground">
                细纲已定稿 · 共 {drafts.length} 个草稿版本
              </p>

              {/* Generated Content Preview */}
              <div className="space-y-6">
                {/* Active Draft */}
                <div className={cn(
                  "rounded-xl border p-6 transition-all",
                  selectedDraft.isAccepted
                    ? "border-[oklch(0.7_0.15_145)]/30 bg-[oklch(0.7_0.15_145)]/5"
                    : "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
                )}>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg",
                        selectedDraft.isAccepted ? "bg-[oklch(0.7_0.15_145)]/20" : "bg-primary/20"
                      )}>
                        <Sparkles className={cn(
                          "h-4 w-4",
                          selectedDraft.isAccepted ? "text-[oklch(0.7_0.15_145)]" : "text-primary"
                        )} />
                      </div>
                      <span className={cn(
                        "text-sm font-medium",
                        selectedDraft.isAccepted ? "text-[oklch(0.7_0.15_145)]" : "text-primary"
                      )}>
                        AI 生成草稿 #{selectedDraft.version}
                        {selectedDraft.isAccepted && " (已采纳)"}
                      </span>
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        温度 {selectedDraft.temperature}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className={cn("h-7 w-7", selectedDraft.rating === "up" && "text-[oklch(0.7_0.15_145)]")}
                            onClick={() => rateDraft(selectedDraft.id, "up")}
                          >
                            <ThumbsUp className={cn("h-3.5 w-3.5", selectedDraft.rating === "up" && "fill-current")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>有帮助</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className={cn("h-7 w-7", selectedDraft.rating === "down" && "text-destructive")}
                            onClick={() => rateDraft(selectedDraft.id, "down")}
                          >
                            <ThumbsDown className={cn("h-3.5 w-3.5", selectedDraft.rating === "down" && "fill-current")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>需改进</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  
                  <div className="space-y-4 text-foreground/90 leading-relaxed">
                    {selectedDraft.content.split('\n\n').map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{selectedDraft.tokens} tokens</span>
                      <span>¥{selectedDraft.cost.toFixed(4)}</span>
                      <span>{selectedDraft.content.replace(/\s/g, '').length} 字</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 gap-1.5"
                        onClick={() => handleCopy(selectedDraft.content, selectedDraft.id)}
                      >
                        {copiedId === selectedDraft.id ? (
                          <Check className="h-3.5 w-3.5 text-[oklch(0.7_0.15_145)]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        复制
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1.5">
                        <RotateCcw className="h-3.5 w-3.5" />
                        重新生成
                      </Button>
                      {!selectedDraft.isAccepted && (
                        <Button 
                          size="sm" 
                          className="h-8 gap-1.5"
                          onClick={() => acceptDraft(selectedDraft.id)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          采纳此版本
                        </Button>
                      )}
                      {selectedDraft.isAccepted && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5">
                          <ArrowRight className="h-3.5 w-3.5" />
                          合并到正文
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Version Selector */}
                {drafts.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">其他版本：</span>
                    {drafts.filter(d => d.id !== selectedDraft.id).map((draft) => (
                      <button
                        key={draft.id}
                        onClick={() => setSelectedDraft(draft)}
                        className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-xs transition-colors hover:bg-muted/50"
                      >
                        <Sparkles className="h-3 w-3" />
                        草稿 #{draft.version}
                        {draft.rating === "up" && <ThumbsUp className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />}
                        {draft.isAccepted && <Check className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - AI Chat */}
        {isPanelOpen && (
          <div className="flex w-[420px] flex-col bg-card/20">
            {/* Chat Header */}
            <div className="border-b border-border/40 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
                    <Wand2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-medium text-foreground">生辉助手</span>
                    <p className="text-[10px] text-muted-foreground">按纲仿写 · 风格一致</p>
                  </div>
                </div>
                {/* Token/Cost Badge */}
                <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    {(totalTokens + contextTokens).toLocaleString()} · ¥{(totalCost + estimatedCost).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Model Selector */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setShowModelSelector(true)}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  {selectedModel.icon}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{selectedModel.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{selectedModel.subtitle}</p>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>高级设置</TooltipContent>
                </Tooltip>

                {/* AI Model Selector Dialog */}
                <AIModelSelector
                  open={showModelSelector}
                  onOpenChange={setShowModelSelector}
                  selectedModelId={selectedModelId}
                  onSelectModel={setSelectedModelId}
                  title="选择模型"
                />
              </div>

              {/* Context Items */}
              <button
                onClick={() => setIsContextExpanded(!isContextExpanded)}
                className="mt-3 flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">已加载上下文</span>
                  <Badge variant="secondary" className="h-5 bg-primary/10 text-primary text-[10px]">
                    {contextTokens.toLocaleString()} tokens
                  </Badge>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isContextExpanded && "rotate-180"
                  )}
                />
              </button>

              {isContextExpanded && (
                <div className="mt-2 space-y-1.5">
                  {contextItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2",
                        item.loaded ? "bg-muted/20" : "bg-muted/10 opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {item.type === "outline" && <Layers className="h-3.5 w-3.5 text-blue-400" />}
                        {item.type === "bible" && <BookOpen className="h-3.5 w-3.5 text-emerald-400" />}
                        {item.type === "style" && <Target className="h-3.5 w-3.5 text-purple-400" />}
                        {item.type === "summary" && <Clock className="h-3.5 w-3.5 text-amber-400" />}
                        {item.type === "chapter" && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-sm text-muted-foreground">{item.label}</span>
                        {item.priority === "required" && (
                          <Badge variant="secondary" className="h-4 text-[8px]">必需</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-foreground/80 truncate max-w-[120px]">{item.value}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {item.tokens}
                        </span>
                        <Switch
                          checked={item.loaded}
                          onCheckedChange={() => toggleContextItem(item.id)}
                          className="h-4 w-7"
                          disabled={item.priority === "required"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 px-4 py-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onCopy={handleCopy}
                    copiedId={copiedId}
                  />
                ))}
                {isGenerating && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">正在生成...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Quick Prompts */}
            <div className="border-t border-border/40 px-4 py-3">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt.label}
                    onClick={() => setInputValue(prompt.prompt)}
                    className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <prompt.icon className="h-3 w-3" />
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-border/40 p-4">
              {/* Cost Preview */}
              <div className={cn(
                "mb-3 flex items-center justify-between rounded-lg px-3 py-2",
                estimatedCost > 0.05 ? "bg-amber-500/10" : "bg-muted/30"
              )}>
                <div className="flex items-center gap-2">
                  {estimatedCost > 0.05 ? (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Info className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={cn(
                    "text-sm",
                    estimatedCost > 0.05 ? "text-amber-500" : "text-muted-foreground"
                  )}>
                    预估消耗
                  </span>
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  estimatedCost > 0.05 ? "text-amber-500" : "text-foreground"
                )}>
                  ~{(contextTokens + 500).toLocaleString()} tokens · ¥{estimatedCost.toFixed(4)}
                </span>
              </div>

              {/* Temperature Slider */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-xs text-muted-foreground whitespace-nowrap">创意度</span>
                <Slider
                  value={temperature}
                  onValueChange={setTemperature}
                  max={1}
                  step={0.1}
                  className="flex-1"
                />
                <span className="w-8 text-right text-xs font-medium text-foreground">
                  {temperature[0]}
                </span>
              </div>

              <div className="relative">
                <Textarea
                  placeholder="描述你想生成的内容，或使用快捷指令..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  className="min-h-[80px] resize-none bg-muted/30 pr-12 border-border/50"
                />
                <Button
                  size="icon"
                  className="absolute bottom-2 right-2 h-8 w-8"
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
              <p className="mt-2 text-[10px] text-muted-foreground">
                Enter 发送 · Shift + Enter 换行 · 生辉严格按细纲生成
              </p>
            </div>
          </div>
        )}

        {/* Cost Confirmation Dialog */}
        <Dialog open={showCostConfirm} onOpenChange={setShowCostConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                消耗确认
              </DialogTitle>
              <DialogDescription>
                本次请求预估消耗较高，请确认是否继续。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">预估 Token</span>
                  <span className="font-medium text-foreground">{(contextTokens + 500).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">预估费用</span>
                  <span className="font-medium text-foreground">¥{estimatedCost.toFixed(4)}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
                <Shield className="h-4 w-4 text-amber-500 mt-0.5" />
                <p className="text-sm text-amber-500">
                  此次请求超过了您设定的 ¥0.05 单次阈值。您可以在设置中调整消耗阈值。
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCostConfirm(false)}>
                取消
              </Button>
              <Button onClick={doSend}>
                确认生成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
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
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        {!isUser && message.tokens && (
          <div className="mt-1.5 flex items-center gap-3 px-1">
            <span className="text-[10px] text-muted-foreground">
              {message.tokens} tokens · ¥{message.cost?.toFixed(4)}
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onCopy(message.content, message.id)}
              >
                {copiedId === message.id ? (
                  <Check className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
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
