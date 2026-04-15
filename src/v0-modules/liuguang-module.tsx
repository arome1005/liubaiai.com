
import { useState, useRef, useEffect } from "react"
import {
  Sparkles,
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  Mic,
  MicOff,
  Camera,
  Image as ImageIcon,
  FileText,
  Quote,
  Lightbulb,
  Bookmark,
  Tag,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  Star,
  X,
  Check,
  Zap,
  Brain,
  Link2,
  Hash,
  MapPin,
  Calendar,
  TrendingUp,
  Shuffle,
  Eye,
  EyeOff,
  Send,
  Maximize2,
  Minimize2,
  RotateCcw,
  Download,
  Upload,
  Folder,
  FolderOpen,
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertCircle,
  Archive,
} from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { ScrollArea } from "../components/ui/scroll-area"
import { Textarea } from "../components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"

// 类型定义
interface Inspiration {
  id: string
  type: "text" | "voice" | "image" | "quote" | "idea" | "bookmark"
  content: string
  title?: string
  source?: string
  sourceUrl?: string
  audioUrl?: string
  imageUrl?: string
  tags: string[]
  linkedWorks: string[]
  linkedCharacters: string[]
  linkedPlots: string[]
  isFavorite: boolean
  isPrivate: boolean
  createdAt: Date
  updatedAt: Date
  location?: string
  mood?: string
  category?: string
}

interface InspirationFolder {
  id: string
  name: string
  color: string
  count: number
  isExpanded: boolean
  children?: InspirationFolder[]
}

// 灵感类型配置
const inspirationTypes = [
  { id: "all", label: "全部", icon: Sparkles, color: "text-primary" },
  { id: "text", label: "文字", icon: FileText, color: "text-blue-400" },
  { id: "voice", label: "语音", icon: Mic, color: "text-green-400" },
  { id: "image", label: "图片", icon: ImageIcon, color: "text-purple-400" },
  { id: "quote", label: "引用", icon: Quote, color: "text-amber-400" },
  { id: "idea", label: "想法", icon: Lightbulb, color: "text-cyan-400" },
  { id: "bookmark", label: "书签", icon: Bookmark, color: "text-rose-400" },
]

// 标签配置
const tagSuggestions = [
  { id: "plot", label: "剧情", color: "bg-blue-500/20 text-blue-400" },
  { id: "character", label: "人物", color: "bg-purple-500/20 text-purple-400" },
  { id: "dialogue", label: "对话", color: "bg-green-500/20 text-green-400" },
  { id: "setting", label: "设定", color: "bg-amber-500/20 text-amber-400" },
  { id: "emotion", label: "情感", color: "bg-rose-500/20 text-rose-400" },
  { id: "conflict", label: "冲突", color: "bg-red-500/20 text-red-400" },
  { id: "worldbuilding", label: "世界观", color: "bg-cyan-500/20 text-cyan-400" },
  { id: "foreshadow", label: "伏笔", color: "bg-indigo-500/20 text-indigo-400" },
]

// 心情标签
const moodOptions = [
  { id: "excited", label: "兴奋", emoji: "lightning" },
  { id: "peaceful", label: "平静", emoji: "leaf" },
  { id: "melancholy", label: "忧郁", emoji: "cloud" },
  { id: "inspired", label: "受启发", emoji: "bulb" },
  { id: "confused", label: "困惑", emoji: "question" },
  { id: "determined", label: "坚定", emoji: "target" },
]

