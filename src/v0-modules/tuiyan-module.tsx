
import { useState, useRef, useEffect } from "react"
import {
  GitBranch,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Search,
  Filter,
  BookOpen,
  Network,
  FileText,
  MessageSquare,
  History,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Send,
  Pencil,
  Trash2,
  Copy,
  Link2,
  ArrowRight,
  Zap,
  Brain,
  Target,
  Users,
  MapPin,
  Swords,
  Crown,
  Heart,
  Flame,
  Star,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  RefreshCw,
  Download,
  Upload,
  Settings,
  Layers,
  GitMerge,
  Milestone,
  Calendar,
  TrendingUp,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  GripVertical,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Pin,
  PinOff,
  CircleDot,
  Circle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Wand2,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
import { Textarea } from "../components/ui/textarea"
import { ScrollArea } from "../components/ui/scroll-area"
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs"

// ============ Types ============
interface OutlineNode {
  id: string
  title: string
  type: "volume" | "chapter" | "scene"
  status: "draft" | "refining" | "finalized" | "locked"
  summary?: string
  wordCountTarget?: number
  children?: OutlineNode[]
  collapsed?: boolean
  tags?: string[]
  conflictPoints?: string[]
  emotionalArc?: string
  linkedCharacters?: string[]
  linkedLocations?: string[]
}

interface WenCeEntry {
  id: string
  timestamp: Date
  type: "decision" | "revision" | "ai_suggestion" | "user_note" | "milestone"
  title: string
  content: string
  relatedOutlineId?: string
  isPinned?: boolean
  tags?: string[]
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  relatedOutlineId?: string
  suggestedChanges?: {
    type: "add" | "modify" | "delete"
    target: string
    content: string
  }[]
  isApplied?: boolean
}

interface LinkedBook {
  id: string
  title: string
  author: string
  extractedElements: {
    type: "character" | "worldview" | "plot" | "technique"
    content: string
  }[]
}

// ============ Mock Data ============
const mockOutline: OutlineNode[] = [
  {
    id: "v1",
    title: "第一卷：命运的起点",
    type: "volume",
    status: "finalized",
    summary: "少年林风意外获得上古传承，踏上修仙之路。在青云门中结识挚友，初尝江湖险恶。",
    wordCountTarget: 300000,
    tags: ["开篇", "废柴逆袭", "机缘"],
    emotionalArc: "低谷 → 希望 → 小高潮",
    children: [
      {
        id: "c1-1",
        title: "第一章：落魄少年",
        type: "chapter",
        status: "finalized",
        summary: "林风家道中落，被迫离开家乡。在山林中意外跌入古洞，发现神秘石碑。",
        wordCountTarget: 5000,
        tags: ["铺垫", "伏笔"],
        linkedCharacters: ["林风", "林母"],
        linkedLocations: ["青云镇", "落仙崖"],
        conflictPoints: ["生存压力", "身世之谜"],
        children: [
          {
            id: "s1-1-1",
            title: "场景1：被逐出家门",
            type: "scene",
            status: "finalized",
            summary: "继母设计陷害，林风被赶出林家大宅",
            emotionalArc: "愤怒 → 无奈",
          },
          {
            id: "s1-1-2",
            title: "场景2：荒野求生",
            type: "scene",
            status: "finalized",
            summary: "林风在山林中艰难求生，展现坚韧性格",
            emotionalArc: "绝望 → 坚持",
          },
          {
            id: "s1-1-3",
            title: "场景3：古洞奇遇",
            type: "scene",
            status: "finalized",
            summary: "意外发现上古修士洞府，获得传承",
            emotionalArc: "好奇 → 震撼 → 希望",
          },
        ],
      },
      {
        id: "c1-2",
        title: "第二章：踏入修途",
        type: "chapter",
        status: "refining",
        summary: "林风开始修炼，却发现自己根骨奇差。在绝望中发现传承的独特之处。",
        wordCountTarget: 6000,
        tags: ["转折", "热血"],
        linkedCharacters: ["林风"],
        conflictPoints: ["天赋不足", "修炼瓶颈"],
        children: [
          {
            id: "s1-2-1",
            title: "场景1：初次修炼",
            type: "scene",
            status: "refining",
            summary: "按照传承功法修炼，却毫无进展",
          },
          {
            id: "s1-2-2",
            title: "场景2：发现秘密",
            type: "scene",
            status: "draft",
            summary: "无意中激活石碑隐藏阵法，发现逆天机缘",
          },
        ],
      },
      {
        id: "c1-3",
        title: "第三章：青云门试",
        type: "chapter",
        status: "draft",
        summary: "青云门招收弟子，林风决定一试。在考核中展现惊人实力，却引来嫉妒。",
        wordCountTarget: 8000,
        tags: ["热血", "对抗"],
        linkedCharacters: ["林风", "苏瑶", "陈浩"],
        linkedLocations: ["青云门"],
        conflictPoints: ["资源争夺", "势力打压"],
      },
    ],
  },
  {
    id: "v2",
    title: "第二卷：风云际会",
    type: "volume",
    status: "draft",
    summary: "林风在青云门中崭露头角，卷入宗门与魔教的争斗。初遇宿命之敌。",
    wordCountTarget: 350000,
    tags: ["升级", "宗门", "对抗"],
    emotionalArc: "成长 → 挫折 → 突破",
    children: [
      {
        id: "c2-1",
        title: "第一章：内门风波",
        type: "chapter",
        status: "draft",
        summary: "晋升内门弟子后，林风遭到老牌弟子针对",
        wordCountTarget: 6000,
      },
    ],
  },
  {
    id: "v3",
    title: "第三卷：龙争虎斗",
    type: "volume",
    status: "draft",
    summary: "各大势力齐聚，天才对决。林风身世之谜逐渐揭开。",
    wordCountTarget: 400000,
    tags: ["高潮", "身世", "对决"],
  },
]

const mockWenCe: WenCeEntry[] = [
  {
    id: "wc1",
    timestamp: new Date("2024-03-15T10:30:00"),
    type: "milestone",
    title: "大纲V1定稿",
    content: "完成三卷整体框架，确定主角成长路线和核心冲突。第一卷聚焦废柴逆袭，第二卷宗门争斗，第三卷揭示身世。",
    isPinned: true,
    tags: ["里程碑", "大纲"],
  },
  {
    id: "wc2",
    timestamp: new Date("2024-03-16T14:20:00"),
    type: "decision",
    title: "调整第一卷节奏",
    content: "原计划第一卷10章，现调整为15章。前5章加强铺垫和人物塑造，中间5章集中矛盾冲突，后5章完成第一个小高潮。",
    relatedOutlineId: "v1",
    tags: ["节奏", "第一卷"],
  },
  {
    id: "wc3",
    timestamp: new Date("2024-03-17T09:15:00"),
    type: "revision",
    title: "女主登场时机修改",
    content: "原定第三章登场的女主苏瑶，改为第二章末尾伏笔，第三章正式登场。增加神秘感。",
    relatedOutlineId: "c1-3",
    tags: ["人物", "苏瑶"],
  },
  {
    id: "wc4",
    timestamp: new Date("2024-03-17T15:45:00"),
    type: "ai_suggestion",
    title: "AI建议：增加反派伏笔",
    content: "建议在第一卷第二章中埋设大反派的伏笔，通过古洞中的壁画或残留神识暗示。这样可以在后续揭示时形成呼应。",
    relatedOutlineId: "c1-2",
    tags: ["伏笔", "反派"],
  },
  {
    id: "wc5",
    timestamp: new Date("2024-03-18T11:00:00"),
    type: "user_note",
    title: "灵感记录：主角能力设定",
    content: "主角的传承不是直接给力量，而是「观想之法」——能看透事物本质。前期是看穿敌人破绽，后期是参悟天地法则。这符合「留白」的产品理念。",
    isPinned: true,
    tags: ["设定", "能力", "核心"],
  },
]

const mockChatHistory: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "我想让第一章的节奏更紧凑一些，开头太慢了。有什么建议？",
    timestamp: new Date("2024-03-18T14:00:00"),
    relatedOutlineId: "c1-1",
  },
  {
    id: "m2",
    role: "assistant",
    content: `分析了当前第一章的结构，有以下建议：

**问题诊断：**
当前开头用了约1500字描写林风的日常生活，这部分可以精简。

**优化方案：**
1. **开篇即冲突** - 直接从被逐出家门的场景开始，用倒叙或闪回补充背景
2. **压缩场景1** - 将"被逐\"场景控制在800字内，用对话和动作推进
3. **加快节奏** - 在第一个场景结束时就暗示古洞的存在（如传闻、地图碎片）

**预计效果：**
- 开篇500字内出现核心冲突
- 前2000字完成"被逐→求生→发现线索\"的完整节奏
- 读者留存率预计提升15-20%

需要我帮你生成修改后的场景1细纲吗？`,
    timestamp: new Date("2024-03-18T14:01:00"),
    relatedOutlineId: "c1-1",
    suggestedChanges: [
      {
        type: "modify",
        target: "s1-1-1",
        content: "直接以被逐场景开篇，通过对话闪回背景，控制在800字",
      },
      {
        type: "add",
        target: "c1-1",
        content: "在场景1结尾增加古洞线索伏笔",
      },
    ],
  },
  {
    id: "m3",
    role: "user",
    content: "好的，请帮我生成修改后的场景1细纲",
    timestamp: new Date("2024-03-18T14:05:00"),
    relatedOutlineId: "s1-1-1",
  },
  {
    id: "m4",
    role: "assistant",
    content: `好的，以下是优化后的**场景1细纲**：

---

**场景1：被逐出家门（修订版）**

**开篇钩子（100字）：**
> "滚！林家没有你这个废物！"
> 继母的尖叫声在大厅回荡，林风被两个家丁架着拖出门外。

**核心冲突（400字）：**
- 继母当众宣布林风偷窃库银（实为栽赃）
- 林风父亲病重，无力阻止
- 闪回：父亲曾暗示"若有难，去落仙崖"（伏笔）
- 林风不辩解，只说"我会回来的"

**转折点（200字）：**
- 被扔出家门时，老仆人塞给他一块残破的玉佩
- 玉佩背面刻着模糊的地图碎片
- 指向：落仙崖

**情绪节奏：**
愤怒(开篇) → 隐忍(中段) → 坚定(结尾)

**字数控制：** 约800字

---

是否采纳这个修改？我可以同步更新大纲。`,
    timestamp: new Date("2024-03-18T14:06:00"),
    relatedOutlineId: "s1-1-1",
    suggestedChanges: [
      {
        type: "modify",
        target: "s1-1-1",
        content: "采用新版场景1细纲，开篇即冲突，800字完成",
      },
    ],
    isApplied: true,
  },
]

