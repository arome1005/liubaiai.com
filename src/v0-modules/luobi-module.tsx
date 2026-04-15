
import { useState, useRef, useEffect } from "react"
import {
  BookOpen,
  Users,
  Globe,
  Clock,
  Scroll,
  ChevronRight,
  ChevronLeft,
  Plus,
  Edit3,
  Sparkles,
  FileText,
  Save,
  AlertTriangle,
  Search,
  MoreVertical,
  Trash2,
  Pin,
  Copy,
  ExternalLink,
  Type,
  AlignLeft,
  Image,
  Minus,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Undo,
  Redo,
  Settings2,
  Keyboard,
  Target,
  Palette,
  Wand2,
  Brain,
  MessageSquare,
  Check,
  ChevronDown,
  Filter,
  SortAsc,
  Bookmark,
  Tag,
  Lightbulb,
  PenTool,
  Layers,
  History,
  LayoutTemplate,
  RefreshCw,
  Zap,
  Star,
  ArrowRight,
  CheckCircle2,
  Circle,
  AlertCircle,
  Info,
  X,
} from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { ScrollArea } from "../components/ui/scroll-area"
import { Input } from "../components/ui/input"
import { Textarea } from "../components/ui/textarea"
import { Progress } from "../components/ui/progress"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"
import { Slider } from "../components/ui/slider"

// 类型定义
interface BibleEntry {
  id: string
  category: "character" | "world" | "timeline" | "terms" | "foreshadow" | "style"
  title: string
  content: string
  priority: "high" | "medium" | "low"
  pinned?: boolean
  relatedChapters?: number[]
  tags?: string[]
  createdAt: Date
  updatedAt: Date
  status?: "active" | "retired" | "draft"
}

interface StyleCard {
  id: string
  name: string
  description: string
  isActive: boolean
  settings: {
    tone: string
    pov: string
    pace: string
    vocabulary: string
  }
}

interface WritingTemplate {
  id: string
  name: string
  category: "scene" | "dialogue" | "action" | "emotion" | "transition"
  content: string
  usage: number
}

interface ChapterOutline {
  id: string
  title: string
  summary: string
  goals: string[]
  status: "draft" | "writing" | "complete"
}

// 类别配置
const categoryConfig = {
  character: { icon: Users, label: "人物", color: "text-blue-400", bgColor: "bg-blue-500/10", description: "角色设定、性格、关系" },
  world: { icon: Globe, label: "世界观", color: "text-emerald-400", bgColor: "bg-emerald-500/10", description: "地点、势力、规则" },
  timeline: { icon: Clock, label: "时间线", color: "text-amber-400", bgColor: "bg-amber-500/10", description: "重要事件、时间节点" },
  terms: { icon: Scroll, label: "术语", color: "text-purple-400", bgColor: "bg-purple-500/10", description: "专有名词、设定词汇" },
  foreshadow: { icon: AlertTriangle, label: "伏笔", color: "text-rose-400", bgColor: "bg-rose-500/10", description: "埋线与回收状态" },
  style: { icon: Palette, label: "风格", color: "text-cyan-400", bgColor: "bg-cyan-500/10", description: "文风、调性、禁用词" },
}

