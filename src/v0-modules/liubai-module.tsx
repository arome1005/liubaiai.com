
import { useState } from "react"
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  SortAsc,
  Clock,
  TrendingUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  Archive,
  Star,
  ChevronDown,
  ChevronRight,
  FileText,
  Users,
  Calendar,
  BarChart3,
  Settings,
  Play,
  Tag,
  X,
  Check,
  Upload,
  FolderOpen,
  Sparkles,
  Eye,
  Copy,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Circle,
  Bookmark,
  Target,
  Layers,
  Zap,
  Brain,
  PenTool,
} from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
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

// 类型定义
interface Work {
  id: string
  title: string
  description: string
  coverColor: string
  status: "drafting" | "serializing" | "completed" | "paused"
  wordCount: number
  chapterCount: number
  targetWordCount?: number
  progress: number
  tags: string[]
  platformTags: string[]
  genreTags: string[]
  isFavorite: boolean
  lastUpdated: Date
  createdAt: Date
  outlineStatus: "none" | "partial" | "complete"
  bibleStatus: "none" | "basic" | "detailed"
}

// 标签配置
const platformTags = [
  { id: "qidian", label: "起点风", description: "男频长篇，升级爽文" },
  { id: "fanqie", label: "番茄风", description: "短篇快节奏，爽点密集" },
  { id: "qimao", label: "七猫风", description: "通俗易懂，下沉市场" },
  { id: "jjwxc", label: "晋江风", description: "女频言情，情感细腻" },
  { id: "indie", label: "独立向", description: "文学性强，风格独特" },
]

const genreTags = [
  { id: "xuanhuan", label: "玄幻", color: "bg-purple-500/20 text-purple-400" },
  { id: "xianxia", label: "仙侠", color: "bg-blue-500/20 text-blue-400" },
  { id: "dushi", label: "都市", color: "bg-green-500/20 text-green-400" },
  { id: "lishi", label: "历史", color: "bg-amber-500/20 text-amber-400" },
  { id: "kehuan", label: "科幻", color: "bg-cyan-500/20 text-cyan-400" },
  { id: "xuanyi", label: "悬疑", color: "bg-rose-500/20 text-rose-400" },
  { id: "yanqing", label: "言情", color: "bg-pink-500/20 text-pink-400" },
  { id: "tongren", label: "同人", color: "bg-orange-500/20 text-orange-400" },
  { id: "wuxianliu", label: "无限流", color: "bg-indigo-500/20 text-indigo-400" },
  { id: "xitongliu", label: "系统流", color: "bg-teal-500/20 text-teal-400" },
  { id: "chongsheng", label: "重生", color: "bg-violet-500/20 text-violet-400" },
  { id: "chuanyue", label: "穿越", color: "bg-emerald-500/20 text-emerald-400" },
]

const creationTypes = [
  { id: "original", label: "原创", description: "完全原创的故事" },
  { id: "fanfic", label: "同人衍生", description: "基于已有作品的二次创作" },
]

