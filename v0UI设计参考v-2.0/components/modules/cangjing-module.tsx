"use client"

import { useState } from "react"
import {
  Book,
  HardDrive,
  Search,
  Grid3X3,
  List,
  Upload,
  Tag,
  FileText,
  MoreVertical,
  Check,
  Filter,
  SortAsc,
  Eye,
  Trash2,
  Edit3,
  Download,
  Star,
  Clock,
  TrendingUp,
  ChevronDown,
  X,
  Bookmark,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"

interface ReferenceBook {
  id: string
  title: string
  author: string
  chapters: number
  words: number
  tags: string[]
  isLocal: boolean
  isFavorite: boolean
  readProgress: number
  lastRead?: string
  coverColor: string
  extractedCount: number
  rating: number
}

const mockBooks: ReferenceBook[] = [
  {
    id: "1",
    title: "诡秘之主",
    author: "爱潜水的乌贼",
    chapters: 1432,
    words: 4680000,
    tags: ["玄幻", "克苏鲁", "职业体系"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2024-01-15",
    coverColor: "from-amber-900/40 to-amber-950/60",
    extractedCount: 24,
    rating: 5,
  },
  {
    id: "2",
    title: "剑来",
    author: "烽火戏诸侯",
    chapters: 1200,
    words: 5200000,
    tags: ["仙侠", "剑道", "成长"],
    isLocal: true,
    isFavorite: true,
    readProgress: 78,
    lastRead: "2024-01-10",
    coverColor: "from-blue-900/40 to-blue-950/60",
    extractedCount: 18,
    rating: 5,
  },
  {
    id: "3",
    title: "大奉打更人",
    author: "卖报小郎君",
    chapters: 892,
    words: 3100000,
    tags: ["探案", "古风", "官场"],
    isLocal: true,
    isFavorite: false,
    readProgress: 45,
    coverColor: "from-emerald-900/40 to-emerald-950/60",
    extractedCount: 12,
    rating: 4,
  },
  {
    id: "4",
    title: "道诡异仙",
    author: "狐尾的笔",
    chapters: 560,
    words: 1800000,
    tags: ["修仙", "诡异", "心理"],
    isLocal: true,
    isFavorite: false,
    readProgress: 32,
    coverColor: "from-purple-900/40 to-purple-950/60",
    extractedCount: 8,
    rating: 4,
  },
  {
    id: "5",
    title: "凡人修仙传",
    author: "忘语",
    chapters: 2446,
    words: 7440000,
    tags: ["修仙", "凡人流", "经典"],
    isLocal: true,
    isFavorite: true,
    readProgress: 100,
    lastRead: "2023-12-20",
    coverColor: "from-cyan-900/40 to-cyan-950/60",
    extractedCount: 31,
    rating: 5,
  },
  {
    id: "6",
    title: "庆余年",
    author: "猫腻",
    chapters: 746,
    words: 3800000,
    tags: ["权谋", "穿越", "争霸"],
    isLocal: true,
    isFavorite: false,
    readProgress: 88,
    lastRead: "2024-01-05",
    coverColor: "from-rose-900/40 to-rose-950/60",
    extractedCount: 15,
    rating: 5,
  },
  {
    id: "7",
    title: "雪中悍刀行",
    author: "烽火戏诸侯",
    chapters: 1045,
    words: 4500000,
    tags: ["武侠", "江湖", "热血"],
    isLocal: true,
    isFavorite: false,
    readProgress: 62,
    coverColor: "from-slate-800/40 to-slate-950/60",
    extractedCount: 9,
    rating: 4,
  },
  {
    id: "8",
    title: "斗破苍穹",
    author: "天蚕土豆",
    chapters: 1648,
    words: 5300000,
    tags: ["玄幻", "热血", "升级"],
    isLocal: true,
    isFavorite: false,
    readProgress: 100,
    lastRead: "2023-11-15",
    coverColor: "from-orange-900/40 to-orange-950/60",
    extractedCount: 20,
    rating: 4,
  },
]

const allTags = ["全部", "玄幻", "仙侠", "修仙", "武侠", "探案", "权谋", "穿越", "克苏鲁", "热血", "成长"]

export function CangJingModule() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTag, setSelectedTag] = useState("全部")
  const [sortBy, setSortBy] = useState<"recent" | "words" | "progress">("recent")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const filteredBooks = mockBooks
    .filter((book) => {
      const matchesSearch =
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.tags.some((tag) => tag.includes(searchQuery))
      const matchesTag = selectedTag === "全部" || book.tags.includes(selectedTag)
      const matchesFavorite = !showFavoritesOnly || book.isFavorite
      return matchesSearch && matchesTag && matchesFavorite
    })
    .sort((a, b) => {
      if (sortBy === "words") return b.words - a.words
      if (sortBy === "progress") return b.readProgress - a.readProgress
      return (b.lastRead || "").localeCompare(a.lastRead || "")
    })

  const totalWords = mockBooks.reduce((a, b) => a + b.words, 0)
  const totalExtracted = mockBooks.reduce((a, b) => a + b.extractedCount, 0)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Module Header */}
      <div className="border-b border-border/40 bg-card/30 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">藏经阁</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              本地参考书库 · 仅供推演阶段提炼参考
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              批量导出
            </Button>
            <Button size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              导入书籍
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索书名、作者或标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border/50"
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

          {/* Tag Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {selectedTag}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {allTags.map((tag) => (
                <DropdownMenuItem
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={cn(selectedTag === tag && "bg-primary/10 text-primary")}
                >
                  {tag}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SortAsc className="h-4 w-4" />
                排序
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSortBy("recent")}>
                <Clock className="mr-2 h-4 w-4" />
                最近阅读
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("words")}>
                <BarChart3 className="mr-2 h-4 w-4" />
                字数排序
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("progress")}>
                <TrendingUp className="mr-2 h-4 w-4" />
                阅读进度
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Favorites Toggle */}
          <Button
            variant={showFavoritesOnly ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <Star className={cn("h-4 w-4", showFavoritesOnly && "fill-current")} />
            收藏
          </Button>

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
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Bar */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Book className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{mockBooks.length}</p>
                <p className="text-xs text-muted-foreground">参考书籍</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.7_0.15_145)]/10">
                <HardDrive className="h-5 w-5 text-[oklch(0.7_0.15_145)]" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{mockBooks.filter(b => b.isLocal).length}</p>
                <p className="text-xs text-muted-foreground">本地存储</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <FileText className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{(totalWords / 10000).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">万字素材</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Bookmark className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{totalExtracted}</p>
                <p className="text-xs text-muted-foreground">已提炼卡片</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grid View */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredBooks.map((book) => (
              <BookListItem key={book.id} book={book} />
            ))}
          </div>
        )}

        {filteredBooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Book className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">未找到匹配的书籍</p>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => {
                setSearchQuery("")
                setSelectedTag("全部")
                setShowFavoritesOnly(false)
              }}
            >
              清除筛选条件
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function BookCard({ book }: { book: ReferenceBook }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card/50 transition-all hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
      {/* Cover */}
      <div className={cn("relative aspect-[3/4] bg-gradient-to-br", book.coverColor)}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="px-4 text-center">
            <div className="text-lg font-semibold leading-tight text-foreground/90">
              {book.title}
            </div>
            <div className="mt-2 text-xs text-foreground/60">{book.author}</div>
          </div>
        </div>

        {/* Status Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1.5">
          {book.isLocal && (
            <div className="flex items-center gap-1 rounded-full bg-[oklch(0.7_0.15_145)]/20 px-2 py-0.5 backdrop-blur-sm">
              <Check className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />
              <span className="text-[10px] font-medium text-[oklch(0.7_0.15_145)]">本地</span>
            </div>
          )}
        </div>

        {/* Favorite */}
        {book.isFavorite && (
          <div className="absolute right-2 top-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
        )}

        {/* Reading Progress */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
          <div className="flex items-center justify-between text-[10px] text-white/80">
            <span>阅读进度</span>
            <span>{book.readProgress}%</span>
          </div>
          <Progress value={book.readProgress} className="mt-1.5 h-1 bg-white/20" />
        </div>

        {/* Hover Actions */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="secondary" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            阅读
          </Button>
          <Button size="sm" variant="secondary" className="gap-1.5">
            <Edit3 className="h-3.5 w-3.5" />
            提炼
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {book.tags.slice(0, 2).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-5 bg-primary/10 px-1.5 text-[10px] font-normal text-primary"
            >
              {tag}
            </Badge>
          ))}
          {book.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{book.tags.length - 2}</span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{book.chapters} 章</span>
          <span>{(book.words / 10000).toFixed(0)} 万字</span>
        </div>
        {book.extractedCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-purple-400">
            <Bookmark className="h-3 w-3" />
            <span>已提炼 {book.extractedCount} 条</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BookListItem({ book }: { book: ReferenceBook }) {
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-primary/30 hover:bg-card/50">
      {/* Mini Cover */}
      <div
        className={cn(
          "relative flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br",
          book.coverColor
        )}
      >
        <span className="text-sm font-medium text-foreground/80">{book.title.slice(0, 2)}</span>
        {book.isFavorite && (
          <Star className="absolute right-1 top-1 h-3 w-3 fill-amber-400 text-amber-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-foreground">{book.title}</h3>
          {book.isLocal && (
            <div className="flex items-center gap-1 rounded-full bg-[oklch(0.7_0.15_145)]/20 px-2 py-0.5">
              <Check className="h-3 w-3 text-[oklch(0.7_0.15_145)]" />
              <span className="text-[10px] font-medium text-[oklch(0.7_0.15_145)]">本地</span>
            </div>
          )}
          {/* Rating Stars */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-3 w-3",
                  i < book.rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span>{book.author}</span>
          <span className="text-border">|</span>
          <span>{book.chapters} 章</span>
          <span className="text-border">|</span>
          <span>{(book.words / 10000).toFixed(0)} 万字</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {book.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="h-5 bg-primary/10 px-1.5 text-[10px] font-normal text-primary"
            >
              {tag}
            </Badge>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">进度</span>
            <Progress value={book.readProgress} className="h-1.5 w-24" />
            <span className="text-xs text-muted-foreground">{book.readProgress}%</span>
          </div>
          {book.extractedCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-purple-400">
              <Bookmark className="h-3 w-3" />
              <span>已提炼 {book.extractedCount} 条</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <Eye className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <Edit3 className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Tag className="mr-2 h-4 w-4" />
              编辑标签
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Star className="mr-2 h-4 w-4" />
              {book.isFavorite ? "取消收藏" : "添加收藏"}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              导出提炼
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