// 模拟数据
const mockBibleEntries: BibleEntry[] = [
  {
    id: "1",
    category: "character",
    title: "萧然",
    content: `【基本信息】
姓名：萧然
年龄：22岁
身份：青云城城主之子

【外貌特征】
- 身材高挑，约一米八
- 右眉有一道浅疤（大火中所伤）
- 眼神深邃，平时内敛，激动时锐利如剑

【性格特点】
- 表面：沉稳内敛，寡言少语
- 内心：隐忍三年，复仇之火从未熄灭
- 底线：不伤无辜，但对仇人绝不手软

【武学修为】
- 剑道八品，内力深厚
- 独创剑招「寒渊三叠」
- 暗器手法一流

【重要关系】
- 父亲萧远山（已故）：崇敬、追忆
- 福伯：亦仆亦父
- 云溪：婚约对象，微妙的情感

【性格弧光规划】
1-10章：隐忍蛰伏，收集线索
11-20章：初露锋芒，开始复仇
21-30章：遭遇挫折，成���蜕变`,
    priority: "high",
    pinned: true,
    relatedChapters: [1, 3, 5, 8, 12, 15, 18, 22, 25],
    tags: ["主角", "复仇", "剑客"],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-04-01"),
    status: "active",
  },
  {
    id: "2",
    category: "character",
    title: "福伯",
    content: `【基本信息】
姓名：福伯（本名李福）
年龄：58岁
身份：萧家老仆

【真实身份】（读者后知）
- 曾是萧远山的贴身护卫
- 隐藏的六品高手
- 故意装作老迈木讷

【性格特点】
- 忠心耿耿，视萧然如己出
- 谨慎多疑，时刻警惕
- 关键时刻敢于出手

【重要秘密】
- 知道大火真相的一部分
- 保管着萧家密室的钥匙
- 与云霄阁有旧日渊源`,
    priority: "medium",
    relatedChapters: [1, 12, 18, 25],
    tags: ["忠仆", "高手", "秘密"],
    createdAt: new Date("2024-01-02"),
    updatedAt: new Date("2024-03-15"),
    status: "active",
  },
  {
    id: "3",
    category: "character",
    title: "云溪",
    content: `【基本信息】
姓名：云溪
年龄：19岁
身份：云霄阁大小姐

【外貌特征】
- 清丽脱俗，气质如仙
- 常着白衣，腰佩「霜华」剑
- 眉间有淡淡愁绪

【性格特点】
- 表面：爽朗大方，剑术超群
- 内心：背负家族秘密，左右为难
- 对萧然：欣赏、愧疚、纠结交织

【武学修为】
- 剑道七品
- 主修「云霄九剑」前六式
- 轻功出众

【重要秘密】
云霄阁与萧家大火有关联，她在第6章偶然看到了一封密函...`,
    priority: "high",
    pinned: true,
    relatedChapters: [6, 9, 15, 20, 28],
    tags: ["女主", "纠结", "剑客"],
    createdAt: new Date("2024-01-03"),
    updatedAt: new Date("2024-04-02"),
    status: "active",
  },
  {
    id: "4",
    category: "world",
    title: "青云城",
    content: `【地理位置】
东境三大城之一，位于青云山脚

【城市布局】
- 城北：城主府、官署
- 城南：平民区、集市
- 城东：商会总部
- 城西：江湖帮派聚集

【重要地点】
1. 城主府 - 萧然居所
2. 醉仙楼 - 情报交汇处
3. 后院枯井 - 暗藏玄机

【势力分布】
- 城主府（萧然）
- 商会（张家）
- 青龙帮（暗中势力）

【人口规模】
约三十万人`,
    priority: "high",
    relatedChapters: [1, 2, 3, 12],
    tags: ["主场景", "势力"],
    createdAt: new Date("2024-01-04"),
    updatedAt: new Date("2024-02-20"),
    status: "active",
  },
  {
    id: "5",
    category: "world",
    title: "云霄阁",
    content: `【基本信息】
天下第一剑派，位于昆仑山脉

【组织架构】
- 阁主：云无崖（当世剑道第一人）
- 长老院：七位长老
- 门下弟子约三千人

【核心剑法】
云霄九剑：
1-3式：入门
4-6式：精进
7-9式：绝顶（仅阁主与首席弟子习得）

【与本故事关系】
- 云溪是阁主独女
- 与萧家大火有隐秘关联
- 某位长老可能是幕后黑手`,
    priority: "medium",
    relatedChapters: [6, 15, 20, 30],
    tags: ["门派", "剑法"],
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-03-10"),
    status: "active",
  },
  {
    id: "6",
    category: "timeline",
    title: "大火之夜",
    content: `【时间】
三年前 · 正月十五

【地点】
萧府

【事件经过】
1. 子时：萧远山书房密会神秘人
2. 丑时初：大火突起
3. 丑时末：火势失控，府邸半毁
4. 寅时：萧远山夫妇遗体被发现

【官方结论】
意外失火

【疑点】
- 萧远山��功高强，为何未能逃脱
- 守卫张三当晚离奇消失
- 福伯发现不明脚印

【已知线索】
- 云纹玉佩应已毁于火中
- 第12章：玉佩重现
- 待回收：密函内容`,
    priority: "high",
    pinned: true,
    relatedChapters: [1, 8, 12, 25],
    tags: ["核心事件", "悬念"],
    createdAt: new Date("2024-01-06"),
    updatedAt: new Date("2024-04-03"),
    status: "active",
  },
  {
    id: "7",
    category: "terms",
    title: "云纹玉佩",
    content: `【物品名称】
云纹玉佩

【外观】
- 羊脂白玉，温润如水
- 刻有萧家独特云纹
- 烛光下泛幽幽寒光

【功能】
传说可开启萧家密库

【特殊设定】
- 分为阴阳两枚
- 需合二为一方可使用
- 阳佩：萧然手中
- 阴佩：下落不明（疑在云霄阁）

【剧情作用】
- 第12章：重现，打破萧然认知
- 第18章：发现阴阳之分
- 第25章：找到阴佩线索`,
    priority: "high",
    relatedChapters: [12, 18, 25],
    tags: ["道具", "线索"],
    createdAt: new Date("2024-01-07"),
    updatedAt: new Date("2024-04-01"),
    status: "active",
  },
  {
    id: "8",
    category: "foreshadow",
    title: "暗门线索",
    content: `【埋设位置】
第 8 章

【伏笔内容】
福伯提及老爷生前常去后院枯井处，每次都独自一人，不许任何人跟随。

【计划回收】
第 15 章

【回收方式】
萧然在枯井发现暗门，通向密室。

【回收状态】
⚪ 未回收

【关联设定】
- 萧家密库
- 云纹玉佩
- 萧远山的秘密`,
    priority: "medium",
    relatedChapters: [8, 15],
    tags: ["伏笔", "待回收"],
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2024-03-20"),
    status: "active",
  },
  {
    id: "9",
    category: "foreshadow",
    title: "云溪的秘密",
    content: `【埋设位置】
第 6 章

【伏笔内容】
云溪在与萧然相处时，偶尔闪过复杂神色，似有难言之隐。曾不经意提及「有些事，并非表面看到的那样」。

【计划回收】
第 20 章

【回收方式】
揭示她在云霄阁密室中看到的那封信——关于萧家大火的真相。

【回收状态】
⚪ 未回收

【关联人物】
- 云溪
- 云无崖（她的父亲）
- 某位云霄阁长老`,
    priority: "high",
    relatedChapters: [6, 20],
    tags: ["伏笔", "待回收", "重要"],
    createdAt: new Date("2024-02-10"),
    updatedAt: new Date("2024-04-02"),
    status: "active",
  },
  {
    id: "10",
    category: "style",
    title: "本书风格卡",
    content: `【文风定位】
古风武侠 · 悬疑复仇

【叙事视角】
第三人称限制视角（主跟萧然）

【语言特点】
- 用词典雅但不晦涩
- 对话简洁有力
- 内心戏克制，点到即止

【节奏要求】
- 每章必有小钩子
- 每三章一个中转折
- 每卷一个大高潮

【禁用套话】
- 「不知过了多久」
- 「他心中一动」
- 「一股不好的预感」
- 「你竟敢」「找死」等口水对话

【氛围关键词】
暗流涌动、步步为营、隐忍蓄势、锋芒毕露`,
    priority: "high",
    pinned: true,
    tags: ["风格", "调性"],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-04-01"),
    status: "active",
  },
]