// 模拟数据
const mockWorks: Work[] = [
  {
    id: "1",
    title: "凌云志",
    description: "少年林风意外获得上古传承，踏上修仙之路。在青云门中结识挚友，初尝江湖险恶。",
    coverColor: "from-blue-600/40 to-purple-600/40",
    status: "serializing",
    wordCount: 128000,
    chapterCount: 52,
    targetWordCount: 2000000,
    progress: 6.4,
    tags: ["玄幻", "升级", "热血"],
    platformTags: ["起点风"],
    genreTags: ["xuanhuan", "xitongliu"],
    isFavorite: true,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2),
    createdAt: new Date("2024-01-15"),
    outlineStatus: "complete",
    bibleStatus: "detailed",
  },
  {
    id: "2",
    title: "星际迷航",
    description: "地球联邦星际探险队深入未知星域，发现远古文明遗迹，揭开宇宙终极秘密。",
    coverColor: "from-cyan-600/40 to-blue-600/40",
    status: "drafting",
    wordCount: 35000,
    chapterCount: 15,
    targetWordCount: 1500000,
    progress: 2.3,
    tags: ["科幻", "探险", "硬核"],
    platformTags: ["独立向"],
    genreTags: ["kehuan"],
    isFavorite: false,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    createdAt: new Date("2024-02-20"),
    outlineStatus: "partial",
    bibleStatus: "basic",
  },
  {
    id: "3",
    title: "都市之巅峰强者",
    description: "退伍兵王重返都市，面对家族危机，凭借过人实力和智慧，一步步走向巅峰。",
    coverColor: "from-green-600/40 to-emerald-600/40",
    status: "serializing",
    wordCount: 456000,
    chapterCount: 180,
    targetWordCount: 3000000,
    progress: 15.2,
    tags: ["都市", "兵王", "爽文"],
    platformTags: ["番茄风"],
    genreTags: ["dushi"],
    isFavorite: true,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 30),
    createdAt: new Date("2023-11-10"),
    outlineStatus: "complete",
    bibleStatus: "detailed",
  },
  {
    id: "4",
    title: "诡异修仙路",
    description: "在这个诡异遍布的修仙世界，主角需要面对的不仅是修炼，还有来自心底的恐惧。",
    coverColor: "from-purple-600/40 to-rose-600/40",
    status: "paused",
    wordCount: 89000,
    chapterCount: 45,
    targetWordCount: 1000000,
    progress: 8.9,
    tags: ["修仙", "诡异", "心理"],
    platformTags: ["起点风"],
    genreTags: ["xianxia", "xuanyi"],
    isFavorite: false,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
    createdAt: new Date("2023-08-05"),
    outlineStatus: "partial",
    bibleStatus: "basic",
  },
  {
    id: "5",
    title: "穿越成为公主后",
    description: "现代女白领穿越成为亡国公主，在乱世中寻找自己的位置，收获意外的爱情。",
    coverColor: "from-pink-600/40 to-rose-600/40",
    status: "completed",
    wordCount: 850000,
    chapterCount: 320,
    targetWordCount: 850000,
    progress: 100,
    tags: ["穿越", "言情", "宫斗"],
    platformTags: ["晋江风"],
    genreTags: ["yanqing", "chuanyue"],
    isFavorite: true,
    lastUpdated: new Date("2024-03-01"),
    createdAt: new Date("2023-05-20"),
    outlineStatus: "complete",
    bibleStatus: "detailed",
  },
]

// 状态配置
const statusConfig = {
  drafting: { label: "草稿中", color: "bg-muted text-muted-foreground", icon: Circle },
  serializing: { label: "连载中", color: "bg-green-500/20 text-green-400", icon: Play },
  completed: { label: "已完结", color: "bg-blue-500/20 text-blue-400", icon: CheckCircle2 },
  paused: { label: "已暂停", color: "bg-amber-500/20 text-amber-400", icon: AlertCircle },
}

