import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { PromptPicker, PROMPT_PICKER_TUIYAN_SLOTS } from "../components/PromptPicker"
import type { GlobalPromptTemplate } from "../db/types"
import { renderPromptTemplate } from "../util/render-prompt-template"
import { Link, useNavigate } from "react-router-dom"
import { isFirstAiGateCancelledError } from "../ai/client"
import { generateLogicThreeBranches, LogicBranchPredictError } from "../ai/logic-branch-predict"
import type { WritingWorkStyleSlice } from "../ai/assemble-context"
import { loadAiSettings, saveAiSettings } from "../ai/storage"
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map"
import {
  getWork,
  getWorkStyleCard,
  listChapters,
  listVolumes,
  listWorks,
  getTuiyanState,
  upsertTuiyanState,
  createVolume,
  updateVolume,
  updateChapter,
  deleteVolume,
  deleteChapter,
  reorderChapters,
  listReferenceLibrary,
  listReferenceExcerpts,
} from "../db/repo"
import type { Chapter, ReferenceLibraryEntry, Work } from "../db/types"
import { resolveDefaultChapterId } from "../util/resolve-default-chapter"
import { workTagsToProfileText } from "../util/work-tags"
import { writeAiPanelDraft } from "../util/ai-panel-draft"
import { writeWenceHandoff } from "../util/wence-handoff"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
} from "reactflow"
import { toPng } from "html-to-image"
import "reactflow/dist/style.css"

const EMPTY_NODE_TYPES: NodeTypes = {}
const EMPTY_EDGE_TYPES: EdgeTypes = {}
import {
  buildV0TuiyanOutline,
  firstChapterIdInTree,
  type V0OutlineNode,
} from "../util/v0-tuiyan-outline"
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  MoreHorizontal,
  Search,
  BookOpen,
  Network,
  FileText,
  History,
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
  Heart,
  Flame,
  Lock,
  RefreshCw,
  Download,
  Settings,
  Layers,
  GitMerge,
  Milestone,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  Pin,
  PinOff,
  CircleDot,
  Circle,
  CheckCircle,
  Lightbulb,
  Wand2,
  List,
  Maximize2,
  X,
} from "lucide-react"
import { cn } from "../lib/utils"
import { AIModelSelector, AI_MODELS } from "../components/ai-model-selector"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
import { Textarea } from "../components/ui/textarea"
import { ScrollArea } from "../components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog"
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
// ============ Types ============
type OutlineNode = V0OutlineNode

const LS_LAST_WORK = "liubai:lastWorkId"
const LS_TUIYAN_DEMO_DEFAULT_SEEN = "liubai:tuiyanDemoDefaultSeen:v1"
const LS_TUIYAN_DEMO_DISABLE_DEFAULT = "liubai:tuiyanDemoDisableDefault:v1"

function formatBranchesForChat(branches: { title: string; summary: string }[]): string {
  return branches
    .map((b, i) => `**分支${i + 1}：${b.title}**\n\n${b.summary}`)
    .join("\n\n---\n\n")
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

// Legacy v0 demo type (kept for mock data compatibility; real data uses ReferenceLibraryEntry)
interface LinkedBook {
  id: string
  title: string
  author: string
  extractedElements: {
    type: "character" | "worldview" | "plot" | "technique"
    content: string
  }[]
}

function findNodeById(nodes: OutlineNode[], id: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function findFirstChapterDeep(node: OutlineNode): OutlineNode | null {
  if (node.type === "chapter") return node
  if (node.children) {
    for (const c of node.children) {
      const x = findFirstChapterDeep(c)
      if (x) return x
    }
  }
  return null
}

function resolveChapterForAi(
  selectedId: string | null,
  outline: OutlineNode[],
  chapters: Chapter[],
): Chapter | null {
  if (!selectedId || !chapters.length) return null
  const node = findNodeById(outline, selectedId)
  if (!node) return null
  const chapterNode =
    node.type === "chapter" ? node : findFirstChapterDeep(node)
  if (!chapterNode) return null
  return chapters.find((c) => c.id === chapterNode.id) ?? null
}

// ============ 内置示例数据（默认帮助用户理解界面；可清除后通过菜单恢复） ============
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

// Legacy v0 demo data (no longer used in real UI)
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

function cloneMockOutline(): OutlineNode[] {
  return JSON.parse(JSON.stringify(mockOutline)) as OutlineNode[]
}

function cloneMockChatHistory(): ChatMessage[] {
  return mockChatHistory.map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
    suggestedChanges: m.suggestedChanges?.map((s) => ({ ...s })),
  }))
}

function cloneMockWenCe(): WenCeEntry[] {
  return mockWenCe.map((e) => ({
    ...e,
    timestamp: new Date(e.timestamp),
  }))
}

// ============ Subcomponents ============

// 大纲树节点
function OutlineTreeNode({
  node,
  depth = 0,
  selectedId,
  onSelect,
  onToggle,
  isFinalizedId,
  onToggleFinalized,
  onChangeStatus,
  onDelete,
  getStatusOverride,
  onMove,
}: {
  node: OutlineNode
  depth?: number
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  isFinalizedId?: (id: string) => boolean
  onToggleFinalized?: (id: string) => void
  onChangeStatus?: (id: string, status: OutlineNode["status"]) => void
  onDelete?: (id: string) => void
  getStatusOverride?: (id: string) => OutlineNode["status"] | null
  onMove?: (id: string, dir: "up" | "down") => void
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

  const effectiveStatus = isFinalizedId?.(node.id)
    ? "finalized"
    : getStatusOverride?.(node.id) ?? node.status
  const status = statusConfig[effectiveStatus]
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
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onMove?.(node.id, "up")
              }}
            >
              <ChevronUp className="mr-2 h-4 w-4" />
              上移
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onMove?.(node.id, "down")
              }}
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              下移
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CircleDot className="mr-2 h-4 w-4" />
                更改状态
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeStatus?.(node.id, "draft")
                  }}
                >
                  <Circle className="mr-2 h-4 w-4" />
                  草稿
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeStatus?.(node.id, "refining")
                  }}
                >
                  <CircleDot className="mr-2 h-4 w-4" />
                  打磨中
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onToggleFinalized?.(node.id)
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  已定稿
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    onChangeStatus?.(node.id, "locked")
                  }}
                >
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
            <DropdownMenuItem
              className="text-destructive"
              onSelect={(e) => {
                e.preventDefault()
                onDelete?.(node.id)
              }}
            >
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
              isFinalizedId={isFinalizedId}
              onToggleFinalized={onToggleFinalized}
              onChangeStatus={onChangeStatus}
              onDelete={onDelete}
              getStatusOverride={getStatusOverride}
              onMove={onMove}
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
  position: _position,
  centerTitle = "—",
}: {
  node?: OutlineNode
  isCenter?: boolean
  position?: "left" | "right"
  centerTitle?: string
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
            <p className="font-semibold text-primary">{centerTitle}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!node) return null

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