const mockStyleCards: StyleCard[] = [
  {
    id: "1",
    name: "古风武侠",
    description: "典雅、克制、张力",
    isActive: true,
    settings: {
      tone: "沉稳内敛",
      pov: "第三人称限制",
      pace: "紧凑",
      vocabulary: "古风典雅",
    },
  },
  {
    id: "2",
    name: "快节奏动作",
    description: "短句、画面感、冲击力",
    isActive: false,
    settings: {
      tone: "紧张激烈",
      pov: "第三人称",
      pace: "急促",
      vocabulary: "动作描写",
    },
  },
]

const mockTemplates: WritingTemplate[] = [
  {
    id: "1",
    name: "紧张对峙开场",
    category: "scene",
    content: "【环境氛围】+【人物站位】+【沉默对视】+【打破僵局的一句话】",
    usage: 12,
  },
  {
    id: "2",
    name: "内心独白",
    category: "emotion",
    content: "【触发事件】→【第一反应】→【回忆闪现】→【当下决定】",
    usage: 8,
  },
  {
    id: "3",
    name: "战斗节奏",
    category: "action",
    content: "【试探】→【升级】→【转折】→【高潮】→【收尾】（穿插呼吸点）",
    usage: 15,
  },
]

const mockChapterOutline: ChapterOutline = {
  id: "12",
  title: "第十二章 暗流涌动",
  summary: "萧然收到密信预警，福伯发现父亲的玉佩，打破三年来的平静。",
  goals: [
    "揭示玉佩重现，制造悬念",
    "展示萧然的隐忍与果断",
    "福伯的反应暗示更多秘密",
    "结尾引出新的追查方向",
  ],
  status: "writing",
}