// 模拟数据
const mockInspirations: Inspiration[] = [
  {
    id: "1",
    type: "text",
    content: "主角在得知真相后的反应不应该是愤怒，而是一种更深层的悲伤和自我怀疑。这样可以让角色更加立体，也为后续的成长埋下伏笔。",
    title: "角色心理转变",
    tags: ["character", "emotion"],
    linkedWorks: ["凌云志"],
    linkedCharacters: ["林风"],
    linkedPlots: ["真相揭露"],
    isFavorite: true,
    isPrivate: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    mood: "inspired",
  },
  {
    id: "2",
    type: "quote",
    content: "人最难的不是认识别人，而是认识自己。我们总是在别人身上看到自己的影子，却不愿意承认那就是自己。",
    title: "关于自我认知",
    source: "《人间失格》太宰治",
    tags: ["emotion", "character"],
    linkedWorks: [],
    linkedCharacters: [],
    linkedPlots: [],
    isFavorite: true,
    isPrivate: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: "3",
    type: "idea",
    content: "如果修仙世界的「道」其实是一种高维信息体，修炼的本质是让自己的意识能够解码这种信息？这样可以解释为什么顿悟如此重要。",
    title: "修仙体系新解读",
    tags: ["worldbuilding", "setting"],
    linkedWorks: ["凌云志"],
    linkedCharacters: [],
    linkedPlots: [],
    isFavorite: false,
    isPrivate: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    mood: "excited",
  },
  {
    id: "4",
    type: "voice",
    content: "关于反派动机的思考：他不是为了毁灭世界，而是为了重建一个他认为更公平的世界。他的方法是错误的，但他的初衷是可以理解的。",
    title: "反派角色塑造",
    audioUrl: "/audio/voice-note-1.mp3",
    tags: ["character", "conflict"],
    linkedWorks: ["凌云志"],
    linkedCharacters: ["暗影主"],
    linkedPlots: [],
    isFavorite: false,
    isPrivate: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72),
  },
  {
    id: "5",
    type: "bookmark",
    content: "这篇关于叙事节奏的文章非常有参考价值，特别是关于「张弛有度」的部分，可以用在连载节奏控制上。",
    title: "叙事节奏研究",
    source: "写作技巧研究",
    sourceUrl: "https://example.com/narrative-pacing",
    tags: ["plot", "foreshadow"],
    linkedWorks: [],
    linkedCharacters: [],
    linkedPlots: [],
    isFavorite: false,
    isPrivate: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 96),
  },
  {
    id: "6",
    type: "text",
    content: "「师父，为什么您总说修行如逆水行舟？」\n「因为顺流而下的，从来不是你自己选择的方向。」\n\n这段对话可以用在林风入门时的场景，为后续他的选择做铺垫。",
    title: "师徒对话片段",
    tags: ["dialogue", "foreshadow"],
    linkedWorks: ["凌云志"],
    linkedCharacters: ["林风", "青云子"],
    linkedPlots: ["入门篇"],
    isFavorite: true,
    isPrivate: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 120),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 120),
    mood: "peaceful",
  },
]

// 文件夹模拟数据
const mockFolders: InspirationFolder[] = [
  { id: "1", name: "凌云志素材", color: "bg-blue-500", count: 24, isExpanded: true },
  { id: "2", name: "人物灵感", color: "bg-purple-500", count: 18, isExpanded: false },
  { id: "3", name: "世界观设定", color: "bg-amber-500", count: 12, isExpanded: false },
  { id: "4", name: "对话片段", color: "bg-green-500", count: 35, isExpanded: false },
  { id: "5", name: "未分类", color: "bg-muted", count: 8, isExpanded: false },
]