// AI 对话消息（inline=true 时只渲染内容+操作，外层气泡由调用方控制）
function ChatMessageBubble({
  message,
  onApplySuggestion,
  onWriteToDraft,
  onGoWence,
  inline = false,
}: {
  message: ChatMessage
  onApplySuggestion?: (changes: ChatMessage["suggestedChanges"]) => void
  onWriteToDraft?: (content: string) => void
  onGoWence?: (content: string) => void
  inline?: boolean
}) {
  const isAssistant = message.role === "assistant"
  const isBranchLike = isAssistant && /分支\d+：/.test(message.content)

  const actionBar = (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      {isBranchLike && (
        <>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            onClick={() => onWriteToDraft?.(message.content)}
            type="button"
          >
            写入侧栏草稿
          </button>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            onClick={() => onGoWence?.(message.content)}
            type="button"
          >
            去问策跟进
          </button>
        </>
      )}
      {isAssistant && (
        <div className="flex items-center gap-0.5 ml-auto">
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="有帮助">
            <ThumbsUp className="h-3 w-3 text-muted-foreground" />
          </button>
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="无帮助">
            <ThumbsDown className="h-3 w-3 text-muted-foreground" />
          </button>
          <button className="rounded p-1 hover:bg-muted/80 transition-colors" title="复制">
            <Copy className="h-3 w-3 text-muted-foreground" onClick={() => void navigator.clipboard.writeText(message.content)} />
          </button>
        </div>
      )}
    </div>
  )

  // inline 模式：只渲染文字内容 + 操作栏，外层气泡由调用方绘制
  if (inline) {
    return (
      <div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
        {message.suggestedChanges && message.suggestedChanges.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.suggestedChanges.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-1.5">
                <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1 text-xs text-muted-foreground">
                  {change.type === "add" && "添加："}
                  {change.type === "modify" && "修改："}
                  {change.type === "delete" && "删除："}
                  {change.content}
                </span>
                {!message.isApplied && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-primary hover:text-primary px-2"
                    onClick={() => onApplySuggestion?.(message.suggestedChanges)}>
                    采纳
                  </Button>
                )}
                {message.isApplied && (
                  <Badge variant="secondary" className="h-5 text-[10px]">已应用</Badge>
                )}
              </div>
            ))}
          </div>
        )}
        {actionBar}
      </div>
    )
  }

  // 完整气泡模式（保留向后兼容）
  const isUser = message.role === "user"
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-primary/20" : "bg-muted"
      )}>
        {isUser ? <User className="h-4 w-4 text-primary" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className={cn("flex-1 max-w-[85%]", isUser && "text-right")}>
        <div className={cn(
          "inline-block rounded-2xl px-4 py-2.5 text-sm",
          isUser ? "bg-primary text-primary-foreground rounded-tr-md" : "bg-muted/50 text-foreground rounded-tl-md"
        )}>
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
        {message.suggestedChanges && message.suggestedChanges.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.suggestedChanges.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <span className="flex-1 text-xs text-muted-foreground">
                  {change.type === "add" && "添加："}
                  {change.type === "modify" && "修改："}
                  {change.type === "delete" && "删除："}
                  {change.content}
                </span>
                {!message.isApplied && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-primary hover:text-primary"
                    onClick={() => onApplySuggestion?.(message.suggestedChanges)}>
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
        <div className={cn("mt-1 flex items-center gap-2", isUser ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {actionBar}
        </div>
      </div>
    </div>
  )
}

// ============ Main Component ============
export default function V0TuiyanPage() {
  const navigate = useNavigate()
  const [works, setWorks] = useState<Work[]>([])
  const [workId, setWorkId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [workTitle, setWorkTitle] = useState("")
  const [pageLoading, setPageLoading] = useState(true)

  const [useSamplePreview, setUseSamplePreview] = useState(false)

  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null)
  const [wenCe, setWenCe] = useState<WenCeEntry[]>([])
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [finalizedNodeIds, setFinalizedNodeIds] = useState<string[]>([])
  const [statusByNodeId, setStatusByNodeId] = useState<Record<string, "draft" | "refining" | "locked">>({})
  const [linkedRefWorkIds, setLinkedRefWorkIds] = useState<string[]>([])
  const [refLibrary, setRefLibrary] = useState<ReferenceLibraryEntry[]>([])
  const [linkRefOpen, setLinkRefOpen] = useState(false)
  const [linkRefQ, setLinkRefQ] = useState("")
  const [mmNodes, setMmNodes] = useState<Node[]>([])
  const [mmEdges, setMmEdges] = useState<Edge[]>([])
  const [mmViewport, setMmViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const mmWrapRef = useRef<HTMLDivElement | null>(null)
  const [scenes, setScenes] = useState<
    Array<{ id: string; title: string; summary?: string; linkedChapterIds: string[]; createdAt: number; updatedAt: number }>
  >([])
  const [sceneLinkOpen, setSceneLinkOpen] = useState(false)
  const [sceneQ, setSceneQ] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [activeTab, setActiveTab] = useState<"outline" | "mindmap" | "wence">("outline")
  const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference">("detail")
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [outlineSearch, setOutlineSearch] = useState("")
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Sprint 3：选中的提示词模板（运行时对象，随 picker 更新）+ 步骤条折叠
  const [selectedPromptTemplate, _setSelectedPromptTemplate] = useState<GlobalPromptTemplate | null>(null)
  const selectedPromptTemplateRef = useRef<GlobalPromptTemplate | null>(null)
  const setSelectedPromptTemplate = useCallback((t: GlobalPromptTemplate | null) => {
    selectedPromptTemplateRef.current = t
    _setSelectedPromptTemplate(t)
  }, [])
  const [showFlowBar, setShowFlowBar] = useState(true)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const branchAbortRef = useRef<AbortController | null>(null)
  const tuiyanHydratedRef = useRef(false)
  const tuiyanSaveTimerRef = useRef<number | null>(null)

  const [showModelSelector, setShowModelSelector] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState(() =>
    aiProviderToModelId(loadAiSettings().provider),
  )

  // ReactFlow compares nodeTypes/edgeTypes by reference; keep them stable across renders (dev StrictMode/HMR).
  const rfNodeTypes = useMemo(() => EMPTY_NODE_TYPES, [])
  const rfEdgeTypes = useMemo(() => EMPTY_EDGE_TYPES, [])

  const selectedAiModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0],
    [selectedModelId],
  )

  const handleSelectAiModel = useCallback((modelId: string) => {
    const provider = aiModelIdToProvider(modelId)
    const s = loadAiSettings()
    saveAiSettings({ ...s, provider })
    setSelectedModelId(modelId)
  }, [])

  useEffect(() => {
    const onFocus = () =>
      setSelectedModelId(aiProviderToModelId(loadAiSettings().provider))
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  const primaryTag =
    useSamplePreview && !workId
      ? "示例"
      : works.find((w) => w.id === workId)?.tags?.filter(Boolean)[0] ?? "作品"

  const toolbarWorkTitle =
    useSamplePreview && !workId
      ? "示例·推演演示"
      : workTitle || (works.length ? "—" : "暂无作品")

  const applySamplePreview = useCallback(() => {
    setUseSamplePreview(true)
    setOutline(cloneMockOutline())
    setChatHistory(cloneMockChatHistory())
    setWenCe(cloneMockWenCe())
    setSelectedOutlineId("c1-1")
    setChapters([])
    setWorkTitle("")
    setWorkId(null)
  }, [])

  const clearSamplePreview = useCallback(() => {
    setUseSamplePreview(false)
    setOutline([])
    setChatHistory([])
    setWenCe([])
    setFinalizedNodeIds([])
    setStatusByNodeId({})
    setLinkedRefWorkIds([])
    setSelectedOutlineId(null)
    setChapters([])
    tuiyanHydratedRef.current = false
  }, [])

  const reloadOutlineForWork = useCallback(async (wid: string) => {
    setUseSamplePreview(false)
    tuiyanHydratedRef.current = false
    const [vols, chs, w, st, refs] = await Promise.all([
      listVolumes(wid),
      listChapters(wid),
      getWork(wid),
      getTuiyanState(wid),
      listReferenceLibrary(),
    ])
    setRefLibrary(refs)
    setChapters(chs)
    setWenCe(
      (st?.wenCe ?? []).map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })) as unknown as WenCeEntry[],
    )
    setWorkTitle(w?.title ?? "")
    const tree = buildV0TuiyanOutline(vols, chs)
    const stScenes = (st?.scenes ?? []) as typeof scenes
    setScenes(stScenes)
    const sceneNodes: OutlineNode[] = stScenes.map((s) => ({
      id: s.id,
      title: s.title,
      type: "scene",
      status: "draft",
      summary: s.summary ?? "",
      children: undefined,
      collapsed: false,
    }))
    const withScenes = [...sceneNodes, ...tree]
    setOutline(withScenes)
    setFinalizedNodeIds(st?.finalizedNodeIds ?? [])
    setStatusByNodeId((st?.statusByNodeId ?? {}) as Record<string, "draft" | "refining" | "locked">)
    setLinkedRefWorkIds(st?.linkedRefWorkIds ?? [])
    if (st?.mindmap && Array.isArray(st.mindmap.nodes) && Array.isArray(st.mindmap.edges)) {
      setMmNodes(st.mindmap.nodes as Node[])
      setMmEdges(st.mindmap.edges as Edge[])
      if (st.mindmap.viewport) setMmViewport(st.mindmap.viewport as Viewport)
    } else {
      // Build a simple default mindmap from current outline volumes.
      const vols = tree.filter((n) => n.type === "volume")
      const baseNodes: Node[] = [
        {
          id: "work",
          type: "default",
          position: { x: 0, y: 0 },
          data: { label: toolbarWorkTitle },
        },
      ]
      const baseEdges: Edge[] = []
      const gapY = 120
      const gapX = 260
      for (let i = 0; i < vols.length; i++) {
        const v = vols[i]!
        const side = i % 2 === 0 ? -1 : 1
        const row = Math.floor(i / 2)
        baseNodes.push({
          id: v.id,
          position: { x: side * gapX, y: (row - Math.max(0, Math.floor(vols.length / 4))) * gapY },
          data: { label: v.title },
        })
        baseEdges.push({ id: `e-work-${v.id}`, source: "work", target: v.id })
      }
      setMmNodes(baseNodes)
      setMmEdges(baseEdges)
      setMmViewport({ x: 0, y: 0, zoom: 1 })
    }
    setChatHistory(
      (st?.chatHistory ?? []).map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })) as unknown as ChatMessage[],
    )
    setSelectedOutlineId((prev) => {
      if (prev && findNodeById(withScenes, prev)) return prev
      if (chs.length && w) {
        const def = resolveDefaultChapterId(wid, chs, w)
        if (def && findNodeById(withScenes, def)) return def
      }
      return firstChapterIdInTree(withScenes)
    })
    // Sprint 3：恢复上次选中的提示词 id；实体在 PromptPicker 打开时懒加载
    // 切换作品时清空（实体将在用户下次打开 picker 时重新选择）
    selectedPromptTemplateRef.current = null
    _setSelectedPromptTemplate(null)
    tuiyanHydratedRef.current = true
  }, [])

  const isFinalized = useCallback(
    (nodeId: string) => finalizedNodeIds.includes(nodeId),
    [finalizedNodeIds],
  )

  const toggleFinalized = useCallback((nodeId: string) => {
    setFinalizedNodeIds((prev) => {
      if (prev.includes(nodeId)) return prev.filter((x) => x !== nodeId)
      return [...prev, nodeId]
    })
  }, [])

  const getStatusOverride = useCallback(
    (nodeId: string) => (statusByNodeId[nodeId] as OutlineNode["status"] | undefined) ?? null,
    [statusByNodeId],
  )

  useEffect(() => {
    if (!workId || useSamplePreview) return
    if (!tuiyanHydratedRef.current) return
    // Debounced save: avoid spamming writes while typing/chatting.
    if (tuiyanSaveTimerRef.current) window.clearTimeout(tuiyanSaveTimerRef.current)
    tuiyanSaveTimerRef.current = window.setTimeout(() => {
      void upsertTuiyanState(workId, {
        chatHistory: chatHistory.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.getTime() : Date.now(),
          relatedOutlineId: m.relatedOutlineId,
        })),
        wenCe: wenCe.map((e) => ({
          id: e.id,
          timestamp: e.timestamp instanceof Date ? e.timestamp.getTime() : Date.now(),
          type: e.type,
          title: e.title,
          content: e.content,
          relatedOutlineId: e.relatedOutlineId,
          isPinned: e.isPinned,
          tags: e.tags,
        })),
        finalizedNodeIds,
        statusByNodeId,
        linkedRefWorkIds,
        mindmap: { nodes: mmNodes as unknown[], edges: mmEdges as unknown[], viewport: mmViewport },
        scenes,
        selectedPromptTemplateId: selectedPromptTemplateRef.current?.id ?? null,
      })
    }, 550)
  }, [workId, useSamplePreview, chatHistory, wenCe, finalizedNodeIds, statusByNodeId, linkedRefWorkIds, mmNodes, mmEdges, mmViewport, scenes, selectedPromptTemplate])

  useEffect(() => {
    void (async () => {
      try {
        const list = await listWorks()
        setWorks(list)
        const disableDefault = localStorage.getItem(LS_TUIYAN_DEMO_DISABLE_DEFAULT) === "1"
        const seen = localStorage.getItem(LS_TUIYAN_DEMO_DEFAULT_SEEN) === "1"
        // 新手默认示例：首次进入优先展示示例，用户再切换到自己的作品
        if (!disableDefault && !seen) {
          localStorage.setItem(LS_TUIYAN_DEMO_DEFAULT_SEEN, "1")
          applySamplePreview()
        } else if (list.length > 0) {
          const lastId = localStorage.getItem(LS_LAST_WORK)
          const pick = list.find((x) => x.id === lastId) ?? list[0]
          setWorkId(pick.id)
        } else {
          applySamplePreview()
        }
      } finally {
        setPageLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!workId) {
      if (useSamplePreview) return
      setOutline([])
      setChapters([])
      setWorkTitle("")
      setSelectedOutlineId(null)
      setChatHistory([])
      setWenCe([])
      return
    }
    void reloadOutlineForWork(workId)
  }, [workId, useSamplePreview, reloadOutlineForWork])

  useEffect(() => () => branchAbortRef.current?.abort(), [])
  useEffect(
    () => () => {
      if (tuiyanSaveTimerRef.current) window.clearTimeout(tuiyanSaveTimerRef.current)
    },
    [],
  )

  const appendAssistant = useCallback(
    (content: string) => {
      setChatHistory((prev) => [
        ...prev,
        {
          id: `m${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: "assistant" as const,
          content,
          timestamp: new Date(),
          relatedOutlineId: selectedOutlineId ?? undefined,
        },
      ])
    },
    [selectedOutlineId],
  )

  const runBranchPredict = useCallback(
    async (userHint: string) => {
      if (!workId) {
        appendAssistant(
          useSamplePreview
            ? "当前为内置示例大纲，不含真实章节正文。请在顶部选择您的作品后再进行 AI 推演。"
            : "请先在作品库创建并选择一部作品。",
        )
        return
      }
      const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
      if (!ch) {
        appendAssistant("请先在左侧大纲中选择一章，或选中卷（将使用卷内第一章）。")
        return
      }
      branchAbortRef.current?.abort()
      const ac = new AbortController()
      branchAbortRef.current = ac
      setIsGenerating(true)
      try {
        const [card, w] = await Promise.all([getWorkStyleCard(workId), getWork(workId)])
        const tagProfile = workTagsToProfileText(w?.tags)
        const workStyle: WritingWorkStyleSlice = {
          pov: card?.pov ?? "",
          tone: card?.tone ?? "",
          bannedPhrases: card?.bannedPhrases ?? "",
          styleAnchor: card?.styleAnchor ?? "",
          extraRules: card?.extraRules ?? "",
        }
        // Sprint 3+5：如果选了提示词模板，渲染变量后前置到 userHint
        const tpl = selectedPromptTemplateRef.current
        const effectiveHint = tpl
          ? `【提示词模板：${tpl.title}】\n${renderPromptTemplate(tpl.body, {
              work_title:           (w?.title ?? workTitle).trim() || "未命名",
              work_tags:            (w?.tags ?? []).join("，"),
              chapter_title:        ch.title,
              chapter_summary:      ch.summary ?? "",
              chapter_content:      ch.content ?? "",
            }).trim()}\n\n${userHint.trim()}`.trim()
          : userHint.trim()
        const { branches } = await generateLogicThreeBranches({
          workTitle: (w?.title ?? workTitle).trim() || "未命名",
          chapterTitle: ch.title,
          chapterSummary: ch.summary ?? "",
          chapterContent: ch.content ?? "",
          userHint: effectiveHint,
          workStyle,
          tagProfileText: tagProfile,
          settings: loadAiSettings(),
          signal: ac.signal,
        })
        appendAssistant(formatBranchesForChat(branches))
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return
        if (e instanceof DOMException && e.name === "AbortError") return
        if (e instanceof Error && e.name === "AbortError") return
        const msg =
          e instanceof LogicBranchPredictError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e)
        appendAssistant(msg)
      } finally {
        setIsGenerating(false)
        branchAbortRef.current = null
      }
    },
    [
      workId,
      outline,
      chapters,
      selectedOutlineId,
      workTitle,
      appendAssistant,
      useSamplePreview,
    ],
  )

  const resolveChapterForJump = useCallback((): Chapter | null => {
    if (!workId) return null
    const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
    return ch
  }, [workId, selectedOutlineId, outline, chapters])

  const writeToAiPanelDraftAndOpenEditor = useCallback(
    (draft: string) => {
      if (!workId) return
      const ch = resolveChapterForJump()
      if (!ch) return
      const r = writeAiPanelDraft(workId, ch.id, draft)
      if (!r.ok) {
        appendAssistant(r.error)
        return
      }
      navigate(`/work/${workId}?chapter=${encodeURIComponent(ch.id)}`)
    },
    [workId, navigate, resolveChapterForJump, appendAssistant],
  )

  const goWenceWithPrefill = useCallback(
    (content: string) => {
      const ch = resolveChapterForJump()
      const refs = [
        workId ? `作品：${toolbarWorkTitle}` : "",
        ch ? `章节：${ch.title}` : "",
        ch?.summary ? `章节概要：${ch.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim()

      const prompt = [
        "我想基于下面的推演结果继续问策，请给我：",
        "1）下一步最关键的修改点（按优先级）",
        "2）如何把它落实到当前章节（给出可直接写进大纲/正文的措辞）",
        "",
        "【推演结果】",
        content.trim(),
      ].join("\n")

      writeWenceHandoff({
        workId: workId ?? null,
        title: ch ? `推演跟进：${ch.title}` : "推演跟进",
        prompt,
        refs: refs || undefined,
      })
      navigate("/chat?handoff=1")
    },
    [resolveChapterForJump, toolbarWorkTitle, workId, navigate],
  )

  const handleAiShortcut = useCallback(
    (hint: string) => {
      setRightPanelTab("chat")
      void runBranchPredict(hint)
    },
    [runBranchPredict],
  )

  const handleExportOutline = () => {
    const blob = new Blob(
      [JSON.stringify({ workId, workTitle, exportedAt: Date.now(), outline }, null, 2)],
      { type: "application/json;charset=utf-8" },
    )
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `推演大纲-${
      useSamplePreview && !workId ? "示例演示" : workTitle || "export"
    }.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const selectedNode = selectedOutlineId ? findNodeById(outline, selectedOutlineId) : null
  const [quickEditTitle, setQuickEditTitle] = useState("")
  const [quickEditSummary, setQuickEditSummary] = useState("")

  useEffect(() => {
    if (!selectedNode) return
    setQuickEditTitle(selectedNode.title ?? "")
    setQuickEditSummary((selectedNode.summary as string | undefined) ?? "")
  }, [selectedNode?.id])

  const flushQuickEdit = useCallback(async () => {
    if (!workId || useSamplePreview) return
    if (!selectedNode) return
    const title = quickEditTitle.trim() || selectedNode.title
    const summary = quickEditSummary
    if (selectedNode.type === "volume") {
      await updateVolume(selectedNode.id, { title, summary })
    } else if (selectedNode.type === "chapter") {
      await updateChapter(selectedNode.id, { title, summary })
    }
    await reloadOutlineForWork(workId)
  }, [workId, useSamplePreview, selectedNode, quickEditTitle, quickEditSummary, reloadOutlineForWork])

  const selectedScene = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "scene") return null
    return scenes.find((s) => s.id === selectedNode.id) ?? null
  }, [selectedNode, scenes])

  const selectedChapterId = selectedNode?.type === "chapter" ? selectedNode.id : null
  const linkedScenesForSelectedChapter = useMemo(() => {
    if (!selectedChapterId) return []
    return scenes.filter((s) => s.linkedChapterIds.includes(selectedChapterId))
  }, [scenes, selectedChapterId])

  const filteredSceneChoicesForLink = useMemo(() => {
    const q = sceneQ.trim().toLowerCase()
    const linked = new Set(linkedScenesForSelectedChapter.map((s) => s.id))
    const base = scenes.filter((s) => !linked.has(s.id))
    if (!q) return base
    return base.filter((s) => `${s.title}\n${s.summary ?? ""}`.toLowerCase().includes(q))
  }, [sceneQ, scenes, linkedScenesForSelectedChapter])

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

  const filteredOutline = useMemo(() => {
    const q = outlineSearch.trim().toLowerCase()
    if (!q) return outline
    const walk = (nodes: OutlineNode[]): OutlineNode[] => {
      const out: OutlineNode[] = []
      for (const n of nodes) {
        const hay = `${n.title ?? ""}\n${(n.summary ?? "") as string}`.toLowerCase()
        const child = n.children ? walk(n.children) : []
        if (hay.includes(q) || child.length > 0) {
          out.push({ ...n, collapsed: q ? false : n.collapsed, children: child.length ? child : n.children })
        }
      }
      return out
    }
    return walk(outline)
  }, [outline, outlineSearch])

  useEffect(() => {
    if (!outlineSearch.trim()) return
    if (!selectedOutlineId) return
    if (findNodeById(filteredOutline, selectedOutlineId)) return
    const first = firstChapterIdInTree(filteredOutline)
    if (first) setSelectedOutlineId(first)
  }, [outlineSearch, selectedOutlineId, filteredOutline])

  const handleCreateVolume = useCallback(async () => {
    if (!workId) return
    const v = await createVolume(workId, "新卷")
    await reloadOutlineForWork(workId)
    setSelectedOutlineId(v.id)
  }, [workId, reloadOutlineForWork])

  const applyNodeStatus = useCallback(
    (nodeId: string, status: OutlineNode["status"]) => {
      if (status === "finalized") return
      setOutline((prev) => {
        const walk = (nodes: OutlineNode[]): OutlineNode[] =>
          nodes.map((n) => {
            if (n.id === nodeId) return { ...n, status }
            if (n.children) return { ...n, children: walk(n.children) }
            return n
          })
        return walk(prev)
      })
      if (status === "draft" || status === "refining" || status === "locked") {
        setStatusByNodeId((prev) => ({ ...prev, [nodeId]: status }))
      }
    },
    [],
  )

  const requestMoveNode = useCallback(
    async (nodeId: string, dir: "up" | "down") => {
      if (!workId || useSamplePreview) return
      const node = findNodeById(outline, nodeId)
      if (!node) return

      if (node.type === "chapter") {
        const idx = chapters.findIndex((c) => c.id === nodeId)
        if (idx < 0) return
        const j = dir === "up" ? idx - 1 : idx + 1
        if (j < 0 || j >= chapters.length) return
        const orderedIds = chapters.map((c) => c.id)
        ;[orderedIds[idx], orderedIds[j]] = [orderedIds[j]!, orderedIds[idx]!]
        await reorderChapters(workId, orderedIds)
        await reloadOutlineForWork(workId)
        return
      }

      if (node.type === "volume") {
        const vols = await listVolumes(workId)
        const idx = vols.findIndex((v) => v.id === nodeId)
        if (idx < 0) return
        const j = dir === "up" ? idx - 1 : idx + 1
        if (j < 0 || j >= vols.length) return
        const a = vols[idx]!
        const b = vols[j]!
        await Promise.all([
          updateVolume(a.id, { order: b.order }),
          updateVolume(b.id, { order: a.order }),
        ])
        await reloadOutlineForWork(workId)
      }
    },
    [workId, useSamplePreview, outline, chapters, reloadOutlineForWork],
  )

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!workId || useSamplePreview) return
      const node = findNodeById(outline, nodeId)
      if (!node) return
      if (node.type === "scene") {
        setScenes((prev) => prev.filter((s) => s.id !== nodeId))
        setSelectedOutlineId((cur) => (cur === nodeId ? null : cur))
        return
      }
      if (node.type === "volume") await deleteVolume(node.id)
      if (node.type === "chapter") await deleteChapter(node.id)
      await reloadOutlineForWork(workId)
    },
    [workId, useSamplePreview, outline, reloadOutlineForWork],
  )

  const linkedRefs = useMemo(() => {
    const set = new Set(linkedRefWorkIds)
    return refLibrary.filter((r) => set.has(r.id))
  }, [refLibrary, linkedRefWorkIds])

  useEffect(() => {
    // Keep outline's scene nodes in sync with `scenes` (scenes are independent of vol/chap tree).
    setOutline((prev) => {
      const rest = prev.filter((n) => n.type !== "scene")
      const sceneNodes: OutlineNode[] = scenes.map((s) => ({
        id: s.id,
        title: s.title,
        type: "scene",
        status: "draft",
        summary: s.summary ?? "",
        children: undefined,
        collapsed: false,
      }))
      return [...sceneNodes, ...rest]
    })
  }, [scenes])

  const filteredRefChoices = useMemo(() => {
    const q = linkRefQ.trim().toLowerCase()
    const linked = new Set(linkedRefWorkIds)
    const base = refLibrary.filter((r) => !linked.has(r.id))
    if (!q) return base
    return base.filter((r) => {
      const hay = `${r.title ?? ""}\n${r.category ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [refLibrary, linkedRefWorkIds, linkRefQ])

  const linkRef = useCallback((refWorkId: string) => {
    setLinkedRefWorkIds((prev) => (prev.includes(refWorkId) ? prev : [...prev, refWorkId]))
  }, [])

  const unlinkRef = useCallback((refWorkId: string) => {
    setLinkedRefWorkIds((prev) => prev.filter((x) => x !== refWorkId))
  }, [])

  const applyRefToOutline = useCallback(
    async (ref: ReferenceLibraryEntry) => {
      const ex = await listReferenceExcerpts(ref.id)
      const top = ex.slice(0, 3)
      const content = [
        `引用书目：${ref.title}${ref.category ? `（${ref.category}）` : ""}`,
        "",
        top.length
          ? top
              .map((x, i) => {
                const note = (x.note ?? "").trim()
                const text = (x.text ?? "").trim()
                return [`摘录 ${i + 1}${note ? ` · ${note}` : ""}`, text].filter(Boolean).join("\n")
              })
              .join("\n\n---\n\n")
          : "（暂无摘录：你可以在「藏经」里选中内容并添加摘录，推演侧就能直接复用。）",
      ].join("\n")

      setWenCe((prev) => [
        {
          id: `w${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: new Date(),
          type: "user_note",
          title: `引用：${ref.title}`,
          content,
          relatedOutlineId: selectedOutlineId ?? undefined,
          isPinned: true,
          tags: ["引用", "藏经"],
        },
        ...prev,
      ])
      setActiveTab("wence")
    },
    [selectedOutlineId],
  )

  const requestDeleteNode = useCallback((nodeId: string) => {
    setPendingDeleteId(nodeId)
    setDeleteConfirmOpen(true)
  }, [])

  const createScene = useCallback(() => {
    const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const t = Date.now()
    setScenes((prev) => [
      {
        id,
        title: "新场景",
        summary: "",
        linkedChapterIds: [],
        createdAt: t,
        updatedAt: t,
      },
      ...prev,
    ])
    setSelectedOutlineId(id)
    setActiveTab("outline")
  }, [])

  const linkSceneToChapter = useCallback((sceneId: string, chapterId: string) => {
    const t = Date.now()
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== sceneId) return s
        if (s.linkedChapterIds.includes(chapterId)) return s
        return { ...s, linkedChapterIds: [...s.linkedChapterIds, chapterId], updatedAt: t }
      }),
    )
  }, [])

  const unlinkSceneFromChapter = useCallback((sceneId: string, chapterId: string) => {
    const t = Date.now()
    setScenes((prev) =>
      prev.map((s) =>
        s.id === sceneId
          ? { ...s, linkedChapterIds: s.linkedChapterIds.filter((x) => x !== chapterId), updatedAt: t }
          : s,
      ),
    )
  }, [])

  const handleSendMessage = () => {
    const text = chatInput.trim()
    if (!text) return
    const newMessage: ChatMessage = {
      id: `m${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
      relatedOutlineId: selectedOutlineId || undefined,
    }
    setChatHistory((prev) => [...prev, newMessage])
    setChatInput("")
    setRightPanelTab("chat")
    void runBranchPredict(text)
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
      if (status === "finalized") {
        if (isFinalized(node.id)) count++
      } else if (!isFinalized(node.id) && node.status === status) {
        count++
      }
      if (node.children) count += countByStatus(node.children, status)
    }
    return count
  }

  const totalNodes = countNodes(outline)
  const finalizedNodes = countByStatus(outline, "finalized")
  /** 顶栏百分比：当前大纲树中 status 为 finalized 的节点占比（与左侧「已定」统计同源） */
  const progressPercent =
    totalNodes > 0 ? (finalizedNodes / totalNodes) * 100 : 0

  if (pageLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => {
          setDeleteConfirmOpen(v)
          if (!v) setPendingDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteId
                ? (() => {
                    const n = findNodeById(outline, pendingDeleteId)
                    if (!n) return "该节点不存在或已被删除。"
                    const kind =
                      n.type === "volume" ? "卷" : n.type === "chapter" ? "章" : n.type === "scene" ? "场景" : "节点"
                    return `将删除${kind}「${n.title}」。此操作不可撤销。`
                  })()
                : "此操作不可撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = pendingDeleteId
                setDeleteConfirmOpen(false)
                setPendingDeleteId(null)
                if (id) void handleDeleteNode(id)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                <span className="font-medium max-w-[10rem] truncate">{toolbarWorkTitle}</span>
                <Badge variant="secondary" className="h-4 text-[10px] shrink-0">
                  {primaryTag}
                </Badge>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {works.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => {
                    setWorkId(w.id)
                    localStorage.setItem(LS_LAST_WORK, w.id)
                  }}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  {w.title || "未命名"}
                </DropdownMenuItem>
              ))}
              {works.length === 0 && (
                <DropdownMenuItem disabled>暂无作品</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  applySamplePreview()
                }}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                载入 / 恢复内置示例
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  clearSamplePreview()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清除示例内容
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  localStorage.setItem(LS_TUIYAN_DEMO_DISABLE_DEFAULT, "1")
                }}
              >
                <X className="mr-2 h-4 w-4" />
                不再默认示例
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/library")}>
                <Plus className="mr-2 h-4 w-4" />
                去作品库新建
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
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="搜索大纲"
                  title="搜索大纲"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm transition-colors",
                    outlineSearch.trim()
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Search className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start" sideOffset={8}>
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="搜索大纲..."
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    value={outlineSearch}
                    onChange={(e) => setOutlineSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
            title="已标记为「已定稿」的节点数 ÷ 当前大纲总节点数（卷/章/场景）"
          >
            <span className="text-muted-foreground">定稿进度</span>
            <span className="ml-1.5 font-medium tabular-nums text-foreground">
              {totalNodes > 0 ? `${Math.round(progressPercent)}%` : "—"}
            </span>
          </div>

          <div className="h-5 w-px bg-border/50" />

          {/* Actions */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  type="button"
                  onClick={handleExportOutline}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>导出大纲</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                  <Link to="/settings" aria-label="推演设置">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>推演设置</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="h-8 max-w-[10.5rem] gap-1 px-2"
                  onClick={() => setShowModelSelector(true)}
                  aria-label="选择 AI 模型"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center [&>div]:h-6 [&>div]:w-6 [&>div]:scale-[0.72] [&>div]:origin-center">
                    {selectedAiModel.icon}
                  </span>
                  <span className="min-w-0 truncate text-xs font-medium">
                    {selectedAiModel.name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">当前模型（与全局 AI 设置同步）</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            size="sm"
            className="h-8 gap-2"
            type="button"
            disabled={isGenerating || !workId}
            onClick={() =>
              handleAiShortcut("请基于当前选中章节，推演三条可接续的剧情走向。")
            }
          >
            <Sparkles className="h-4 w-4" />
            AI 生成
          </Button>

          <AIModelSelector
            open={showModelSelector}
            onOpenChange={setShowModelSelector}
            selectedModelId={selectedModelId}
            onSelectModel={handleSelectAiModel}
            title="选择模型"
          />
        </div>
      </div>

      {/* TuiyanFlowBar — Sprint 3：步骤条 + 提示词选择器（可折叠） */}
      <div className="border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-3 px-4 py-1.5">
          <button
            type="button"
            onClick={() => setShowFlowBar((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={showFlowBar ? "折叠步骤条" : "展开步骤条"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            提示词
            {showFlowBar
              ? <ChevronUp className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </button>

          {showFlowBar && (
            <>
              {/* 步骤 1 */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">1</span>
                <span className="hidden sm:inline">选作品</span>
              </div>
              <div className="h-px w-3 bg-border/60 shrink-0 hidden sm:block" />
              {/* 步骤 2：PromptPicker */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">2</span>
                <span className="hidden sm:inline">选提示词</span>
              </div>
              <PromptPicker
                selectedId={selectedPromptTemplate?.id}
                onPick={(t) => setSelectedPromptTemplate(t)}
                filterSlots={PROMPT_PICKER_TUIYAN_SLOTS}
              />
              {selectedPromptTemplate && (
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="清除提示词选择"
                  onClick={() => setSelectedPromptTemplate(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="h-px w-3 bg-border/60 shrink-0 hidden sm:block" />
              {/* 步骤 3 */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary shrink-0">3</span>
                <span className="hidden sm:inline">AI 生成</span>
              </div>
              {selectedPromptTemplate && (
                <span className="ml-1 hidden text-[11px] text-primary sm:inline">
                  ✓ 模板已选，点顶栏「AI 生成」即可注入
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Outline Tree */}
        {showLeftPanel && (
          <div className="flex w-80 flex-col border-r border-border/40 bg-card/20">
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
                {filteredOutline.map((node) => (
                  <OutlineTreeNode
                    key={node.id}
                    node={node}
                    selectedId={selectedOutlineId}
                    onSelect={setSelectedOutlineId}
                    onToggle={toggleCollapse}
                    isFinalizedId={isFinalized}
                    onToggleFinalized={toggleFinalized}
                    onChangeStatus={(id, status) => applyNodeStatus(id, status)}
                    onDelete={(id) => requestDeleteNode(id)}
                    getStatusOverride={getStatusOverride}
                    onMove={(id, dir) => void requestMoveNode(id, dir)}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Add Actions */}
            <div className="border-t border-border/40 p-3 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                type="button"
                onClick={() => void handleCreateVolume()}
                disabled={!workId}
              >
                <Plus className="h-4 w-4" />
                新建卷
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                type="button"
                disabled={isGenerating || !workId}
                onClick={() =>
                  handleAiShortcut(
                    "请根据已有卷章结构，给出三条「后续大纲」方向（每条含标题与走向说明）。",
                  )
                }
              >
                <Wand2 className="h-4 w-4" />
                AI 生成大纲
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                type="button"
                onClick={() => createScene()}
              >
                <Layers className="h-4 w-4" />
                新建场景
              </Button>
            </div>
          </div>
        )}

        {/* Center Panel - Detail/Mindmap/WenCe */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "outline" && outline.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <BookOpen className="h-10 w-10 opacity-40" />
              <p>当前作品暂无卷或章节，请先在写作页或作品库中创建卷与章。</p>
            </div>
          )}
          {activeTab === "outline" && outline.length > 0 && !selectedNode && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <List className="h-10 w-10 opacity-40" />
              <p>请从左侧大纲中选择一个节点。</p>
            </div>
          )}
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
                    {(() => {
                      const st = isFinalized(selectedNode.id) ? "finalized" : selectedNode.status
                      return (
                        <Badge
                          variant="secondary"
                          className={cn(
                            st === "finalized" && "bg-[oklch(0.7_0.15_145)]/10 text-[oklch(0.7_0.15_145)]",
                            st === "refining" && "bg-amber-500/10 text-amber-400",
                            st === "draft" && "bg-muted/50 text-muted-foreground",
                            st === "locked" && "bg-primary/10 text-primary"
                          )}
                        >
                          {st === "finalized" && "已定稿"}
                          {st === "refining" && "打磨中"}
                          {st === "draft" && "草稿"}
                          {st === "locked" && "已锁定"}
                        </Badge>
                      )
                    })()}
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
                  <Button variant="outline" size="sm" className="gap-2" type="button">
                    <Plus className="h-4 w-4" />
                    添加子项
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    type="button"
                    disabled={isGenerating || !workId}
                    onClick={() =>
                      handleAiShortcut(
                        "请为当前节点生成可用的细纲要点（场景或节拍列点，三条并列方向）。",
                      )
                    }
                  >
                    <GitMerge className="h-4 w-4" />
                    生成细纲
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    type="button"
                    disabled={isGenerating || !workId}
                    onClick={() =>
                      handleAiShortcut(
                        "请从结构与节奏角度，优化当前节点的大纲表述与建议（三条并列方向）。",
                      )
                    }
                  >
                    <Sparkles className="h-4 w-4" />
                    AI 优化
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    type="button"
                    disabled={!workId}
                    onClick={() => workId && navigate(`/work/${workId}`)}
                  >
                    <ArrowRight className="h-4 w-4" />
                    进入生辉
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}

          {activeTab === "mindmap" && outline.length === 0 && (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              暂无卷章数据
            </div>
          )}
          {activeTab === "mindmap" && outline.length > 0 && (
            <div className="flex-1 overflow-hidden">
              <div ref={mmWrapRef} className="h-full w-full">
                <ReactFlow
                  nodes={mmNodes}
                  edges={mmEdges}
                  nodeTypes={rfNodeTypes}
                  edgeTypes={rfEdgeTypes}
                  onNodesChange={(chs: NodeChange[]) => setMmNodes((nds) => applyNodeChanges(chs, nds))}
                  onEdgesChange={(chs: EdgeChange[]) => setMmEdges((eds) => applyEdgeChanges(chs, eds))}
                  onConnect={(c: Connection) => setMmEdges((eds) => addEdge(c, eds))}
                  defaultViewport={mmViewport}
                  onMoveEnd={(_, vp) => setMmViewport(vp)}
                  fitView
                >
                  <Background />
                  <MiniMap pannable zoomable />
                  <Controls />
                </ReactFlow>
              </div>

              {/* Mindmap Toolbar */}
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-border/50 bg-card/90 p-2 shadow-lg backdrop-blur-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  type="button"
                  onClick={() => {
                    setMmNodes((prev) => [
                      ...prev,
                      {
                        id: `n-${Date.now()}`,
                        position: { x: 40, y: 40 },
                        data: { label: "新节点" },
                      },
                    ])
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  type="button"
                  disabled={!workId}
                  onClick={() => workId && void reloadOutlineForWork(workId)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <div className="h-5 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-xs"
                  type="button"
                  onClick={async () => {
                    const el = mmWrapRef.current
                    if (!el) return
                    const dataUrl = await toPng(el, { cacheBust: true, pixelRatio: 2 })
                    const a = document.createElement("a")
                    a.href = dataUrl
                    a.download = `推演导图-${toolbarWorkTitle || "export"}.png`
                    a.click()
                  }}
                >
                  <Download className="h-4 w-4" />
                  导出 PNG
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
          <div className="flex w-96 flex-col border-l border-border/40 bg-card/20 min-h-0 overflow-hidden">
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
              <div className="flex flex-1 flex-col min-h-0">
                {/* Chat Messages */}
                <ScrollArea className="flex-1 min-h-0 p-4" ref={chatScrollRef}>
                  <div className="space-y-3">
                    {chatHistory.length === 0 && !isGenerating && (
                      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                        <Bot className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">选择一个大纲节点，<br />描述你的想法开始对话</p>
                      </div>
                    )}
                    {chatHistory.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-2",
                          message.role === "user" ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        {message.role === "assistant" && (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                        <div className={cn(
                          "flex flex-col gap-1 max-w-[85%]",
                          message.role === "user" ? "items-end" : "items-start"
                        )}>
                          <div className={cn(
                            "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted/60 text-foreground rounded-tl-sm"
                          )}>
                            {message.role === "assistant" ? (
                              <ChatMessageBubble
                                message={message}
                                onWriteToDraft={(c) => writeToAiPanelDraftAndOpenEditor(c)}
                                onGoWence={(c) => goWenceWithPrefill(c)}
                                inline
                              />
                            ) : (
                              <span className="whitespace-pre-wrap">{message.content}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground px-1">
                            {message.timestamp instanceof Date
                              ? message.timestamp.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
                              : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                    {isGenerating && (
                      <div className="flex gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                          <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted/60 px-4 py-2.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="shrink-0 border-t border-border/40 p-3 space-y-2">
                  {/* Quick Prompts */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { icon: Zap, text: "优化节奏" },
                      { icon: Users, text: "完善人物" },
                      { icon: Swords, text: "强化冲突" },
                      { icon: Brain, text: "理清逻辑" },
                    ].map((prompt) => (
                      <button
                        key={prompt.text}
                        type="button"
                        className="flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                        onClick={() => setChatInput((prev) => prev ? prev + " " + prompt.text : prompt.text)}
                      >
                        <prompt.icon className="h-3 w-3" />
                        {prompt.text}
                      </button>
                    ))}
                  </div>

                  {/* Textarea + Send */}
                  <div className="relative">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={selectedNode ? `对「${selectedNode.title}」提问…` : "描述你的想法，Enter 发送…"}
                      className="min-h-[72px] max-h-[140px] resize-none pr-12 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="absolute bottom-2 right-2 h-7 w-7 rounded-full"
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || isGenerating}
                      title="发送 (Enter)"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Status bar */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>已选节点：<span className="text-foreground/70">{selectedNode?.title || "无"}</span></span>
                    <span>Shift+Enter 换行</span>
                  </div>
                </div>
              </div>
            )}

            {rightPanelTab === "reference" && (
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">关联藏经</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setLinkRefOpen(true)}
                      type="button"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      关联书籍
                    </Button>
                  </div>

                  <Dialog open={linkRefOpen} onOpenChange={setLinkRefOpen}>
                    <DialogContent className="sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>从藏经关联书籍</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <Input
                          value={linkRefQ}
                          onChange={(e) => setLinkRefQ(e.target.value)}
                          placeholder="搜索书名 / 分类…"
                          className="h-9"
                        />
                        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/40">
                          {filteredRefChoices.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">暂无可关联书目。</div>
                          ) : (
                            <div className="divide-y divide-border/30">
                              {filteredRefChoices.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-3 p-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      {(r.category ?? "未分类") + ` · ${r.chunkCount} 段 · ${r.chapterHeadCount} 章`}
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => linkRef(r.id)}
                                  >
                                    关联
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>提示：更丰富的“提炼/标签/摘录”请在藏经页完成。</span>
                          <Link to="/reference" className="text-primary hover:underline">
                            打开藏经
                          </Link>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {linkedRefs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
                      <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">还没有关联藏经书目。</p>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => setLinkRefOpen(true)}>
                          <Link2 className="h-4 w-4" />
                          关联书籍
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2" asChild>
                          <Link to="/reference">
                            <BookOpen className="h-4 w-4" />
                            浏览藏经
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    linkedRefs.map((r) => (
                      <div key={r.id} className="rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate font-medium text-foreground">{r.title}</h4>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {(r.category ?? "未分类") + ` · ${r.chunkCount} 段 · ${r.chapterHeadCount} 章`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              asChild
                            >
                              <Link to={`/reference?ref=${encodeURIComponent(r.id)}&ord=0`}>
                                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                                打开
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => unlinkRef(r.id)}
                            >
                              解除
                            </Button>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full gap-2 text-xs"
                          onClick={() => void applyRefToOutline(r)}
                          type="button"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          应用到当前大纲（写入文策）
                        </Button>
                      </div>
                    ))
                  )}

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
                      <Input
                        value={quickEditTitle}
                        onChange={(e) => setQuickEditTitle(e.target.value)}
                        className="h-9"
                        onBlur={() => void flushQuickEdit()}
                        disabled={!workId || useSamplePreview}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">摘要</label>
                      <Textarea
                        value={quickEditSummary}
                        onChange={(e) => setQuickEditSummary(e.target.value)}
                        className="min-h-[100px] resize-none"
                        placeholder="描述这一部分的核心内容..."
                        onBlur={() => void flushQuickEdit()}
                        disabled={!workId || useSamplePreview}
                      />
                    </div>
                  </div>

                  {selectedNode.type === "chapter" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-foreground">关联场景</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-2"
                          type="button"
                          onClick={() => setSceneLinkOpen(true)}
                        >
                          <Link2 className="h-4 w-4" />
                          关联场景
                        </Button>
                      </div>
                      {linkedScenesForSelectedChapter.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/40 bg-card/20 p-3 text-xs text-muted-foreground">
                          暂无关联场景。可用于“场景作为独立节点”，并与章节建立归属/引用关系。
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {linkedScenesForSelectedChapter.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/20 p-3"
                            >
                              <button
                                className="min-w-0 text-left"
                                onClick={() => setSelectedOutlineId(s.id)}
                                type="button"
                              >
                                <div className="truncate text-sm font-medium text-foreground">{s.title}</div>
                                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                  {(s.summary ?? "").trim() || "（暂无摘要）"}
                                </div>
                              </button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-destructive hover:text-destructive"
                                type="button"
                                onClick={() => unlinkSceneFromChapter(s.id, selectedNode.id)}
                              >
                                解除
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <Dialog
                        open={sceneLinkOpen}
                        onOpenChange={(v) => {
                          setSceneLinkOpen(v)
                          if (!v) setSceneQ("")
                        }}
                      >
                        <DialogContent className="sm:max-w-xl">
                          <DialogHeader>
                            <DialogTitle>选择要关联的场景</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <Input
                              value={sceneQ}
                              onChange={(e) => setSceneQ(e.target.value)}
                              placeholder="搜索场景标题/摘要…"
                              className="h-9"
                            />
                            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/40">
                              {filteredSceneChoicesForLink.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">暂无可关联场景。</div>
                              ) : (
                                <div className="divide-y divide-border/30">
                                  {filteredSceneChoicesForLink.map((s) => (
                                    <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-foreground">{s.title}</div>
                                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                          {(s.summary ?? "").trim() || "（暂无摘要）"}
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() => {
                                          linkSceneToChapter(s.id, selectedNode.id)
                                          setSceneLinkOpen(false)
                                          setSceneQ("")
                                        }}
                                      >
                                        关联
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>没有合适的？可以先在左侧「新建场景」。</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-2 text-xs"
                                type="button"
                                onClick={() => {
                                  setSceneLinkOpen(false)
                                  createScene()
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                新建场景
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}

                  {selectedNode.type === "scene" && selectedScene && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-foreground">关联章节</h3>
                      {selectedScene.linkedChapterIds.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/40 bg-card/20 p-3 text-xs text-muted-foreground">
                          该场景尚未关联任何章节。可在章节详情里「关联场景」。
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedScene.linkedChapterIds.map((cid) => {
                            const ch = chapters.find((c) => c.id === cid)
                            return (
                              <div
                                key={cid}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/20 p-3"
                              >
                                <button
                                  className="min-w-0 text-left"
                                  onClick={() => setSelectedOutlineId(cid)}
                                  type="button"
                                >
                                  <div className="truncate text-sm font-medium text-foreground">
                                    {ch?.title ?? "（章节已删）"}
                                  </div>
                                </button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-destructive hover:text-destructive"
                                  type="button"
                                  onClick={() => unlinkSceneFromChapter(selectedScene.id, cid)}
                                >
                                  解除
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

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
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        type="button"
                        disabled={isGenerating || !workId}
                        onClick={() =>
                          handleAiShortcut(
                            "请围绕当前节点，给出三条可扩写或延展的正向剧情分支（每条含标题与走向）。",
                          )
                        }
                      >
                        <Sparkles className="h-4 w-4" />
                        AI 扩写
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        type="button"
                        disabled={isGenerating || !workId}
                        onClick={() =>
                          handleAiShortcut(
                            "请为当前节点生成细纲要点（场景或节拍列点，三条并列方向）。",
                          )
                        }
                      >
                        <GitMerge className="h-4 w-4" />
                        生成细纲
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" type="button">
                        <CheckCircle className="h-4 w-4" />
                        标记定稿
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        type="button"
                        disabled={!workId}
                        onClick={() => workId && navigate(`/work/${workId}`)}
                      >
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