// 作品卡片组件
function WorkCard({
  work,
  onEdit,
  onContinue,
  onOpenWork,
}: {
  work: Work
  onEdit: (work: Work) => void
  onContinue: (work: Work) => void
  onOpenWork?: (workId: string, workTitle: string) => void
}) {
  const status = statusConfig[work.status]
  const StatusIcon = status.icon
  const [isHovered, setIsHovered] = useState(false)

  const formatWordCount = (count: number) => {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)}万`
    }
    return count.toString()
  }

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

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all duration-300 hover:border-primary/30 hover:bg-card/80 hover:shadow-xl hover:shadow-primary/5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 封面区域 */}
      <div className={cn("relative aspect-[4/5] bg-gradient-to-br", work.coverColor)}>
        {/* 书名和作者 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <h3 className="text-xl font-bold text-foreground/90 drop-shadow-sm">
              {work.title}
            </h3>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {work.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 状态角标 */}
        <div className="absolute left-2 top-2">
          <Badge className={cn("gap-1 text-[10px]", status.color)}>
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>

        {/* 收藏标记 */}
        {work.isFavorite && (
          <div className="absolute right-2 top-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400 drop-shadow-sm" />
          </div>
        )}

        {/* 进度条 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
          <div className="flex items-center justify-between text-[10px] text-white/80">
            <span>写作进度</span>
            <span>{work.progress.toFixed(1)}%</span>
          </div>
          <Progress value={work.progress} className="mt-1 h-1 bg-white/20" />
        </div>

        {/* 悬浮���� */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0"
          )}
        >
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              onContinue(work)
              onOpenWork?.(work.id, work.title)
            }}
          >
            <PenTool className="h-4 w-4" />
            继续写作
          </Button>
          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
                    <Brain className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>推演大纲</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
                    <BookOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>查看锦囊</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => onEdit(work)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑信息
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Star className="mr-2 h-4 w-4" />
                  {work.isFavorite ? "取消收藏" : "添加收藏"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" />
                  导出作品
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 h-4 w-4" />
                  复制作品
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Archive className="mr-2 h-4 w-4" />
                  归档
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除作品
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 信息区域 */}
      <div className="flex flex-col gap-2 p-3">
        {/* 标签 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {work.platformTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-5 bg-primary/10 px-1.5 text-[10px] font-normal text-primary"
            >
              {tag}
            </Badge>
          ))}
          {work.genreTags.slice(0, 2).map((tagId) => {
            const tag = genreTags.find((t) => t.id === tagId)
            return tag ? (
              <Badge
                key={tagId}
                variant="secondary"
                className={cn("h-5 px-1.5 text-[10px] font-normal", tag.color)}
              >
                {tag.label}
              </Badge>
            ) : null
          })}
        </div>

        {/* 统计数据 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatWordCount(work.wordCount)}字</span>
          <span>{work.chapterCount}章</span>
        </div>

        {/* 更新时间 */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatDate(work.lastUpdated)}更新</span>
        </div>

        {/* 状态指标 */}
        <div className="flex items-center gap-2 border-t border-border/40 pt-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Layers
                    className={cn(
                      "h-3.5 w-3.5",
                      work.outlineStatus === "complete"
                        ? "text-green-400"
                        : work.outlineStatus === "partial"
                        ? "text-amber-400"
                        : "text-muted-foreground"
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                大纲状态: {work.outlineStatus === "complete" ? "已完成" : work.outlineStatus === "partial" ? "部分完成" : "未开始"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <BookOpen
                    className={cn(
                      "h-3.5 w-3.5",
                      work.bibleStatus === "detailed"
                        ? "text-green-400"
                        : work.bibleStatus === "basic"
                        ? "text-amber-400"
                        : "text-muted-foreground"
                    )}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                锦囊状态: {work.bibleStatus === "detailed" ? "详细" : work.bibleStatus === "basic" ? "基础" : "未开始"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}

// 新建作品对话框
function NewWorkDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: Partial<Work>) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState<string[]>([])
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState("original")

  const togglePlatform = (id: string) => {
    setSelectedPlatform((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const toggleGenre = (id: string) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const handleSubmit = () => {
    if (!title.trim()) return
    onSubmit({
      title,
      description,
      platformTags: selectedPlatform.map(
        (id) => platformTags.find((p) => p.id === id)?.label || ""
      ),
      genreTags: selectedGenres,
    })
    // Reset form
    setTitle("")
    setDescription("")
    setSelectedPlatform([])
    setSelectedGenres([])
    setSelectedType("original")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            新建作品
          </DialogTitle>
          <DialogDescription>
            创建一部新作品，设置基本信息和标签
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 作品名称 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              作品名称 <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="请输入作品名称..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-muted/30"
            />
          </div>

          {/* 作品简介 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              作品简介
            </label>
            <Textarea
              placeholder="简单描述你的故事..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] resize-none bg-muted/30"
            />
          </div>

          {/* 作品标签 */}
          <div className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
            <h4 className="text-sm font-medium text-foreground">
              作品标签（可多选）
            </h4>

            {/* 平台定位 */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">平台定位</label>
              <div className="flex flex-wrap gap-2">
                {platformTags.map((tag) => (
                  <TooltipProvider key={tag.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => togglePlatform(tag.id)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm transition-all",
                            selectedPlatform.includes(tag.id)
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {selectedPlatform.includes(tag.id) && (
                            <Check className="mr-1 inline h-3 w-3" />
                          )}
                          {tag.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{tag.description}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>

            {/* 题材类型 */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">题材类型</label>
              <div className="flex flex-wrap gap-2">
                {genreTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleGenre(tag.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-all",
                      selectedGenres.includes(tag.id)
                        ? cn("border-transparent", tag.color)
                        : "border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    {selectedGenres.includes(tag.id) && (
                      <Check className="mr-1 inline h-3 w-3" />
                    )}
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 创作类型 */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">创作类型</label>
              <div className="flex gap-2">
                {creationTypes.map((type) => (
                  <TooltipProvider key={type.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSelectedType(type.id)}
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm transition-all",
                            selectedType === type.id
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {selectedType === type.id && (
                            <Check className="mr-1 inline h-3 w-3" />
                          )}
                          {type.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{type.description}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground">
              标签将影响AI生成的风格和节奏。选择合适的标签可以让AI更好地理解你的创作意图。
              标签可以在创建后随时修改。
            </p>
          </div>

          {/* 同人提示 */}
          {selectedType === "fanfic" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 text-amber-400" />
              <p className="text-xs text-amber-400">
                同人创作请遵守原著版权和平台规则。建议在藏经中导入原著作为参考，
                推演时可关联进行提炼（非复制原文）。
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            创建作品
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 主模块组件
interface LiuBaiModuleProps {
  onOpenWork?: (workId: string, workTitle: string) => void
}

export function LiuBaiModule({ onOpenWork }: LiuBaiModuleProps) {
  const [works, setWorks] = useState<Work[]>(mockWorks)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<"updated" | "created" | "wordCount">("updated")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [isNewWorkDialogOpen, setIsNewWorkDialogOpen] = useState(false)
  const [editingWork, setEditingWork] = useState<Work | null>(null)

  // 筛选和排序
  const filteredWorks = works
    .filter((work) => {
      const matchesSearch =
        work.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        work.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        work.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        )
      const matchesStatus = !selectedStatus || work.status === selectedStatus
      const matchesGenre =
        !selectedGenre || work.genreTags.includes(selectedGenre)
      const matchesFavorite = !showFavoritesOnly || work.isFavorite
      return matchesSearch && matchesStatus && matchesGenre && matchesFavorite
    })
    .sort((a, b) => {
      if (sortBy === "updated") {
        return b.lastUpdated.getTime() - a.lastUpdated.getTime()
      }
      if (sortBy === "created") {
        return b.createdAt.getTime() - a.createdAt.getTime()
      }
      return b.wordCount - a.wordCount
    })

  // 统计数据
  const totalWords = works.reduce((acc, work) => acc + work.wordCount, 0)
  const totalChapters = works.reduce((acc, work) => acc + work.chapterCount, 0)
  const serializingCount = works.filter((w) => w.status === "serializing").length

  const handleNewWork = (data: Partial<Work>) => {
    const newWork: Work = {
      id: Date.now().toString(),
      title: data.title || "未命名作品",
      description: data.description || "",
      coverColor: "from-primary/40 to-purple-600/40",
      status: "drafting",
      wordCount: 0,
      chapterCount: 0,
      progress: 0,
      tags: [],
      platformTags: data.platformTags || [],
      genreTags: data.genreTags || [],
      isFavorite: false,
      lastUpdated: new Date(),
      createdAt: new Date(),
      outlineStatus: "none",
      bibleStatus: "none",
    }
    setWorks([newWork, ...works])
  }

  const handleContinueWriting = (work: Work) => {
    // 这里应该导航到落笔模块
    console.log("Continue writing:", work.title)
  }

  const handleEditWork = (work: Work) => {
    setEditingWork(work)
    // 这里可以打开编辑对话框
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* 页面标题区 */}
        <div className="border-b border-border/40 bg-card/30 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">我的作品</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                管理你的创作，开启新的故事
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                导入作品
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setIsNewWorkDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                新建作品
              </Button>
            </div>
          </div>

          {/* 统计卡片 */}
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {works.length}
                  </p>
                  <p className="text-xs text-muted-foreground">作品总数</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Play className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {serializingCount}
                  </p>
                  <p className="text-xs text-muted-foreground">连载中</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <FileText className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {(totalWords / 10000).toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">万字累计</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Layers className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-foreground">
                    {totalChapters}
                  </p>
                  <p className="text-xs text-muted-foreground">章节总数</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 筛选工具栏 */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-card/20 px-6 py-3">
          {/* 搜索 */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索作品名称、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background/50 pl-9 border-border/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 状态筛选 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {selectedStatus
                  ? statusConfig[selectedStatus as keyof typeof statusConfig]?.label
                  : "全部状态"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSelectedStatus(null)}>
                全部状态
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {Object.entries(statusConfig).map(([key, config]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setSelectedStatus(key)}
                  className={cn(selectedStatus === key && "bg-primary/10")}
                >
                  <config.icon className="mr-2 h-4 w-4" />
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 题材筛选 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Tag className="h-4 w-4" />
                {selectedGenre
                  ? genreTags.find((g) => g.id === selectedGenre)?.label
                  : "全部题材"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] overflow-auto">
              <DropdownMenuItem onClick={() => setSelectedGenre(null)}>
                全部题材
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {genreTags.map((tag) => (
                <DropdownMenuItem
                  key={tag.id}
                  onClick={() => setSelectedGenre(tag.id)}
                  className={cn(selectedGenre === tag.id && "bg-primary/10")}
                >
                  <span
                    className={cn(
                      "mr-2 h-2 w-2 rounded-full",
                      tag.color.replace("text-", "bg-").replace("/20", "")
                    )}
                  />
                  {tag.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 排序 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SortAsc className="h-4 w-4" />
                排序
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSortBy("updated")}>
                <Clock className="mr-2 h-4 w-4" />
                最近更新
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("created")}>
                <Calendar className="mr-2 h-4 w-4" />
                创建时间
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("wordCount")}>
                <BarChart3 className="mr-2 h-4 w-4" />
                字数排序
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 收藏筛选 */}
          <Button
            variant={showFavoritesOnly ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <Star
              className={cn("h-4 w-4", showFavoritesOnly && "fill-current")}
            />
            收藏
          </Button>

          {/* 视图切换 */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/50 p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 作品列表 */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {filteredWorks.length > 0 ? (
              <div
                className={cn(
                  viewMode === "grid"
                    ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                    : "space-y-3"
                )}
              >
                {filteredWorks.map((work) => (
                  <WorkCard
                    key={work.id}
                    work={work}
                    onEdit={handleEditWork}
                    onContinue={handleContinueWriting}
                    onOpenWork={onOpenWork}
                  />
                ))}

                {/* 新建作品入口卡片 */}
                {viewMode === "grid" && (
                  <button
                    onClick={() => setIsNewWorkDialogOpen(true)}
                    className="group flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/40 bg-card/20 transition-all hover:border-primary/50 hover:bg-card/50"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                      <Plus className="h-7 w-7" />
                    </div>
                    <span className="text-sm text-muted-foreground group-hover:text-foreground">
                      新建作品
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <FolderOpen className="h-16 w-16 text-muted-foreground/30" />
                <h3 className="mt-4 text-lg font-medium text-foreground">
                  {searchQuery || selectedStatus || selectedGenre || showFavoritesOnly
                    ? "未找到匹配的作品"
                    : "开始你的创作之旅"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchQuery || selectedStatus || selectedGenre || showFavoritesOnly
                    ? "尝试调整筛选条件"
                    : "点击下方按钮创建你的第一部作品"}
                </p>
                <Button
                  className="mt-6 gap-2"
                  onClick={() => {
                    if (searchQuery || selectedStatus || selectedGenre || showFavoritesOnly) {
                      setSearchQuery("")
                      setSelectedStatus(null)
                      setSelectedGenre(null)
                      setShowFavoritesOnly(false)
                    } else {
                      setIsNewWorkDialogOpen(true)
                    }
                  }}
                >
                  {searchQuery || selectedStatus || selectedGenre || showFavoritesOnly ? (
                    <>
                      <X className="h-4 w-4" />
                      清除筛选
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      新建作品
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 新建作品对话框 */}
        <NewWorkDialog
          open={isNewWorkDialogOpen}
          onOpenChange={setIsNewWorkDialogOpen}
          onSubmit={handleNewWork}
        />
      </div>
    </TooltipProvider>
  )
}