// 灵感卡片组件
function InspirationCard({
  inspiration,
  viewMode,
  onEdit,
  onLink,
}: {
  inspiration: Inspiration
  viewMode: "grid" | "list" | "masonry"
  onEdit: (inspiration: Inspiration) => void
  onLink: (inspiration: Inspiration) => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const typeConfig = inspirationTypes.find((t) => t.id === inspiration.type)
  const TypeIcon = typeConfig?.icon || FileText

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (hours < 1) return "刚刚"
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString("zh-CN")
  }

  const getMoodIcon = (mood?: string) => {
    switch (mood) {
      case "excited":
        return <Zap className="h-3 w-3 text-amber-400" />
      case "peaceful":
        return <span className="text-xs text-green-400">-</span>
      case "melancholy":
        return <span className="text-xs text-blue-400">~</span>
      case "inspired":
        return <Lightbulb className="h-3 w-3 text-yellow-400" />
      case "confused":
        return <AlertCircle className="h-3 w-3 text-orange-400" />
      case "determined":
        return <span className="text-xs text-red-400">!</span>
      default:
        return null
    }
  }

  if (viewMode === "list") {
    return (
      <div
        className="group flex items-start gap-4 rounded-lg border border-border/40 bg-card/50 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-card/80"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* 类型图标 */}
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50", typeConfig?.color)}>
          <TypeIcon className="h-5 w-5" />
        </div>

        {/* 内容 */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {inspiration.title && (
              <h4 className="truncate text-sm font-medium text-foreground">{inspiration.title}</h4>
            )}
            {inspiration.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            {inspiration.isPrivate && <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            {getMoodIcon(inspiration.mood)}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{inspiration.content}</p>

          {/* 标签和关联 */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {inspiration.tags.map((tagId) => {
              const tag = tagSuggestions.find((t) => t.id === tagId)
              return tag ? (
                <Badge key={tagId} variant="secondary" className={cn("h-5 px-1.5 text-[10px]", tag.color)}>
                  {tag.label}
                </Badge>
              ) : null
            })}
            {inspiration.linkedWorks.length > 0 && (
              <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                <Link2 className="h-2.5 w-2.5" />
                {inspiration.linkedWorks[0]}
              </Badge>
            )}
          </div>
        </div>

        {/* 时间和操作 */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-xs text-muted-foreground">{formatDate(inspiration.createdAt)}</span>
          <div className={cn("flex gap-1 transition-opacity", isHovered ? "opacity-100" : "opacity-0")}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onLink(inspiration)}>
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>关联到作品</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(inspiration)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  复制内容
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Star className="mr-2 h-4 w-4" />
                  {inspiration.isFavorite ? "取消收藏" : "添加收藏"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Archive className="mr-2 h-4 w-4" />
                  归档
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  }

  // 卡片视图
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 类型标识 */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-md bg-muted/50", typeConfig?.color)}>
            <TypeIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs text-muted-foreground">{typeConfig?.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {inspiration.isFavorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
          {inspiration.isPrivate && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
          {getMoodIcon(inspiration.mood)}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex flex-1 flex-col p-3">
        {inspiration.title && (
          <h4 className="mb-2 text-sm font-medium text-foreground">{inspiration.title}</h4>
        )}

        {/* 语音类型特殊处理 */}
        {inspiration.type === "voice" ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/30 p-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-full p-0"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1">
              <div className="h-1 rounded-full bg-muted">
                <div className="h-full w-1/3 rounded-full bg-primary" />
              </div>
            </div>
            <span className="text-xs text-muted-foreground">0:45</span>
          </div>
        ) : null}

        {/* 图片类型特殊处理 */}
        {inspiration.type === "image" && inspiration.imageUrl ? (
          <div className="relative mb-2 aspect-video overflow-hidden rounded-lg bg-muted/30">
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          </div>
        ) : null}

        {/* 文字内容 */}
        <p className={cn(
          "text-sm text-muted-foreground",
          inspiration.type === "quote" ? "border-l-2 border-primary/50 pl-3 italic" : "",
          viewMode === "masonry" ? "" : "line-clamp-4"
        )}>
          {inspiration.content}
        </p>

        {/* 引用来源 */}
        {inspiration.source && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Quote className="h-3 w-3" />
            <span>{inspiration.source}</span>
            {inspiration.sourceUrl && <ExternalLink className="h-3 w-3" />}
          </div>
        )}

        {/* 标签 */}
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          {inspiration.tags.slice(0, 3).map((tagId) => {
            const tag = tagSuggestions.find((t) => t.id === tagId)
            return tag ? (
              <Badge key={tagId} variant="secondary" className={cn("h-5 px-1.5 text-[10px]", tag.color)}>
                {tag.label}
              </Badge>
            ) : null
          })}
          {inspiration.tags.length > 3 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              +{inspiration.tags.length - 3}
            </Badge>
          )}
        </div>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{formatDate(inspiration.createdAt)}</span>
        </div>
        {inspiration.linkedWorks.length > 0 && (
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
            <Link2 className="h-2.5 w-2.5" />
            {inspiration.linkedWorks.length}
          </Badge>
        )}
      </div>

      {/* 悬浮操作 */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-card via-card/95 to-transparent pb-3 pt-8 transition-opacity",
        isHovered ? "opacity-100" : "opacity-0"
      )}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={() => onLink(inspiration)}>
                <Link2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关联到作品</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={() => onEdit(inspiration)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              复制内容
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star className="mr-2 h-4 w-4" />
              {inspiration.isFavorite ? "取消收藏" : "添加收藏"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Folder className="mr-2 h-4 w-4" />
                移动到文件夹
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {mockFolders.map((folder) => (
                  <DropdownMenuItem key={folder.id}>
                    <div className={cn("mr-2 h-3 w-3 rounded-sm", folder.color)} />
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Archive className="mr-2 h-4 w-4" />
              归档
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// 快速捕捉组件
function QuickCapture({ onCapture }: { onCapture: (type: string, content: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [content, setContent] = useState("")
  const [activeType, setActiveType] = useState<"text" | "voice">("text")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleSubmit = () => {
    if (content.trim()) {
      onCapture(activeType, content)
      setContent("")
      setIsExpanded(false)
    }
  }

  return (
    <div className={cn(
      "rounded-xl border border-border/40 bg-card/50 transition-all duration-300",
      isExpanded ? "shadow-lg" : ""
    )}>
      {!isExpanded ? (
        <button
          onClick={() => {
            setIsExpanded(true)
            setTimeout(() => inputRef.current?.focus(), 100)
          }}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">捕捉灵感...</p>
            <p className="text-xs text-muted-foreground/60">随时记录你的想法、引用、语音备忘</p>
          </div>
          <div className="flex gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Mic className="h-4 w-4" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </div>
          </div>
        </button>
      ) : (
        <div className="p-4">
          {/* 类型切换 */}
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setActiveType("text")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all",
                activeType === "text"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <FileText className="h-4 w-4" />
              文字
            </button>
            <button
              onClick={() => setActiveType("voice")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all",
                activeType === "voice"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Mic className="h-4 w-4" />
              语音
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setIsExpanded(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activeType === "text" ? (
            <>
              <Textarea
                ref={inputRef}
                placeholder="记录你的灵感..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[100px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <Tag className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>添加标签</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>关联作品</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <ImageIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>添加图片</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Button size="sm" onClick={handleSubmit} disabled={!content.trim()} className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  保存
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-6">
              {isRecording ? (
                <>
                  <div className="relative mb-4">
                    <div className="h-20 w-20 animate-pulse rounded-full bg-red-500/20" />
                    <button
                      onClick={() => setIsRecording(false)}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                        <Pause className="h-6 w-6" />
                      </div>
                    </button>
                  </div>
                  <p className="text-lg font-medium text-foreground">{formatTime(recordingTime)}</p>
                  <p className="text-sm text-muted-foreground">正在录音...</p>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsRecording(true)
                      setRecordingTime(0)
                    }}
                    className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary transition-all hover:bg-primary/20 hover:scale-105"
                  >
                    <Mic className="h-8 w-8" />
                  </button>
                  <p className="text-sm text-muted-foreground">点击开始录音</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 随机灵感组件
function RandomInspiration({ inspirations }: { inspirations: Inspiration[] }) {
  const [current, setCurrent] = useState(0)

  const shuffle = () => {
    setCurrent(Math.floor(Math.random() * inspirations.length))
  }

  const inspiration = inspirations[current]
  if (!inspiration) return null

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">随机灵感</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2" onClick={shuffle}>
          <Shuffle className="h-3.5 w-3.5" />
          换一个
        </Button>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-3">{inspiration.content}</p>
      {inspiration.linkedWorks.length > 0 && (
        <div className="mt-2">
          <Badge variant="outline" className="text-xs">
            <Link2 className="mr-1 h-2.5 w-2.5" />
            {inspiration.linkedWorks[0]}
          </Badge>
        </div>
      )}
    </div>
  )
}

// 主组件
export function LiuguangModule() {
  const [inspirations, setInspirations] = useState(mockInspirations)
  const [folders, setFolders] = useState(mockFolders)
  const [viewMode, setViewMode] = useState<"grid" | "list" | "masonry">("grid")
  const [activeType, setActiveType] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [editingInspiration, setEditingInspiration] = useState<Inspiration | null>(null)
  const [linkingInspiration, setLinkingInspiration] = useState<Inspiration | null>(null)

  // 过滤灵感
  const filteredInspirations = inspirations.filter((i) => {
    if (activeType !== "all" && i.type !== activeType) return false
    if (searchQuery && !i.content.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const handleCapture = (type: string, content: string) => {
    const newInspiration: Inspiration = {
      id: Date.now().toString(),
      type: type as Inspiration["type"],
      content,
      tags: [],
      linkedWorks: [],
      linkedCharacters: [],
      linkedPlots: [],
      isFavorite: false,
      isPrivate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setInspirations([newInspiration, ...inspirations])
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-3">
        <div className="flex items-center gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            流光 - 灵感碎片
          </h2>
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5">
            {inspirationTypes.map((type) => {
              const Icon = type.icon
              return (
                <TooltipProvider key={type.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveType(type.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-all",
                          activeType === type.id
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", activeType === type.id ? type.color : "")} />
                        <span className="hidden lg:inline">{type.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{type.label}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索灵感..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-[200px] bg-muted/30 pl-9 lg:w-[280px]"
            />
          </div>

          {/* 过滤 */}
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", showFilters && "bg-primary/10 text-primary")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden lg:inline">筛选</span>
          </Button>

          {/* 视图切换 */}
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                      viewMode === "grid" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>卡片视图</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                      viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>列表视图</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 - 文件夹 */}
        <aside className="hidden w-64 shrink-0 border-r border-border/40 lg:block">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* 快速捕捉 */}
              <QuickCapture onCapture={handleCapture} />

              {/* 随机灵感 */}
              <div className="mt-4">
                <RandomInspiration inspirations={inspirations} />
              </div>

              {/* 文件夹列表 */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">文件夹</h3>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedFolder(null)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      selectedFolder === null
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="flex-1 text-left">全部灵感</span>
                    <span className="text-xs">{inspirations.length}</span>
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => setSelectedFolder(folder.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        selectedFolder === folder.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <div className={cn("h-3 w-3 rounded-sm", folder.color)} />
                      <span className="flex-1 truncate text-left">{folder.name}</span>
                      <span className="text-xs">{folder.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 标签云 */}
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">常用标签</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tagSuggestions.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className={cn("cursor-pointer transition-colors hover:opacity-80", tag.color)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 统计信息 */}
              <div className="mt-6 rounded-lg border border-border/40 bg-muted/20 p-3">
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">本月统计</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{inspirations.length}</p>
                    <p className="text-xs text-muted-foreground">总灵感</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">
                      {inspirations.filter((i) => i.linkedWorks.length > 0).length}
                    </p>
                    <p className="text-xs text-muted-foreground">已关联</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* 灵感列表 */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              {/* 移动端快速捕捉 */}
              <div className="mb-4 lg:hidden">
                <QuickCapture onCapture={handleCapture} />
              </div>

              {filteredInspirations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                    <Sparkles className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-medium text-foreground">暂无灵感</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {searchQuery ? "没有找到匹配的灵感" : "开始记录你的第一个灵感吧"}
                  </p>
                  {!searchQuery && (
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      捕捉灵感
                    </Button>
                  )}
                </div>
              ) : viewMode === "list" ? (
                <div className="space-y-3">
                  {filteredInspirations.map((inspiration) => (
                    <InspirationCard
                      key={inspiration.id}
                      inspiration={inspiration}
                      viewMode={viewMode}
                      onEdit={setEditingInspiration}
                      onLink={setLinkingInspiration}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredInspirations.map((inspiration) => (
                    <InspirationCard
                      key={inspiration.id}
                      inspiration={inspiration}
                      viewMode={viewMode}
                      onEdit={setEditingInspiration}
                      onLink={setLinkingInspiration}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={!!editingInspiration} onOpenChange={() => setEditingInspiration(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑灵感</DialogTitle>
            <DialogDescription>修改灵感内容和属性</DialogDescription>
          </DialogHeader>
          {editingInspiration && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">标题（可选）</label>
                <Input
                  placeholder="给这个灵感起个名字..."
                  defaultValue={editingInspiration.title}
                  className="bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">内容</label>
                <Textarea
                  placeholder="灵感内容..."
                  defaultValue={editingInspiration.content}
                  className="min-h-[150px] resize-none bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">标签</label>
                <div className="flex flex-wrap gap-2">
                  {tagSuggestions.map((tag) => (
                    <button
                      key={tag.id}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-all",
                        editingInspiration.tags.includes(tag.id)
                          ? cn("border-transparent", tag.color)
                          : "border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/30"
                      )}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingInspiration(null)}>
              取消
            </Button>
            <Button onClick={() => setEditingInspiration(null)}>保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 关联对话框 */}
      <Dialog open={!!linkingInspiration} onOpenChange={() => setLinkingInspiration(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              关联到作品
            </DialogTitle>
            <DialogDescription>将这个灵感关联到作品、人物或情节</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="work" className="py-4">
            <TabsList className="mb-4 grid w-full grid-cols-3">
              <TabsTrigger value="work">作品</TabsTrigger>
              <TabsTrigger value="character">人物</TabsTrigger>
              <TabsTrigger value="plot">情节</TabsTrigger>
            </TabsList>
            <TabsContent value="work" className="space-y-2">
              <Input placeholder="搜索作品..." className="bg-muted/30" />
              <div className="mt-3 space-y-2">
                {["凌云志", "星际迷航", "都市之巅峰强者"].map((work) => (
                  <button
                    key={work}
                    className="flex w-full items-center gap-3 rounded-lg border border-border/40 bg-card/50 p-3 text-left transition-colors hover:border-primary/30 hover:bg-card/80"
                  >
                    <div className="h-10 w-8 rounded bg-gradient-to-br from-primary/30 to-primary/10" />
                    <span className="text-sm font-medium text-foreground">{work}</span>
                    <Check className="ml-auto h-4 w-4 text-primary opacity-0" />
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="character" className="space-y-2">
              <Input placeholder="搜索人物..." className="bg-muted/30" />
              <p className="py-8 text-center text-sm text-muted-foreground">选择作品后显示人物列表</p>
            </TabsContent>
            <TabsContent value="plot" className="space-y-2">
              <Input placeholder="搜索情节..." className="bg-muted/30" />
              <p className="py-8 text-center text-sm text-muted-foreground">选择作品后显示情节列表</p>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkingInspiration(null)}>
              取消
            </Button>
            <Button onClick={() => setLinkingInspiration(null)}>确认关联</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