const defaultContent = `夜色如墨，笼罩着整座青云城。

城主府深处的书房内，烛火摇曳，将萧然的侧脸映得明暗交错。他指尖轻叩桌面，目光落在那封刚送达的密信上，眸中掠过一丝不易察觉的寒意。

"三日之内，必有变故。"

身后传来轻微的脚步声，是跟随他多年的老仆福伯。老人将一盏热茶置于案头，欲言又止。

"说。\"萧然并未回头。

"少主，老奴方才在后院发现了这个。\"福伯颤巍巍地递上一枚玉佩，其上的云纹在烛光下泛着幽幽寒光。

萧然猛然起身，一把抓过那枚玉佩。这分明是——三年前随父亲一同葬身火海的信物。

"在哪发现的？"

"后院枯井旁的老槐树下。老奴今晚去查看漏水的水缸，却见树根处似有异样......"

窗外，一道黑影倏忽闪过。萧然眼神一凛，右手已悄然握住腰间剑柄。`

export function LuoBiModule() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<"bible" | "style" | "outline">("bible")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [content, setContent] = useState(defaultContent)
  const [wordCount, setWordCount] = useState(0)
  const [isZenMode, setIsZenMode] = useState(false)
  const [showWordGoal, setShowWordGoal] = useState(true)
  const [dailyGoal] = useState(2000)
  const [selectedEntry, setSelectedEntry] = useState<BibleEntry | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [showOutlinePanel, setShowOutlinePanel] = useState(true)
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const count = content.replace(/\s/g, "").length
    setWordCount(count)
  }, [content])

  const filteredEntries = mockBibleEntries
    .filter((e) => {
      const matchesCategory = !activeCategory || e.category === activeCategory
      const matchesSearch =
        !searchQuery ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.content.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (a.priority === "high" && b.priority !== "high") return -1
      if (a.priority !== "high" && b.priority === "high") return 1
      return 0
    })

  const goalProgress = Math.min((wordCount / dailyGoal) * 100, 100)
  const entryCounts = Object.keys(categoryConfig).reduce((acc, key) => {
    acc[key] = mockBibleEntries.filter((e) => e.category === key).length
    return acc
  }, {} as Record<string, number>)

  const unresolvedForeshadows = mockBibleEntries.filter(
    (e) => e.category === "foreshadow" && e.content.includes("未回收")
  ).length

  return (
    <TooltipProvider>
      <div className={cn("flex h-[calc(100vh-3.5rem)]", isZenMode && "bg-background")}>
        {/* Main Editor */}
        <div className="flex flex-1 flex-col">
          {/* Editor Header */}
          {!isZenMode && (
            <div className="flex items-center justify-between border-b border-border/40 bg-card/30 px-4 py-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium text-foreground">风起苍穹</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">第三卷</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1 text-foreground">
                      第 12 章 · 暗流涌动
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>第 11 章 · 风雨欲来</DropdownMenuItem>
                    <DropdownMenuItem className="bg-primary/10">第 12 章 · 暗流涌动</DropdownMenuItem>
                    <DropdownMenuItem>第 13 章 · 夜探枯井</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Badge variant="outline" className="ml-2 h-5 gap-1 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  写作中
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Word Count & Goal */}
                {showWordGoal && (
                  <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-sm font-medium",
                        wordCount >= dailyGoal ? "text-[oklch(0.7_0.15_145)]" : "text-foreground"
                      )}>
                        {wordCount}
                      </span>
                      <span className="text-sm text-muted-foreground">/ {dailyGoal}</span>
                    </div>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all",
                          wordCount >= dailyGoal ? "bg-[oklch(0.7_0.15_145)]" : "bg-primary"
                        )}
                        style={{ width: `${goalProgress}%` }}
                      />
                    </div>
                    {wordCount >= dailyGoal && (
                      <CheckCircle2 className="h-4 w-4 text-[oklch(0.7_0.15_145)]" />
                    )}
                  </div>
                )}
                
                <div className="h-5 w-px bg-border/50" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Undo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>撤销 (Ctrl+Z)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Redo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>重做 (Ctrl+Y)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <History className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>版本历史</TooltipContent>
                </Tooltip>

                <div className="h-5 w-px bg-border/50" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setIsZenMode(true)}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>专注模式 (F11)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Keyboard className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>快捷键</TooltipContent>
                </Tooltip>

                <Button variant="outline" size="sm" className="gap-2">
                  <Save className="h-4 w-4" />
                  保存
                </Button>
                <Button size="sm" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  生辉
                </Button>
              </div>
            </div>
          )}

          {/* Formatting Toolbar */}
          {!isZenMode && (
            <div className="flex items-center justify-between border-b border-border/40 bg-card/20 px-4 py-1.5">
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Type className="h-3.5 w-3.5" />
                      正文
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem>正文</DropdownMenuItem>
                    <DropdownMenuItem>标题 1</DropdownMenuItem>
                    <DropdownMenuItem>标题 2</DropdownMenuItem>
                    <DropdownMenuItem>标�� 3</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>引用</DropdownMenuItem>
                    <DropdownMenuItem>代码块</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="mx-1 h-4 w-px bg-border/50" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>加粗 (Ctrl+B)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>斜体 (Ctrl+I)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Underline className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>下划线 (Ctrl+U)</TooltipContent>
                </Tooltip>

                <div className="mx-1 h-4 w-px bg-border/50" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>无序列表</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ListOrdered className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>有序列表</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Quote className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>引用</TooltipContent>
                </Tooltip>

                <div className="mx-1 h-4 w-px bg-border/50" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Link className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>链接</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Image className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>插图</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>分割线</TooltipContent>
                </Tooltip>
              </div>

              {/* AI Quick Actions */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Wand2 className="h-3.5 w-3.5" />
                      续写
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI 续写当前段落</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <RefreshCw className="h-3.5 w-3.5" />
                      重写
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI 重写选中内容</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Brain className="h-3.5 w-3.5" />
                      扩写
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI 扩展细节</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* Chapter Outline Banner (Collapsible) */}
          {!isZenMode && showOutlinePanel && (
            <div className="border-b border-border/40 bg-muted/20 px-4 py-3">
              <div className="mx-auto max-w-3xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">本章细纲</span>
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {mockChapterOutline.status === "writing" ? "写作中" : "草稿"}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{mockChapterOutline.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mockChapterOutline.goals.map((goal, index) => (
                        <div key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Circle className="h-3 w-3" />
                          {goal}
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setShowOutlinePanel(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Editor Content */}
          <div className="relative flex-1 overflow-auto">
            {isZenMode && (
              <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{wordCount} 字</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsZenMode(false)}
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className={cn(
              "mx-auto px-8 py-12",
              isZenMode ? "max-w-2xl" : "max-w-3xl"
            )}>
              {/* Chapter Title */}
              <input
                type="text"
                defaultValue="第十二章 暗流涌动"
                className={cn(
                  "w-full bg-transparent font-bold text-foreground outline-none placeholder:text-muted-foreground",
                  isZenMode ? "text-4xl" : "text-3xl"
                )}
                placeholder="章节标题"
              />

              {/* Editor */}
              <div className="mt-8 min-h-[60vh]">
                <textarea
                  ref={editorRef}
                  className={cn(
                    "w-full resize-none bg-transparent leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/50",
                    isZenMode ? "text-xl leading-loose" : "text-lg"
                  )}
                  placeholder="开始写作..."
                  rows={30}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Bottom Status Bar */}
          {!isZenMode && (
            <div className="flex items-center justify-between border-t border-border/40 bg-card/30 px-4 py-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>{wordCount} 字</span>
                <span>|</span>
                <span>第三卷 · 第 12 章</span>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.7_0.15_145)]" />
                  已自动保存
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowOutlinePanel(!showOutlinePanel)}
                  className="hover:text-foreground"
                >
                  {showOutlinePanel ? "隐藏细纲" : "显示细纲"}
                </button>
                <span>|</span>
                <span>UTF-8</span>
              </div>
            </div>
          )}
        </div>

        {/* Bible Sidebar Toggle */}
        {!isZenMode && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(
              "absolute top-1/2 z-10 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-border/40 bg-card/80 text-muted-foreground transition-all hover:bg-card hover:text-foreground",
              sidebarOpen ? "right-[400px]" : "right-0"
            )}
          >
            {sidebarOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}

        {/* Bible Sidebar */}
        {!isZenMode && sidebarOpen && (
          <div className="flex w-[400px] flex-col border-l border-border/40 bg-card/20">
            {/* Sidebar Header with Tabs */}
            <div className="border-b border-border/40 p-3">
              <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as typeof sidebarTab)}>
                <TabsList className="w-full">
                  <TabsTrigger value="bible" className="flex-1 gap-1.5 text-xs">
                    <BookOpen className="h-3.5 w-3.5" />
                    锦囊
                  </TabsTrigger>
                  <TabsTrigger value="style" className="flex-1 gap-1.5 text-xs">
                    <Palette className="h-3.5 w-3.5" />
                    风格
                  </TabsTrigger>
                  <TabsTrigger value="outline" className="flex-1 gap-1.5 text-xs">
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    模板
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Tab Content */}
            {sidebarTab === "bible" && (
              <>
                {/* Bible Header */}
                <div className="border-b border-border/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">本作设定</span>
                      <Badge variant="secondary" className="h-5 bg-muted/50 text-[10px]">
                        {mockBibleEntries.length} 条
                      </Badge>
                      {unresolvedForeshadows > 0 && (
                        <Badge variant="destructive" className="h-5 text-[10px]">
                          {unresolvedForeshadows} 伏笔待回收
                        </Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    AI 生成时自动注入 · 保持一致性
                  </p>

                  {/* Search */}
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="搜索设定..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-9 text-sm bg-muted/30 border-border/50"
                    />
                  </div>
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-1.5 border-b border-border/40 px-4 py-3">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      activeCategory === null
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    全部
                  </button>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setActiveCategory(key)}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        activeCategory === key
                          ? "bg-primary/20 text-primary"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <config.icon className="h-3 w-3" />
                      {config.label}
                      <span className="text-[10px] opacity-60">{entryCounts[key]}</span>
                    </button>
                  ))}
                </div>

                {/* Entries List */}
                <ScrollArea className="flex-1">
                  <div className="space-y-2 p-3">
                    {filteredEntries.map((entry) => (
                      <BibleEntryCard
                        key={entry.id}
                        entry={entry}
                        isSelected={selectedEntry?.id === entry.id}
                        onClick={() => {
                          setSelectedEntry(entry)
                          setIsDetailOpen(true)
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}

            {sidebarTab === "style" && (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">当前风格卡</h3>
                    {mockStyleCards.filter(c => c.isActive).map((card) => (
                      <div key={card.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Palette className="h-4 w-4 text-primary" />
                            <span className="font-medium text-foreground">{card.name}</span>
                          </div>
                          <Badge className="bg-primary/20 text-primary text-[10px]">已激活</Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded bg-muted/30 px-2 py-1">
                            <span className="text-muted-foreground">调性：</span>
                            <span className="text-foreground">{card.settings.tone}</span>
                          </div>
                          <div className="rounded bg-muted/30 px-2 py-1">
                            <span className="text-muted-foreground">视角：</span>
                            <span className="text-foreground">{card.settings.pov}</span>
                          </div>
                          <div className="rounded bg-muted/30 px-2 py-1">
                            <span className="text-muted-foreground">节奏：</span>
                            <span className="text-foreground">{card.settings.pace}</span>
                          </div>
                          <div className="rounded bg-muted/30 px-2 py-1">
                            <span className="text-muted-foreground">词汇：</span>
                            <span className="text-foreground">{card.settings.vocabulary}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">其他风格卡</h3>
                    <div className="space-y-2">
                      {mockStyleCards.filter(c => !c.isActive).map((card) => (
                        <div key={card.id} className="rounded-lg border border-border/40 bg-card/30 p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{card.name}</span>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              切换
                            </Button>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    新建风格卡
                  </Button>
                </div>
              </ScrollArea>
            )}

            {sidebarTab === "outline" && (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-3">写作模板</h3>
                    <div className="space-y-2">
                      {mockTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="group rounded-lg border border-border/40 bg-card/30 p-3 transition-colors hover:border-primary/30 hover:bg-card/50 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="h-5 text-[10px]">
                                {template.category === "scene" && "场景"}
                                {template.category === "dialogue" && "对话"}
                                {template.category === "action" && "动作"}
                                {template.category === "emotion" && "情感"}
                                {template.category === "transition" && "过渡"}
                              </Badge>
                              <span className="font-medium text-foreground text-sm">{template.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">使用 {template.usage} 次</span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground font-mono bg-muted/20 rounded px-2 py-1">
                            {template.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    新建模板
                  </Button>
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* Entry Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            {selectedEntry && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      categoryConfig[selectedEntry.category].bgColor
                    )}>
                      {(() => {
                        const Icon = categoryConfig[selectedEntry.category].icon
                        return <Icon className={cn("h-5 w-5", categoryConfig[selectedEntry.category].color)} />
                      })()}
                    </div>
                    <div>
                      <DialogTitle className="flex items-center gap-2">
                        {selectedEntry.title}
                        {selectedEntry.pinned && <Pin className="h-4 w-4 text-primary" />}
                      </DialogTitle>
                      <DialogDescription>
                        {categoryConfig[selectedEntry.category].label} · {categoryConfig[selectedEntry.category].description}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed bg-muted/20 rounded-lg p-4">
                    {selectedEntry.content}
                  </div>
                  {selectedEntry.tags && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEntry.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {selectedEntry.relatedChapters && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">关联章节</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedEntry.relatedChapters.map((chapter) => (
                          <Badge key={chapter} variant="outline" className="text-xs">
                            第 {chapter} 章
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit3 className="h-4 w-4" />
                    ���辑
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                  <Button size="sm" className="gap-1.5">
                    <ArrowRight className="h-4 w-4" />
                    插入编辑器
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}

// Bible Entry Card Component
function BibleEntryCard({
  entry,
  isSelected,
  onClick,
}: {
  entry: BibleEntry
  isSelected: boolean
  onClick: () => void
}) {
  const config = categoryConfig[entry.category]
  const Icon = config.icon

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-lg border p-3 transition-all",
        isSelected
          ? "border-primary/50 bg-primary/5"
          : "border-border/40 bg-card/30 hover:border-border/60 hover:bg-card/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {entry.pinned && <Pin className="h-3 w-3 text-primary" />}
            <span className="font-medium text-foreground text-sm truncate">{entry.title}</span>
            {entry.priority === "high" && (
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {entry.content.split('\n')[0]}
          </p>
          {entry.tags && entry.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {entry.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
              {entry.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{entry.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Edit3 className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Pin className="mr-2 h-4 w-4" />
              {entry.pinned ? "取消置顶" : "置顶"}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              复制
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {entry.category === "foreshadow" && entry.content.includes("未回收") && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-400">
          <AlertCircle className="h-3 w-3" />
          待回收
        </div>
      )}
    </div>
  )
}