const mockLinkedBooks: LinkedBook[] = [
  {
    id: "lb1",
    title: "凡人修仙传",
    author: "忘语",
    extractedElements: [
      { type: "technique", content: "「小人物视角」：主角初期弱小，通过智慧和谨慎成长" },
      { type: "worldview", content: "「修仙体系」：筑基→结丹→元婴→化神的完整修炼层级" },
      { type: "plot", content: "「机缘获取」：奇遇不是天降，而是主角主动探索的结果" },
    ],
  },
  {
    id: "lb2",
    title: "诡秘之主",
    author: "爱潜水的乌贼",
    extractedElements: [
      { type: "technique", content: "「序列体系」：独特的晋级系统，每个阶段有质变" },
      { type: "character", content: "「人设塑造」：主角有明确的行为准则和底线" },
      { type: "plot", content: "「信息差」：读者与主角的信息差制造悬念" },
    ],
  },
]

// ============ Subcomponents ============

// 大纲树节点
function OutlineTreeNode({
  node,
  depth = 0,
  selectedId,
  onSelect,
  onToggle,
}: {
  node: OutlineNode
  depth?: number
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedId === node.id

  const statusConfig = {
    draft: { icon: Circle, color: "text-muted-foreground", label: "草稿" },
    refining: { icon: CircleDot, color: "text-amber-400", label: "打磨中" },
    finalized: { icon: CheckCircle, color: "text-[oklch(0.7_0.15_145)]", label: "已定稿" },
    locked: { icon: Lock, color: "text-primary", label: "已锁定" },
  }

  const typeConfig = {
    volume: { icon: BookOpen, color: "text-primary" },
    chapter: { icon: FileText, color: "text-muted-foreground" },
    scene: { icon: Layers, color: "text-muted-foreground/70" },
  }

  const status = statusConfig[node.status]
  const type = typeConfig[node.type]
  const StatusIcon = status.icon
  const TypeIcon = type.icon

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors cursor-pointer",
          isSelected ? "bg-primary/10" : "hover:bg-muted/50",
          depth > 0 && "ml-4"
        )}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/Collapse */}
        {hasChildren ? (
          <button
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.id)
            }}
          >
            {node.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Type Icon */}
        <TypeIcon className={cn("h-4 w-4 shrink-0", type.color)} />

        {/* Title */}
        <span
          className={cn(
            "flex-1 truncate text-sm",
            isSelected ? "font-medium text-foreground" : "text-foreground/80"
          )}
        >
          {node.title}
        </span>

        {/* Status */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", status.color)} />
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs">{status.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Quick Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>
              <Pencil className="mr-2 h-4 w-4" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Plus className="mr-2 h-4 w-4" />
              添加子项
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CircleDot className="mr-2 h-4 w-4" />
                更改状态
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>
                  <Circle className="mr-2 h-4 w-4" />
                  草稿
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CircleDot className="mr-2 h-4 w-4" />
                  打磨中
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  已定稿
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Lock className="mr-2 h-4 w-4" />
                  锁定
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Sparkles className="mr-2 h-4 w-4" />
              AI 优化
            </DropdownMenuItem>
            <DropdownMenuItem>
              <GitMerge className="mr-2 h-4 w-4" />
              生成细纲
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {hasChildren && !node.collapsed && (
        <div className="border-l border-border/30 ml-[18px]">
          {node.children!.map((child) => (
            <OutlineTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 思维导图节点
function MindMapNode({
  node,
  isCenter = false,
  position,
}: {
  node: OutlineNode
  isCenter?: boolean
  position?: "left" | "right"
}) {
  const typeColors = {
    volume: "border-primary bg-primary/10 text-primary",
    chapter: "border-amber-500/50 bg-amber-500/10 text-amber-400",
    scene: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
  }

  if (isCenter) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary bg-primary/20">
          <div className="text-center">
            <p className="text-xs text-primary/70">作品</p>
            <p className="font-semibold text-primary">凌云志</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all hover:scale-105",
        typeColors[node.type]
      )}
    >
      <span className="text-sm font-medium">{node.title}</span>
      {node.status === "finalized" && (
        <CheckCircle className="h-3.5 w-3.5 text-[oklch(0.7_0.15_145)]" />
      )}
    </div>
  )
}

// 文策日志卡片
function WenCeCard({
  entry,
  onPin,
}: {
  entry: WenCeEntry
  onPin: (id: string) => void
}) {
  const typeConfig = {
    decision: {
      icon: Target,
      color: "text-primary",
      bg: "bg-primary/10",
      label: "决策",
    },
    revision: {
      icon: Pencil,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      label: "修订",
    },
    ai_suggestion: {
      icon: Sparkles,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      label: "AI建议",
    },
    user_note: {
      icon: Lightbulb,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      label: "灵感",
    },
    milestone: {
      icon: Milestone,
      color: "text-primary",
      bg: "bg-primary/10",
      label: "里程碑",
    },
  }

  const config = typeConfig[entry.type]
  const TypeIcon = config.icon

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/40 bg-card/30 p-4 transition-all hover:border-border/60",
        entry.isPinned && "ring-1 ring-primary/30"
      )}
    >
      {/* Pin Badge */}
      {entry.isPinned && (
        <div className="absolute -top-2 -right-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Pin className="h-3 w-3" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.bg)}>
          <TypeIcon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={cn("h-5 text-[10px]", config.bg, config.color)}>
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {entry.timestamp.toLocaleDateString("zh-CN")} {entry.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <h4 className="mt-1 font-medium text-foreground">{entry.title}</h4>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPin(entry.id)}>
              {entry.isPinned ? (
                <>
                  <PinOff className="mr-2 h-4 w-4" />
                  取消置顶
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-4 w-4" />
                  置顶
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="mr-2 h-4 w-4" />
              复制内容
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{entry.content}</p>

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// AI 对话消息
function ChatMessageBubble({
  message,
  onApplySuggestion,
}: {
  message: ChatMessage
  onApplySuggestion?: (changes: ChatMessage["suggestedChanges"]) => void
}) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary/20" : "bg-muted"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex-1 max-w-[85%]", isUser && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-md"
              : "bg-muted/50 text-foreground rounded-tl-md"
          )}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {/* Suggested Changes */}
        {message.suggestedChanges && message.suggestedChanges.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.suggestedChanges.map((change, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2"
              >
                <Wand2 className="h-4 w-4 text-primary" />
                <span className="flex-1 text-xs text-muted-foreground">
                  {change.type === "add" && "添加："}
                  {change.type === "modify" && "修改："}
                  {change.type === "delete" && "删除："}
                  {change.content}
                </span>
                {!message.isApplied && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-primary hover:text-primary"
                    onClick={() => onApplySuggestion?.(message.suggestedChanges)}
                  >
                    采纳
                  </Button>
                )}
                {message.isApplied && (
                  <Badge variant="secondary" className="h-5 text-[10px] bg-[oklch(0.7_0.15_145)]/10 text-[oklch(0.7_0.15_145)]">
                    已应用
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timestamp & Actions */}
        <div className={cn("mt-1 flex items-center gap-2", isUser ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && (
            <div className="flex items-center gap-1">
              <button className="rounded p-1 hover:bg-muted">
                <ThumbsUp className="h-3 w-3 text-muted-foreground" />
              </button>
              <button className="rounded p-1 hover:bg-muted">
                <ThumbsDown className="h-3 w-3 text-muted-foreground" />
              </button>
              <button className="rounded p-1 hover:bg-muted">
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Main Component ============
export function TuiYanModule() {
  const [outline, setOutline] = useState<OutlineNode[]>(mockOutline)
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>("c1-1")
  const [wenCe, setWenCe] = useState<WenCeEntry[]>(mockWenCe)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(mockChatHistory)
  const [chatInput, setChatInput] = useState("")
  const [activeTab, setActiveTab] = useState<"outline" | "mindmap" | "wence">("outline")
  const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference">("detail")
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [outlineViewMode, setOutlineViewMode] = useState<"tree" | "kanban">("tree")
  const [isGenerating, setIsGenerating] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // 查找选中的节点
  const findNode = (nodes: OutlineNode[], id: string): OutlineNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  const selectedNode = selectedOutlineId ? findNode(outline, selectedOutlineId) : null

  // 切换折叠
  const toggleCollapse = (id: string) => {
    const updateNodes = (nodes: OutlineNode[]): OutlineNode[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          return { ...node, collapsed: !node.collapsed }
        }
        if (node.children) {
          return { ...node, children: updateNodes(node.children) }
        }
        return node
      })
    }
    setOutline(updateNodes(outline))
  }

  // 置顶文策
  const handlePinWenCe = (id: string) => {
    setWenCe(
      wenCe.map((entry) =>
        entry.id === id ? { ...entry, isPinned: !entry.isPinned } : entry
      )
    )
  }

  // 发送消息
  const handleSendMessage = () => {
    if (!chatInput.trim()) return

    const newMessage: ChatMessage = {
      id: `m${Date.now()}`,
      role: "user",
      content: chatInput,
      timestamp: new Date(),
      relatedOutlineId: selectedOutlineId || undefined,
    }

    setChatHistory([...chatHistory, newMessage])
    setChatInput("")
    setIsGenerating(true)

    // 模拟 AI 响应
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: `收到你的问题。我来分析一下当前选中的「${selectedNode?.title || "大纲"}」...

根据你的描述，我有以下建议：

1. **结构优化** - 可以考虑将当前内容拆分为更小的单元
2. **节奏调整** - 建议在关键转折点增加悬念设计
3. **人物动机** - 确保每个角色的行为都有合理的动机支撑

需要我针对某个具体方面展开详细分析吗？`,
        timestamp: new Date(),
        relatedOutlineId: selectedOutlineId || undefined,
      }
      setChatHistory((prev) => [...prev, aiResponse])
      setIsGenerating(false)
    }, 1500)
  }

  // 统计数据
  const countNodes = (nodes: OutlineNode[], type?: OutlineNode["type"]): number => {
    let count = 0
    for (const node of nodes) {
      if (!type || node.type === type) count++
      if (node.children) count += countNodes(node.children, type)
    }
    return count
  }

  const countByStatus = (nodes: OutlineNode[], status: OutlineNode["status"]): number => {
    let count = 0
    for (const node of nodes) {
      if (node.status === status) count++
      if (node.children) count += countByStatus(node.children, status)
    }
    return count
  }

  const totalNodes = countNodes(outline)
  const finalizedNodes = countByStatus(outline, "finalized")
  const progressPercent = totalNodes > 0 ? (finalizedNodes / totalNodes) * 100 : 0

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      {/* Top Toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-border/40 px-4">
        <div className="flex items-center gap-3">
          {/* Left Panel Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowLeftPanel(!showLeftPanel)}
                >
                  {showLeftPanel ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showLeftPanel ? "收起大纲面板" : "展开大纲面板"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Work Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="font-medium">凌云志</span>
                <Badge variant="secondary" className="h-4 text-[10px]">
                  玄幻
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <BookOpen className="mr-2 h-4 w-4" />
                凌云志
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BookOpen className="mr-2 h-4 w-4" />
                星际迷航
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Plus className="mr-2 h-4 w-4" />
                新建推演项目
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-border/50" />

          {/* View Mode Tabs */}
          <div className="flex items-center rounded-lg bg-muted/30 p-0.5">
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                activeTab === "outline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab("outline")}
            >
              <List className="h-4 w-4" />
              大纲
            </button>
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                activeTab === "mindmap"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab("mindmap")}
            >
              <Network className="h-4 w-4" />
              导图
            </button>
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
                activeTab === "wence"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab("wence")}
            >
              <History className="h-4 w-4" />
              文策
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Progress */}
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">定稿进度</span>
            <Progress value={progressPercent} className="h-1.5 w-20" />
            <span className="text-xs font-medium text-foreground">{progressPercent.toFixed(0)}%</span>
          </div>

          <div className="h-5 w-px bg-border/50" />

          {/* Actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>导出大纲</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>推演设置</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button size="sm" className="h-8 gap-2">
            <Sparkles className="h-4 w-4" />
            AI 生成
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Outline Tree */}
        {showLeftPanel && (
          <div className="flex w-80 flex-col border-r border-border/40 bg-card/20">
            {/* Search */}
            <div className="border-b border-border/40 p-3">
              <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索大纲..."
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-1 border-b border-border/40 p-3">
              {[
                { label: "卷", value: countNodes(outline, "volume"), color: "text-primary" },
                { label: "章", value: countNodes(outline, "chapter"), color: "text-amber-400" },
                { label: "场景", value: countNodes(outline, "scene"), color: "text-muted-foreground" },
                { label: "已定", value: finalizedNodes, color: "text-[oklch(0.7_0.15_145)]" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className={cn("text-lg font-semibold", stat.color)}>{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Outline Tree */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {outline.map((node) => (
                  <OutlineTreeNode
                    key={node.id}
                    node={node}
                    selectedId={selectedOutlineId}
                    onSelect={setSelectedOutlineId}
                    onToggle={toggleCollapse}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Add Actions */}
            <div className="border-t border-border/40 p-3 space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                <Plus className="h-4 w-4" />
                新建卷
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
                <Wand2 className="h-4 w-4" />
                AI 生成大纲
              </Button>
            </div>
          </div>
        )}

        {/* Center Panel - Detail/Mindmap/WenCe */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "outline" && selectedNode && (
            <ScrollArea className="flex-1">
              <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Node Header */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        selectedNode.type === "volume" && "border-primary/50 text-primary",
                        selectedNode.type === "chapter" && "border-amber-500/50 text-amber-400",
                        selectedNode.type === "scene" && "border-muted-foreground/50 text-muted-foreground"
                      )}
                    >
                      {selectedNode.type === "volume" && "卷"}
                      {selectedNode.type === "chapter" && "章"}
                      {selectedNode.type === "scene" && "场景"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        selectedNode.status === "finalized" && "bg-[oklch(0.7_0.15_145)]/10 text-[oklch(0.7_0.15_145)]",
                        selectedNode.status === "refining" && "bg-amber-500/10 text-amber-400",
                        selectedNode.status === "draft" && "bg-muted/50 text-muted-foreground",
                        selectedNode.status === "locked" && "bg-primary/10 text-primary"
                      )}
                    >
                      {selectedNode.status === "finalized" && "已定稿"}
                      {selectedNode.status === "refining" && "打磨中"}
                      {selectedNode.status === "draft" && "草稿"}
                      {selectedNode.status === "locked" && "已锁定"}
                    </Badge>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-bold text-foreground">{selectedNode.title}</h1>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="mr-2 h-4 w-4" />
                          编辑标题
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Copy className="mr-2 h-4 w-4" />
                          复制
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <Lock className="mr-2 h-4 w-4" />
                          锁定
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      内容摘要
                    </h3>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedNode.summary || "暂无摘要，点击编辑添加内容描述..."}
                  </p>
                </div>

                {/* Tags */}
                {selectedNode.tags && selectedNode.tags.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedNode.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          #{tag}
                        </Badge>
                      ))}
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground">
                        <Plus className="h-3 w-3 mr-1" />
                        添加
                      </Button>
                    </div>
                  </div>
                )}

                {/* Emotional Arc */}
                {selectedNode.emotionalArc && (
                  <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-400" />
                      情绪曲线
                    </h3>
                    <div className="flex items-center gap-2">
                      {selectedNode.emotionalArc.split(" → ").map((emotion, idx, arr) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="rounded-full bg-pink-500/10 px-3 py-1 text-sm text-pink-400">
                            {emotion}
                          </span>
                          {idx < arr.length - 1 && (
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflict Points */}
                {selectedNode.conflictPoints && selectedNode.conflictPoints.length > 0 && (
                  <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Swords className="h-4 w-4 text-red-400" />
                      冲突点
                    </h3>
                    <div className="space-y-2">
                      {selectedNode.conflictPoints.map((conflict, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Flame className="h-4 w-4 text-red-400" />
                          <span className="text-sm text-muted-foreground">{conflict}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked Elements */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Characters */}
                  {selectedNode.linkedCharacters && selectedNode.linkedCharacters.length > 0 && (
                    <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        登场人物
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedNode.linkedCharacters.map((char) => (
                          <Badge key={char} variant="outline" className="gap-1.5">
                            <User className="h-3 w-3" />
                            {char}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Locations */}
                  {selectedNode.linkedLocations && selectedNode.linkedLocations.length > 0 && (
                    <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-400" />
                        涉及地点
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedNode.linkedLocations.map((loc) => (
                          <Badge key={loc} variant="outline" className="gap-1.5 border-emerald-500/30 text-emerald-400">
                            <MapPin className="h-3 w-3" />
                            {loc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Word Count Target */}
                {selectedNode.wordCountTarget && (
                  <div className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        目标字数
                      </h3>
                      <span className="text-2xl font-bold text-primary">
                        {(selectedNode.wordCountTarget / 10000).toFixed(1)}
                        <span className="text-sm font-normal text-muted-foreground ml-1">万字</span>
                      </span>
                    </div>
                    <Progress value={0} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      已完成 0 字 / 目标 {selectedNode.wordCountTarget.toLocaleString()} 字
                    </p>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    添加子项
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <GitMerge className="h-4 w-4" />
                    生成细纲
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI 优化
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    进入生辉
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}

          {activeTab === "mindmap" && (
            <div className="flex-1 overflow-auto p-6">
              <div className="flex min-h-full items-center justify-center">
                <div className="relative">
                  {/* Center Node */}
                  <MindMapNode node={outline[0]} isCenter />

                  {/* Volume Nodes */}
                  <div className="absolute -left-80 top-1/2 -translate-y-1/2 space-y-4">
                    {outline.slice(0, 2).map((vol) => (
                      <div key={vol.id} className="relative">
                        <div className="absolute right-full mr-4 top-1/2 h-px w-16 -translate-y-1/2 bg-primary/30" />
                        <MindMapNode node={vol} position="left" />
                      </div>
                    ))}
                  </div>

                  <div className="absolute -right-80 top-1/2 -translate-y-1/2 space-y-4">
                    {outline.slice(2).map((vol) => (
                      <div key={vol.id} className="relative">
                        <div className="absolute left-full ml-4 top-1/2 h-px w-16 -translate-y-1/2 bg-primary/30" />
                        <MindMapNode node={vol} position="right" />
                      </div>
                    ))}
                  </div>

                  {/* Connection Lines */}
                  <svg
                    className="absolute inset-0 -z-10 h-full w-full pointer-events-none"
                    style={{ left: "-50%", top: "-50%", width: "200%", height: "200%" }}
                  >
                    <defs>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgb(159 192 255 / 0.3)" />
                        <stop offset="100%" stopColor="rgb(159 192 255 / 0.1)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* Mindmap Toolbar */}
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-border/50 bg-card/90 p-2 shadow-lg backdrop-blur-sm">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Maximize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <div className="h-5 w-px bg-border" />
                <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs">
                  <Download className="h-4 w-4" />
                  导出图片
                </Button>
              </div>
            </div>
          )}

          {activeTab === "wence" && (
            <ScrollArea className="flex-1">
              <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">文策日志</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      记录创作决策、修订历史与AI建议，形成可追溯的写作脉络
                    </p>
                  </div>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    新建记录
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg bg-muted/30 p-0.5">
                    {["全部", "决策", "修订", "AI建议", "灵感", "里程碑"].map((filter) => (
                      <button
                        key={filter}
                        className={cn(
                          "rounded-md px-3 py-1 text-sm transition-colors",
                          filter === "全部"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pinned */}
                {wenCe.filter((e) => e.isPinned).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Pin className="h-4 w-4" />
                      置顶记录
                    </h3>
                    {wenCe
                      .filter((e) => e.isPinned)
                      .map((entry) => (
                        <WenCeCard key={entry.id} entry={entry} onPin={handlePinWenCe} />
                      ))}
                  </div>
                )}

                {/* Timeline */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <History className="h-4 w-4" />
                    时间线
                  </h3>
                  {wenCe
                    .filter((e) => !e.isPinned)
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .map((entry) => (
                      <WenCeCard key={entry.id} entry={entry} onPin={handlePinWenCe} />
                    ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right Panel - Chat/Reference */}
        {showRightPanel && (
          <div className="flex w-96 flex-col border-l border-border/40 bg-card/20">
            {/* Panel Tabs */}
            <div className="flex items-center border-b border-border/40">
              <button
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors relative",
                  rightPanelTab === "detail"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setRightPanelTab("detail")}
              >
                详情
                {rightPanelTab === "detail" && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
              <button
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors relative",
                  rightPanelTab === "chat"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setRightPanelTab("chat")}
              >
                AI 对话
                {rightPanelTab === "chat" && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
              <button
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors relative",
                  rightPanelTab === "reference"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setRightPanelTab("reference")}
              >
                参考
                {rightPanelTab === "reference" && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            </div>

            {/* Panel Content */}
            {rightPanelTab === "chat" && (
              <div className="flex flex-1 flex-col">
                {/* Chat Messages */}
                <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
                  <div className="space-y-4">
                    {chatHistory.map((message) => (
                      <ChatMessageBubble key={message.id} message={message} />
                    ))}
                    {isGenerating && (
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Bot className="h-4 w-4 text-muted-foreground animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted/50 px-4 py-2.5">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Quick Prompts */}
                <div className="border-t border-border/40 p-3">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      { icon: Zap, text: "优化节奏" },
                      { icon: Users, text: "完善人物" },
                      { icon: Swords, text: "强化冲突" },
                      { icon: Brain, text: "理清逻辑" },
                    ].map((prompt) => (
                      <Button
                        key={prompt.text}
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setChatInput(prompt.text)}
                      >
                        <prompt.icon className="h-3.5 w-3.5" />
                        {prompt.text}
                      </Button>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="描述你想修改的方向..."
                      className="min-h-[80px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        已选：{selectedNode?.title || "无"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || isGenerating}
                    >
                      <Send className="h-4 w-4" />
                      发送
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {rightPanelTab === "reference" && (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">关联藏经</h3>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
                      <Link2 className="h-3.5 w-3.5" />
                      关联书籍
                    </Button>
                  </div>

                  {mockLinkedBooks.map((book) => (
                    <div
                      key={book.id}
                      className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-foreground">{book.title}</h4>
                          <p className="text-xs text-muted-foreground">{book.author}</p>
                        </div>
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          已提炼
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        {book.extractedElements.map((el, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 rounded-lg bg-muted/30 p-2"
                          >
                            <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                              {el.type === "character" && "人物"}
                              {el.type === "worldview" && "世界观"}
                              {el.type === "plot" && "情节"}
                              {el.type === "technique" && "技法"}
                            </Badge>
                            <p className="text-xs text-muted-foreground">{el.content}</p>
                          </div>
                        ))}
                      </div>

                      <Button variant="ghost" size="sm" className="w-full gap-2 text-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                        应用到当前大纲
                      </Button>
                    </div>
                  ))}

                  <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
                    <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      从藏经中关联更多参考书籍
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2">
                      <Plus className="h-4 w-4" />
                      浏览藏经
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            )}

            {rightPanelTab === "detail" && selectedNode && (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Quick Edit */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground">快速编辑</h3>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">标题</label>
                      <Input defaultValue={selectedNode.title} className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">摘要</label>
                      <Textarea
                        defaultValue={selectedNode.summary}
                        className="min-h-[100px] resize-none"
                        placeholder="描述这一部分的核心内容..."
                      />
                    </div>
                  </div>

                  {/* Children Preview */}
                  {selectedNode.children && selectedNode.children.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground">
                        子项 ({selectedNode.children.length})
                      </h3>
                      <div className="space-y-2">
                        {selectedNode.children.map((child) => (
                          <button
                            key={child.id}
                            className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-card/30 p-3 text-left transition-colors hover:bg-card/50"
                            onClick={() => setSelectedOutlineId(child.id)}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 text-sm text-foreground truncate">
                              {child.title}
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">操作</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        AI 扩写
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <GitMerge className="h-4 w-4" />
                        生成细纲
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <CheckCircle className="h-4 w-4" />
                        标记定稿
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <ArrowRight className="h-4 w-4" />
                        进入生辉
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
