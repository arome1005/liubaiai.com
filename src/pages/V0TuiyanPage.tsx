import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { TuiyanPlanningNodeCenterEditor } from "../components/tuiyan/TuiyanPlanningNodeCenterEditor"
import {
  TuiyanPlanningPushDialog,
  type TuiyanPlanningPushCandidate,
} from "../components/tuiyan/TuiyanPlanningPushDialog"
import { TuiyanPlanningStatsInline } from "../components/tuiyan/TuiyanPlanningStatsInline"
import { TuiyanPlanningTree } from "../components/tuiyan/TuiyanPlanningTree"
import { TuiyanPlanningUnifiedPanel } from "../components/tuiyan/TuiyanPlanningUnifiedPanel"
import { PlanningDeleteConfirmDialog, type PlanningDeleteTarget } from "../components/tuiyan/PlanningDeleteConfirmDialog"
import { TuiyanChatPanel, type ChatMessage } from "../components/tuiyan/TuiyanChatPanel"
import { TuiyanReferencePanel } from "../components/tuiyan/TuiyanReferencePanel"
import { useTuiyanLayoutPanels } from "../hooks/useTuiyanLayoutPanels"
import type {
  GlobalPromptTemplate,
  PlanningNodeStructuredMeta,
  TuiyanPlanningLevel,
  TuiyanPlanningMeta,
  TuiyanPlanningNode,
  TuiyanPushedOutlineEntry,
} from "../db/types"
import { renderPromptTemplate } from "../util/render-prompt-template"
import {
  listPlanningChildren,
  PLANNING_LEVEL_LABEL,
  PLANNING_LEVEL_TO_SLOT,
  STRUCTURED_FIELDS_BY_LEVEL,
  planningNodeTitleFallback,
  DEFAULT_PLANNING_SCALE,
  PLANNING_MIN_CHARS,
  countCharsNoPunct,
  countCharsWithPunct,
  serializePlanningNodeForCount,
  type PlanningScale,
} from "../util/tuiyan-planning"
import { Link, useNavigate } from "react-router-dom"
import { isFirstAiGateCancelledError } from "../ai/client"
import { generateLogicThreeBranches, LogicBranchPredictError } from "../ai/logic-branch-predict"
import { generatePlanningAdvisorReply, TuiyanPlanningChatError } from "../ai/tuiyan-planning-chat"
import {
  generateTuiyanPlanningDetail,
  generateTuiyanPlanningList,
  TuiyanPlanningGenerateError,
} from "../ai/tuiyan-planning-generate"
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
  updateVolume,
  updateChapter,
  listReferenceLibrary,
  listReferenceExcerpts,
} from "../db/repo"
import type { Chapter, ReferenceLibraryEntry, Work } from "../db/types"
import { resolveDefaultChapterId } from "../util/resolve-default-chapter"
import { workTagsToProfileText } from "../util/work-tags"
import { workPathSegment } from "../util/work-url"
import { writeAiPanelDraft } from "../util/ai-panel-draft"
import { writeEditorHitHandoff } from "../util/editor-hit-handoff"
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
  ChevronLeft,
  ChevronDown,
  Plus,
  MoreHorizontal,
  BookOpen,
  Network,
  FileText,
  History,
  Sparkles,
  Pencil,
  Trash2,
  Copy,
  Link2,
  ArrowRight,
  Target,
  Users,
  MapPin,
  Swords,
  Heart,
  Flame,
  Lock,
  RefreshCw,
  Download,
  Undo2,
  PersonStanding,
  Settings,
  Layers,
  GitMerge,
  Milestone,
  BarChart3,
  PanelLeftClose,
  PanelRightClose,
  PanelLeft,
  User,
  Pin,
  PinOff,
  CircleDot,
  Circle,
  CheckCircle,
  Lightbulb,
  List,
  X,
} from "lucide-react"
import { cn } from "../lib/utils"
import { LiubaiLogo } from "../components/LiubaiLogo"
import { AI_MODELS } from "../components/ai-model-selector"
import { UnifiedAIModelSelector as AIModelSelector } from "../components/ai-model-selector-unified"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Badge } from "../components/ui/badge"
import { Progress } from "../components/ui/progress"
import { Textarea } from "../components/ui/textarea"
import { ScrollArea } from "../components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
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
  const [mmNodes, setMmNodes] = useState<Node[]>([])
  const [mmEdges, setMmEdges] = useState<Edge[]>([])
  const [mmViewport, setMmViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const mmWrapRef = useRef<HTMLDivElement | null>(null)
  const [scenes, setScenes] = useState<
    Array<{ id: string; title: string; summary?: string; linkedChapterIds: string[]; createdAt: number; updatedAt: number }>
  >([])
  const [chatInput, setChatInput] = useState("")
  const [activeTab, setActiveTab] = useState<"outline" | "mindmap" | "wence">("outline")
  const [rightPanelTab, setRightPanelTab] = useState<"detail" | "chat" | "reference">("detail")
  const {
    showLeftPanel,
    showRightPanel,
    leftPanelWidth,
    rightPanelWidth,
    setShowLeftPanel,
    setShowRightPanel,
    beginPanelDrag,
    resetLeftPanelWidth,
    resetRightPanelWidth,
  } = useTuiyanLayoutPanels()
  const [isGenerating, setIsGenerating] = useState(false)
  const [planningIdea, setPlanningIdea] = useState("")
  const [planningTree, setPlanningTree] = useState<TuiyanPlanningNode[]>([])
  const [planningDraftsByNodeId, setPlanningDraftsByNodeId] = useState<Record<string, string>>({})
  const [planningMetaByNodeId, setPlanningMetaByNodeId] = useState<Record<string, TuiyanPlanningMeta>>({})
  const [planningStructuredMetaByNodeId, setPlanningStructuredMetaByNodeId] = useState<Record<string, PlanningNodeStructuredMeta>>({})
  const [planningSelectedNodeId, setPlanningSelectedNodeId] = useState<string | null>(null)
  const [planningMode, setPlanningMode] = useState<"model" | "template">("model")
  const [planningBusyLevel, setPlanningBusyLevel] = useState<TuiyanPlanningLevel | null>(null)
  const [planningError, setPlanningError] = useState("")
  const [planningIdeaDialogOpen, setPlanningIdeaDialogOpen] = useState(false)
  const [planningPushDialogOpen, setPlanningPushDialogOpen] = useState(false)
  const [planningScale, setPlanningScale] = useState<PlanningScale>(() => {
    try {
      const saved = localStorage.getItem("liubai:tuiyan:planningScale:v1")
      if (saved) return { ...DEFAULT_PLANNING_SCALE, ...(JSON.parse(saved) as PlanningScale) }
    } catch { /* ignore */ }
    return DEFAULT_PLANNING_SCALE
  })
  const handlePlanningScaleChange = useCallback((s: PlanningScale) => {
    setPlanningScale(s)
    localStorage.setItem("liubai:tuiyan:planningScale:v1", JSON.stringify(s))
  }, [])
  const [pushOverwriteConfirmOpen, setPushOverwriteConfirmOpen] = useState(false)
  const [planningDeleteTarget, setPlanningDeleteTarget] = useState<PlanningDeleteTarget>(null)
  /** 规划树折叠：undefined / true 为展开，false 为收起 */
  const [planningExpandedById, setPlanningExpandedById] = useState<Record<string, boolean>>({})
  // Sprint 3：选中的提示词模板（运行时对象，随 picker 更新）
  const [selectedPromptTemplate, _setSelectedPromptTemplate] = useState<GlobalPromptTemplate | null>(null)
  const selectedPromptTemplateRef = useRef<GlobalPromptTemplate | null>(null)
  const setSelectedPromptTemplate = useCallback((t: GlobalPromptTemplate | null) => {
    selectedPromptTemplateRef.current = t
    _setSelectedPromptTemplate(t)
  }, [])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const branchAbortRef = useRef<AbortController | null>(null)
  const planningAbortRef = useRef<AbortController | null>(null)
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

  const workLinkSeg = useMemo(() => {
    if (!workId) return null
    const w = works.find((x) => x.id === workId)
    return w ? workPathSegment(w) : workId
  }, [works, workId])

  const applySamplePreview = useCallback(() => {
    setUseSamplePreview(true)
    setOutline(cloneMockOutline())
    setChatHistory(cloneMockChatHistory())
    setWenCe(cloneMockWenCe())
    setSelectedOutlineId("c1-1")
    setPlanningIdea("")
    setPlanningTree([])
    setPlanningDraftsByNodeId({})
    setPlanningMetaByNodeId({})
    setPlanningSelectedNodeId(null)
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
    setPlanningIdea("")
    setPlanningTree([])
    setPlanningDraftsByNodeId({})
    setPlanningMetaByNodeId({})
    setPlanningSelectedNodeId(null)
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
    setPlanningIdea(st?.planningIdea ?? "")
    setPlanningTree(st?.planningTree ?? [])
    setPlanningDraftsByNodeId(st?.planningDraftsByNodeId ?? {})
    setPlanningMetaByNodeId(st?.planningMetaByNodeId ?? {})
    setPlanningStructuredMetaByNodeId(st?.planningStructuredMetaByNodeId ?? {})
    setPlanningSelectedNodeId(st?.planningSelectedNodeId ?? null)
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
        planningIdea,
        planningTree,
        planningDraftsByNodeId,
        planningMetaByNodeId,
        planningStructuredMetaByNodeId,
        planningSelectedNodeId,
      })
    }, 550)
  }, [
    workId,
    useSamplePreview,
    chatHistory,
    wenCe,
    finalizedNodeIds,
    statusByNodeId,
    linkedRefWorkIds,
    mmNodes,
    mmEdges,
    mmViewport,
    scenes,
    selectedPromptTemplate,
    planningIdea,
    planningTree,
    planningDraftsByNodeId,
    planningMetaByNodeId,
    planningStructuredMetaByNodeId,
    planningSelectedNodeId,
  ])

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
      setPlanningIdea("")
      setPlanningTree([])
      setPlanningDraftsByNodeId({})
      setPlanningMetaByNodeId({})
      setPlanningSelectedNodeId(null)
      return
    }
    void reloadOutlineForWork(workId)
  }, [workId, useSamplePreview, reloadOutlineForWork])

  useEffect(() => () => {
    branchAbortRef.current?.abort()
    planningAbortRef.current?.abort()
  }, [])

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

  const planningNodeMap = useMemo(() => new Map(planningTree.map((n) => [n.id, n])), [planningTree])
  const planningSelectedNode = planningSelectedNodeId ? planningNodeMap.get(planningSelectedNodeId) ?? null : null

  const runBranchPredict = useCallback(
    async (userHint: string, planningContextArg?: string) => {
      if (!workId) {
        appendAssistant(
          useSamplePreview
            ? "当前为内置示例大纲，不含真实章节正文。请在顶部选择您的作品后再进行 AI 推演。"
            : "请先在作品库创建并选择一部作品。",
        )
        return
      }

      // ── 规划顾问模式：有选中规划节点时走新路径 ──────────────────────────
      if (planningSelectedNodeId) {
        branchAbortRef.current?.abort()
        const ac = new AbortController()
        branchAbortRef.current = ac
        setIsGenerating(true)
        try {
          const history = chatHistory.map((m) => ({ role: m.role, content: m.content }))
          const reply = await generatePlanningAdvisorReply({
            planningContext: planningContextArg ?? "",
            userHint,
            history,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          appendAssistant(reply)
        } catch (e) {
          if (isFirstAiGateCancelledError(e)) return
          if (e instanceof DOMException && e.name === "AbortError") return
          if (e instanceof Error && e.name === "AbortError") return
          const msg =
            e instanceof TuiyanPlanningChatError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e)
          appendAssistant(msg)
        } finally {
          setIsGenerating(false)
          branchAbortRef.current = null
        }
        return
      }

      // ── 兜底续写模式：依赖写作大纲选中的章节正文 ─────────────────────────
      const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
      if (!ch) {
        appendAssistant("请在左侧规划树选中一个节点（推荐），或在写作大纲中选择一章开始对话。")
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
      planningSelectedNodeId,
      chatHistory,
    ],
  )

  const resolveChapterForJump = useCallback((): Chapter | null => {
    if (!workId) return null
    const ch = resolveChapterForAi(selectedOutlineId, outline, chapters)
    return ch
  }, [workId, selectedOutlineId, outline, chapters])

  const selectedNode = selectedOutlineId ? findNodeById(outline, selectedOutlineId) : null

  const planningSelectedDraft =
    planningSelectedNodeId && planningSelectedNodeId in planningDraftsByNodeId
      ? planningDraftsByNodeId[planningSelectedNodeId] ?? ""
      : ""

  useEffect(() => {
    setPlanningError("")
  }, [planningSelectedNodeId])

  const planningMasterNodes = useMemo(
    () => listPlanningChildren(planningTree, null, "master_outline"),
    [planningTree],
  )
  const planningOutlineNodes = useMemo(
    () => planningTree.filter((n) => n.level === "outline").sort((a, b) => a.order - b.order),
    [planningTree],
  )
  const planningSelectedAncestors = useMemo(() => {
    const ancestors: TuiyanPlanningNode[] = []
    let n = planningSelectedNode
    while (n?.parentId) {
      const parent = planningNodeMap.get(n.parentId)
      if (!parent) break
      ancestors.unshift(parent)
      n = parent
    }
    return ancestors
  }, [planningNodeMap, planningSelectedNode])
  const planningActiveMaster = useMemo(() => {
    if (planningSelectedNode?.level === "master_outline") return planningSelectedNode
    return planningSelectedAncestors.find((n) => n.level === "master_outline") ?? planningMasterNodes[0] ?? null
  }, [planningMasterNodes, planningSelectedAncestors, planningSelectedNode])
  const planningActiveOutline = useMemo(() => {
    if (planningSelectedNode?.level === "outline") return planningSelectedNode
    return (
      planningSelectedAncestors.find((n) => n.level === "outline") ??
      (planningActiveMaster ? listPlanningChildren(planningTree, planningActiveMaster.id, "outline")[0] : null) ??
      listPlanningChildren(planningTree, null, "outline")[0] ??
      null
    )
  }, [planningActiveMaster, planningSelectedAncestors, planningSelectedNode, planningTree])
  const planningVolumeNodes = useMemo(
    () => listPlanningChildren(planningTree, planningActiveOutline?.id ?? null, "volume"),
    [planningTree, planningActiveOutline?.id],
  )
  const planningActiveVolume = useMemo(() => {
    if (planningSelectedNode?.level === "volume") return planningSelectedNode
    const ancestorVolume = planningSelectedAncestors.find((n) => n.level === "volume")
    if (ancestorVolume) return ancestorVolume
    return planningVolumeNodes[0] ?? null
  }, [planningSelectedAncestors, planningSelectedNode, planningVolumeNodes])
  const planningMasterTotal = useMemo(
    () => planningTree.filter((n) => n.level === "master_outline").length,
    [planningTree],
  )
  const planningVolumeTotal = useMemo(
    () => planningTree.filter((n) => n.level === "volume").length,
    [planningTree],
  )
  /** 当前激活大纲节点下已生成的卷数（用于串行生成按钮提示） */
  const volumeCountForActiveOutline = useMemo(
    () => listPlanningChildren(planningTree, planningActiveOutline?.id ?? null, "volume").length,
    [planningTree, planningActiveOutline?.id],
  )
  const planningChapterOutlineTotal = useMemo(
    () => planningTree.filter((n) => n.level === "chapter_outline").length,
    [planningTree],
  )
  const planningPushCandidates = useMemo<TuiyanPlanningPushCandidate[]>(() => {
    const levelOrder: Record<TuiyanPlanningLevel, number> = {
      master_outline: 0,
      outline: 1,
      volume: 2,
      chapter_outline: 3,
      chapter_detail: 4,
    }
    const pathFor = (node: TuiyanPlanningNode) => {
      const chain: TuiyanPlanningNode[] = []
      let cur: TuiyanPlanningNode | undefined = node
      while (cur) {
        chain.unshift(cur)
        cur = cur.parentId ? planningNodeMap.get(cur.parentId) : undefined
      }
      return chain
    }
    const pathKey = (node: TuiyanPlanningNode) =>
      pathFor(node)
        .map((n) => String(n.order).padStart(4, "0"))
        .join(".")

    return planningTree
      .slice()
      .sort((a, b) => {
        const ka = pathKey(a)
        const kb = pathKey(b)
        if (ka !== kb) return ka.localeCompare(kb)
        return levelOrder[a.level] - levelOrder[b.level]
      })
      .map((node) => {
        const content =
          node.level === "chapter_detail"
            ? (planningDraftsByNodeId[node.id] ?? "").trim() || (node.summary ?? "").trim()
            : (node.summary ?? "").trim()
        return {
          id: node.id,
          parentId: node.parentId ?? null,
          level: node.level,
          order: node.order,
          title: node.title,
          content,
        }
      })
  }, [planningDraftsByNodeId, planningNodeMap, planningTree])

  const togglePlanningExpand = useCallback((id: string) => {
    setPlanningExpandedById((prev) => {
      const cur = prev[id] !== false
      return { ...prev, [id]: !cur }
    })
  }, [])

  const selectPlanningNode = useCallback((id: string) => {
    setPlanningSelectedNodeId(id)
    setSelectedOutlineId(null)
    setPlanningExpandedById((prev) => {
      const map = new Map(planningTree.map((n) => [n.id, n]))
      const next = { ...prev }
      let n = map.get(id)
      while (n?.parentId) {
        next[n.parentId] = true
        n = map.get(n.parentId)
      }
      return next
    })
  }, [planningTree])

  const makePlanningContext = useCallback(
    (targetLevel: TuiyanPlanningLevel, parentNode: TuiyanPlanningNode | null) => {
      const work = works.find((w) => w.id === workId)
      const ancestors: TuiyanPlanningNode[] = []
      let cursor = parentNode
      while (cursor?.parentId) {
        const parent = planningNodeMap.get(cursor.parentId)
        if (!parent) break
        ancestors.unshift(parent)
        cursor = parent
      }
      const lineage = [...ancestors, ...(parentNode ? [parentNode] : [])]

      const serializeNodeWithMeta = (n: TuiyanPlanningNode): string => {
        const parts: string[] = [`【${PLANNING_LEVEL_LABEL[n.level]}】${n.title}`]
        if (n.summary.trim()) parts.push(n.summary.trim())
        const meta = planningStructuredMetaByNodeId[n.id]
        if (meta) {
          const fields = STRUCTURED_FIELDS_BY_LEVEL[n.level]
          for (const f of fields) {
            const val = (meta[f.key] ?? "").trim()
            if (val) parts.push(`${f.label}：${val}`)
          }
        }
        return parts.join("\n")
      }

      const parentContext = parentNode ? serializeNodeWithMeta(parentNode) : ""
      const lineageContext = lineage.map(serializeNodeWithMeta).join("\n\n")

      const tpl = selectedPromptTemplateRef.current
      const promptCtx = renderPromptTemplate(tpl?.body ?? "", {
        work_title: (work?.title ?? workTitle).trim() || "未命名",
        work_tags: (work?.tags ?? []).join("，"),
        outline_node_title: parentNode?.title ?? "",
        outline_node_summary: parentNode?.summary ?? "",
        parent_context: parentContext,
        lineage_context: lineageContext,
        planning_level: PLANNING_LEVEL_LABEL[targetLevel],
        idea_text: planningIdea,
      }).trim()
      const header = [
        `作品：${(work?.title ?? workTitle).trim() || "未命名"}`,
        planningIdea.trim() ? `构思：${planningIdea.trim()}` : "",
        lineageContext ? `继承链上下文（后续推演必须服从上层约束）：\n${lineageContext}` : "",
        parentContext ? `父层上下文：\n${parentContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
      if (planningMode !== "template" || !tpl) return header
      return `${header}\n\n【模板(${tpl.title})】\n${promptCtx}`.trim()
    },
    [planningIdea, planningMode, planningNodeMap, planningStructuredMetaByNodeId, workId, workTitle, works],
  )

  /** 当前规划节点的序列化继承链上下文，供 AI 对话组件使用 */
  const planningContext = useMemo(
    () => planningSelectedNode ? makePlanningContext(planningSelectedNode.level, planningSelectedNode) : "",
    [planningSelectedNode, makePlanningContext],
  )

  const upsertPlanningMeta = useCallback(
    (nodeIds: string[], level: TuiyanPlanningLevel) => {
      const s = loadAiSettings()
      const model = AI_MODELS.find((m) => m.id === selectedModelId)
      const slot = PLANNING_LEVEL_TO_SLOT[level]
      const base: TuiyanPlanningMeta = {
        generatedAt: Date.now(),
        mode: planningMode,
        promptSlot: slot,
        provider: s.provider,
        modelId: model?.id ?? selectedModelId,
        templateId: selectedPromptTemplateRef.current?.id ?? null,
      }
      setPlanningMetaByNodeId((prev) => {
        const next = { ...prev }
        for (const id of nodeIds) next[id] = base
        return next
      })
    },
    [planningMode, selectedModelId],
  )

  const generatePlanningLevel = useCallback(
    async (level: TuiyanPlanningLevel, parentNode: TuiyanPlanningNode | null) => {
      if (!workId || useSamplePreview) return
      setPlanningError("")
      planningAbortRef.current?.abort()
      const ac = new AbortController()
      planningAbortRef.current = ac
      setPlanningBusyLevel(level)
      try {
        if (planningMode === "template" && !selectedPromptTemplateRef.current) {
          throw new TuiyanPlanningGenerateError("当前是模板高级模式，请先在顶部选择一个提示词模板。")
        }
        if (level === "master_outline") {
          if (!planningIdea.trim()) {
            throw new TuiyanPlanningGenerateError("请先填写「作品构思」，再生成总纲。")
          }
          const userInput = makePlanningContext("master_outline", null)
          const { items } = await generateTuiyanPlanningList({
            level: "master_outline",
            desiredCount: 1,
            userInput,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          const it0 = items[0]!
          // ── 字数校验：不含标点 >= 1000 字 ──────────────────────────────────
          const masterText = serializePlanningNodeForCount(
            it0.title, it0.summary, it0.structuredMeta as Record<string, string | undefined>,
          )
          const masterCharCount = countCharsNoPunct(masterText)
          if (masterCharCount < PLANNING_MIN_CHARS.masterOutlineNoPunct) {
            throw new TuiyanPlanningGenerateError(
              `总纲字数（${masterCharCount}字，不含标点）不足 ${PLANNING_MIN_CHARS.masterOutlineNoPunct} 字，请重试。`,
            )
          }
          const nodes: TuiyanPlanningNode[] = items.slice(0, 1).map((it, idx) => ({
            id: `plan-master-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: null,
            level: "master_outline",
            title: it.title.trim() || planningNodeTitleFallback("master_outline", idx),
            summary: it.summary.trim(),
            order: idx,
          }))
          setPlanningTree((prev) => {
            const oldMasterIds = new Set(prev.filter((n) => n.level === "master_outline").map((n) => n.id))
            const removeIds = new Set(oldMasterIds)
            let changed = true
            while (changed) {
              changed = false
              for (const node of prev) {
                if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
                  removeIds.add(node.id)
                  changed = true
                }
              }
            }
            return [...prev.filter((n) => !removeIds.has(n.id)), ...nodes]
          })
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "master_outline")
          const masterPatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) masterPatch[n.id] = sm
          })
          if (Object.keys(masterPatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...masterPatch }))
          }
          return
        }
        if (!parentNode) {
          throw new TuiyanPlanningGenerateError("请先选择父节点，再生成下一层。")
        }
        if (level === "outline") {
          const userInput = makePlanningContext("outline", parentNode)
          const { items } = await generateTuiyanPlanningList({
            level: "outline",
            desiredCount: 3,
            userInput,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          // ── 字数校验：三条合计含标点 >= 2000 字 ────────────────────────────
          const outlineCombinedText = items
            .map((it) => serializePlanningNodeForCount(it.title, it.summary, it.structuredMeta as Record<string, string | undefined>))
            .join("\n\n")
          const outlineCharCount = countCharsWithPunct(outlineCombinedText)
          if (outlineCharCount < PLANNING_MIN_CHARS.outlineTotalWithPunct) {
            throw new TuiyanPlanningGenerateError(
              `一级大纲合计字数（${outlineCharCount}字，含标点）不足 ${PLANNING_MIN_CHARS.outlineTotalWithPunct} 字，请重试。`,
            )
          }
          const nodes: TuiyanPlanningNode[] = items.map((it, idx) => ({
            id: `plan-outline-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "outline",
            title: it.title.trim() || planningNodeTitleFallback("outline", idx),
            summary: it.summary.trim(),
            order: idx,
          }))
          setPlanningTree((prev) => [
            ...prev.filter((n) => n.parentId !== parentNode.id || n.level !== "outline"),
            ...nodes,
          ])
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "outline")
          const outlinePatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) outlinePatch[n.id] = sm
          })
          if (Object.keys(outlinePatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...outlinePatch }))
          }
          return
        }
        if (level === "volume") {
          // ── 串行生成：每次只生成下一卷 ────────────────────────────────────
          const existingVolumes = listPlanningChildren(planningTree, parentNode.id, "volume")
          const nextVolumeOrder = existingVolumes.length
          if (nextVolumeOrder >= planningScale.volumeCount) {
            throw new TuiyanPlanningGenerateError(
              `本大纲已完成全部 ${planningScale.volumeCount} 卷卷纲，如需更多请在规模设置中调整目标卷数。`,
            )
          }
          const existingVolumeHint =
            existingVolumes.length > 0
              ? `已生成的卷（请在剧情上接续）：${existingVolumes.map((v) => v.title || `第${v.order + 1}卷`).join("、")}`
              : ""
          const userInput = [
            makePlanningContext("volume", parentNode),
            `本次任务：生成【第 ${nextVolumeOrder + 1} 卷】（该大纲段共规划 ${planningScale.volumeCount} 卷，每卷约 ${planningScale.chaptersPerVolume} 章节）。`,
            existingVolumeHint,
          ]
            .filter(Boolean)
            .join("\n\n")
          const { items } = await generateTuiyanPlanningList({
            level: "volume",
            desiredCount: 1,
            userInput,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          const volItem = items[0]!
          // ── 字数校验：含标点 >= 1500 字 ─────────────────────────────────
          const volText = serializePlanningNodeForCount(
            volItem.title, volItem.summary, volItem.structuredMeta as Record<string, string | undefined>,
          )
          const volCharCount = countCharsWithPunct(volText)
          if (volCharCount < PLANNING_MIN_CHARS.volumeWithPunct) {
            throw new TuiyanPlanningGenerateError(
              `第 ${nextVolumeOrder + 1} 卷卷纲字数（${volCharCount}字，含标点）不足 ${PLANNING_MIN_CHARS.volumeWithPunct} 字，请重试。`,
            )
          }
          const newVolNode: TuiyanPlanningNode = {
            id: `plan-volume-${Date.now()}-${nextVolumeOrder}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "volume",
            title: volItem.title.trim() || planningNodeTitleFallback("volume", nextVolumeOrder),
            summary: volItem.summary.trim(),
            order: nextVolumeOrder,
          }
          setPlanningTree((prev) => [...prev, newVolNode])
          setPlanningSelectedNodeId(newVolNode.id)
          upsertPlanningMeta([newVolNode.id], "volume")
          if (volItem.structuredMeta && Object.keys(volItem.structuredMeta).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, [newVolNode.id]: volItem.structuredMeta }))
          }
          return
        }
        if (level === "chapter_outline") {
          const userInput = makePlanningContext("chapter_outline", parentNode)
          const { items } = await generateTuiyanPlanningList({
            level: "chapter_outline",
            desiredCount: planningScale.chaptersPerVolume,
            userInput,
            settings: loadAiSettings(),
            signal: ac.signal,
          })
          const volumeChapters = chapters.filter((c) => c.volumeId === parentNode.id)
          const fallbackChapters = volumeChapters.length ? volumeChapters : chapters
          const nodes: TuiyanPlanningNode[] = items.map((it, idx) => ({
            id: `plan-chapter-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "chapter_outline",
            title: it.title.trim() || planningNodeTitleFallback("chapter_outline", idx),
            summary: it.summary.trim(),
            order: idx,
            chapterId: fallbackChapters[idx]?.id ?? null,
          }))
          setPlanningTree((prev) => [
            ...prev.filter((n) => n.parentId !== parentNode.id || n.level !== "chapter_outline"),
            ...nodes,
          ])
          setPlanningSelectedNodeId(nodes[0]?.id ?? null)
          upsertPlanningMeta(nodes.map((n) => n.id), "chapter_outline")
          const chapterPatch: Record<string, PlanningNodeStructuredMeta> = {}
          nodes.forEach((n, idx) => {
            const sm = items[idx]?.structuredMeta
            if (sm && Object.keys(sm).length) chapterPatch[n.id] = sm
          })
          if (Object.keys(chapterPatch).length) {
            setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, ...chapterPatch }))
          }
          return
        }
        const userInput = makePlanningContext("chapter_detail", parentNode)
        const { text, structuredMeta: detailMeta } = await generateTuiyanPlanningDetail({
          userInput,
          settings: loadAiSettings(),
          signal: ac.signal,
        })
        const existing = listPlanningChildren(planningTree, parentNode.id, "chapter_detail")[0]
        const detailNode: TuiyanPlanningNode =
          existing ?? {
            id: `plan-detail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            parentId: parentNode.id,
            level: "chapter_detail",
            title: `${parentNode.title}·详细细纲`,
            summary: "可直接写作的详细细纲",
            order: 0,
          }
        setPlanningTree((prev) => {
          if (existing) return prev
          return [...prev, detailNode]
        })
        setPlanningDraftsByNodeId((prev) => ({ ...prev, [detailNode.id]: text }))
        setPlanningSelectedNodeId(detailNode.id)
        upsertPlanningMeta([detailNode.id], "chapter_detail")
        if (detailMeta && Object.keys(detailMeta).some((k) => !!(detailMeta as Record<string, string>)[k])) {
          setPlanningStructuredMetaByNodeId((prev) => ({
            ...prev,
            [detailNode.id]: { ...prev[detailNode.id], ...detailMeta },
          }))
        }
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return
        if (e instanceof DOMException && e.name === "AbortError") return
        if (e instanceof Error && e.name === "AbortError") return
        const msg = e instanceof Error ? e.message : String(e)
        setPlanningError(msg)
      } finally {
        setPlanningBusyLevel(null)
        planningAbortRef.current = null
      }
    },
    [
      chapters,
      makePlanningContext,
      planningIdea,
      planningScale,
      planningTree,
      planningMode,
      upsertPlanningMeta,
      useSamplePreview,
      workId,
    ],
  )

  /** 重生成当前选中卷：删除旧卷及其章纲子节点，生成同序号的新卷 */
  const regenerateCurrentVolume = useCallback(async () => {
    if (!planningActiveOutline || !planningActiveVolume) return
    const volumeOrder = planningActiveVolume.order
    const volumeId = planningActiveVolume.id
    const removedIds = new Set<string>([volumeId])
    planningTree.forEach((n) => {
      if (n.parentId === volumeId) removedIds.add(n.id)
    })
    const siblingsKept = planningTree.filter(
      (n) => n.parentId === planningActiveOutline.id && n.level === "volume" && n.id !== volumeId,
    )
    const existingVolumeHint =
      siblingsKept.length > 0
        ? `已生成的其他卷（请在剧情上保持一致）：${siblingsKept.map((v) => v.title || `第${v.order + 1}卷`).join("、")}`
        : ""
    const userInput = [
      makePlanningContext("volume", planningActiveOutline),
      `本次任务：重新生成【第 ${volumeOrder + 1} 卷】（共规划 ${planningScale.volumeCount} 卷，每卷约 ${planningScale.chaptersPerVolume} 章节）。`,
      existingVolumeHint,
    ]
      .filter(Boolean)
      .join("\n\n")

    setPlanningError("")
    planningAbortRef.current?.abort()
    const ac = new AbortController()
    planningAbortRef.current = ac
    setPlanningBusyLevel("volume")
    try {
      const { items } = await generateTuiyanPlanningList({
        level: "volume",
        desiredCount: 1,
        userInput,
        settings: loadAiSettings(),
        signal: ac.signal,
      })
      const volItem = items[0]!
      const volText = serializePlanningNodeForCount(
        volItem.title, volItem.summary, volItem.structuredMeta as Record<string, string | undefined>,
      )
      const volCharCount = countCharsWithPunct(volText)
      if (volCharCount < PLANNING_MIN_CHARS.volumeWithPunct) {
        throw new TuiyanPlanningGenerateError(
          `重生成的第 ${volumeOrder + 1} 卷卷纲字数（${volCharCount}字，含标点）不足 ${PLANNING_MIN_CHARS.volumeWithPunct} 字，请重试。`,
        )
      }
      const newVolNode: TuiyanPlanningNode = {
        id: `plan-volume-${Date.now()}-${volumeOrder}-${Math.random().toString(36).slice(2, 7)}`,
        parentId: planningActiveOutline.id,
        level: "volume",
        title: volItem.title.trim() || planningNodeTitleFallback("volume", volumeOrder),
        summary: volItem.summary.trim(),
        order: volumeOrder,
      }
      setPlanningTree((prev) => [...prev.filter((n) => !removedIds.has(n.id)), newVolNode])
      setPlanningSelectedNodeId(newVolNode.id)
      upsertPlanningMeta([newVolNode.id], "volume")
      if (volItem.structuredMeta && Object.keys(volItem.structuredMeta).length) {
        setPlanningStructuredMetaByNodeId((prev) => ({ ...prev, [newVolNode.id]: volItem.structuredMeta }))
      }
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return
      if (e instanceof DOMException && e.name === "AbortError") return
      if (e instanceof Error && e.name === "AbortError") return
      setPlanningError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlanningBusyLevel(null)
      planningAbortRef.current = null
    }
  }, [
    makePlanningContext,
    planningActiveOutline,
    planningActiveVolume,
    planningScale,
    planningTree,
    upsertPlanningMeta,
  ])

  const updatePlanningNodeDraft = useCallback((nodeId: string, value: string) => {
    setPlanningDraftsByNodeId((prev) => ({ ...prev, [nodeId]: value }))
  }, [])

  const updatePlanningNodeSummary = useCallback((nodeId: string, value: string) => {
    setPlanningTree((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, summary: value } : n)),
    )
  }, [])

  const updatePlanningNodeTitle = useCallback((nodeId: string, value: string) => {
    setPlanningTree((prev) => prev.map((n) => (n.id === nodeId ? { ...n, title: value } : n)))
  }, [])

  const updatePlanningNodeStructuredMeta = useCallback(
    (nodeId: string, patch: Partial<PlanningNodeStructuredMeta>) => {
      setPlanningStructuredMetaByNodeId((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], ...patch },
      }))
    },
    [],
  )

  const executePlanningDelete = useCallback((target: NonNullable<PlanningDeleteTarget>) => {
    if (target.type === "all") {
      setPlanningTree([])
      setPlanningDraftsByNodeId({})
      setPlanningMetaByNodeId({})
      setPlanningStructuredMetaByNodeId({})
      setPlanningSelectedNodeId(null)
      return
    }
    // 收集该节点及所有后代 id
    setPlanningTree((prev) => {
      const toRemove = new Set<string>([target.nodeId])
      let changed = true
      while (changed) {
        changed = false
        for (const n of prev) {
          if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
            toRemove.add(n.id)
            changed = true
          }
        }
      }
      setPlanningDraftsByNodeId((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !toRemove.has(k))))
      setPlanningMetaByNodeId((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !toRemove.has(k))))
      setPlanningStructuredMetaByNodeId((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !toRemove.has(k))))
      setPlanningSelectedNodeId((cur) => (cur && toRemove.has(cur) ? null : cur))
      return prev.filter((n) => !toRemove.has(n.id))
    })
  }, [])

  const doPushPlanningTree = useCallback(async () => {
    if (!workId || planningPushCandidates.length === 0) return
    const pushedAt = Date.now()
    const nextEntries: TuiyanPushedOutlineEntry[] = planningPushCandidates.map((candidate) => ({
      id: candidate.id,
      parentId: candidate.parentId,
      level: candidate.level,
      order: candidate.order,
      title: candidate.title,
      content: candidate.content,
      pushedAt,
      structuredMeta: planningStructuredMetaByNodeId[candidate.id] ?? undefined,
    }))
    await upsertTuiyanState(workId, { planningPushedOutlines: nextEntries })
    setPlanningError("")
  }, [planningPushCandidates, planningStructuredMetaByNodeId, workId])

  const pushPlanningTreeToWriter = useCallback(async () => {
    if (!workId) return
    if (planningPushCandidates.length === 0) {
      setPlanningError("当前规划树为空，请先生成总纲/大纲/卷纲/细纲。")
      return
    }
    const previousState = await getTuiyanState(workId)
    const hadPrevious = (previousState?.planningPushedOutlines?.length ?? 0) > 0
    if (hadPrevious) {
      setPushOverwriteConfirmOpen(true)
      return
    }
    await doPushPlanningTree()
  }, [doPushPlanningTree, planningPushCandidates.length, workId])

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
      const needle = draft.trim().slice(0, 80)
      if (needle) {
        writeEditorHitHandoff({
          workId,
          chapterId: ch.id,
          query: needle,
          isRegex: false,
          offset: 0,
          source: { module: "tuiyan", title: "推演写回草稿", hint: selectedNode?.title ? `节点：${selectedNode.title}` : undefined },
        })
        navigate(`/work/${workLinkSeg ?? workId}?hit=1&chapter=${encodeURIComponent(ch.id)}`)
      } else {
        navigate(`/work/${workLinkSeg ?? workId}?chapter=${encodeURIComponent(ch.id)}`)
      }
    },
    [workId, workLinkSeg, navigate, resolveChapterForJump, appendAssistant, selectedNode?.title],
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


  // 置顶文策
  const handlePinWenCe = (id: string) => {
    setWenCe(
      wenCe.map((entry) =>
        entry.id === id ? { ...entry, isPinned: !entry.isPinned } : entry
      )
    )
  }

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
      <div className="flex h-dvh items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="flex h-dvh flex-col bg-background">
      <Dialog open={planningIdeaDialogOpen} onOpenChange={setPlanningIdeaDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/40 px-6 py-4 text-left">
            <DialogTitle>作品构思</DialogTitle>
            <DialogDescription>
              可粘贴多段、几千字长文。关闭本窗口后内容会保留在右侧详情区，并随作品自动保存。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-2 px-6 pb-4 pt-2">
            <Textarea
              value={planningIdea}
              onChange={(e) => setPlanningIdea(e.target.value)}
              placeholder="梗概、人设、矛盾、卷线、结局走向等均可写在这里…"
              className="min-h-[min(55vh,480px)] w-full resize-y text-sm leading-relaxed"
              disabled={!workId || useSamplePreview}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>约 {planningIdea.length} 字</span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setPlanningIdeaDialogOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <TuiyanPlanningPushDialog
        open={planningPushDialogOpen}
        onOpenChange={setPlanningPushDialogOpen}
        candidates={planningPushCandidates}
        onConfirmPush={pushPlanningTreeToWriter}
      />

      <AlertDialog open={pushOverwriteConfirmOpen} onOpenChange={setPushOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>覆盖章纲快照</AlertDialogTitle>
            <AlertDialogDescription>
              写作页左侧「章纲」栏已有上一次推送的五层快照，继续推送会整体覆盖旧的快照。
              <br /><br />
              这只会更新「章纲」栏，不会动「章节正文」。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void doPushPlanningTree()
              }}
            >
              确认覆盖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Top Toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-border/40 px-4">
        <div className="flex items-center gap-3">
          {/* 返回主页（图标） */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => navigate("/library")}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>返回主页</TooltipContent>
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
          </div>
        </div>

        <div className="flex items-center gap-2">
          {workLinkSeg && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-base leading-none" asChild>
                    <Link to={`/work/${workLinkSeg}`} aria-label="返回写作">
                      <PersonStanding className="h-4 w-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>返回写作</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

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

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Outline Tree */}
        {showLeftPanel && (
          <div
            className="flex h-full min-h-0 min-w-[18rem] flex-shrink-0 flex-col border-r border-border/40 bg-card/20"
            style={{ width: `${leftPanelWidth}px` }}
          >
            <div className="flex min-h-0 items-center gap-2 border-b border-border/40 px-2 py-1.5">
              <p className="shrink-0 text-xs font-medium text-foreground">规划章纲</p>
              <div className="min-w-0 flex-1">
                <TuiyanPlanningStatsInline
                  masterCount={planningMasterTotal}
                  outlineCount={planningOutlineNodes.length}
                  volumeCount={planningVolumeTotal}
                  chapterOutlineCount={planningChapterOutlineTotal}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                type="button"
                title="收起左侧栏"
                onClick={() => setShowLeftPanel(false)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              <div className="p-2 pb-3">
                <TuiyanPlanningTree
                  tree={planningTree}
                  selectedId={planningSelectedNodeId}
                  onSelectNode={selectPlanningNode}
                  expandedById={planningExpandedById}
                  onToggleExpand={togglePlanningExpand}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        {showLeftPanel && (
          <div
            className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整左侧栏宽度"
            title="拖拽调整宽度；双击恢复默认"
            onMouseDown={(e) => {
              e.preventDefault()
              beginPanelDrag("left", e.clientX)
            }}
            onDoubleClick={resetLeftPanelWidth}
          />
        )}

        {!showLeftPanel && (
          <div className="flex w-8 shrink-0 items-start border-r border-border/40 bg-card/10 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="mx-auto h-7 w-7 p-0"
              type="button"
              title="展开左侧栏"
              onClick={() => setShowLeftPanel(true)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Center Panel - Detail/Mindmap/WenCe */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeTab === "outline" && planningSelectedNode && (
            <ScrollArea className="min-h-0 flex-1">
              <TuiyanPlanningNodeCenterEditor
                node={planningSelectedNode}
                meta={planningMetaByNodeId[planningSelectedNode.id]}
                structuredMeta={planningStructuredMetaByNodeId[planningSelectedNode.id]}
                draftText={planningSelectedDraft}
                disabled={!workId || useSamplePreview}
                planningBusyLevel={planningBusyLevel}
                parentChapterNode={
                  planningSelectedNode.level === "chapter_detail" && planningSelectedNode.parentId
                    ? (planningNodeMap.get(planningSelectedNode.parentId) ?? null)
                    : null
                }
                onTitleChange={updatePlanningNodeTitle}
                onSummaryChange={updatePlanningNodeSummary}
                onDraftChange={updatePlanningNodeDraft}
                onStructuredMetaChange={updatePlanningNodeStructuredMeta}
                onRegenerateChapterDetail={(chapterNode) => void generatePlanningLevel("chapter_detail", chapterNode)}
              />
            </ScrollArea>
          )}
          {activeTab === "outline" && !planningSelectedNode && useSamplePreview && selectedNode && (
            <ScrollArea className="min-h-0 flex-1">
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
                    onClick={() => workId && navigate(`/work/${workLinkSeg ?? workId}`)}
                  >
                    <ArrowRight className="h-4 w-4" />
                    进入生辉
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
          {activeTab === "outline" && !planningSelectedNode && workId && !useSamplePreview && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <List className="h-10 w-10 opacity-40" />
              <p>请从左侧规划树选择节点。</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/90">
                作品构思与「生成总纲 / 一级大纲 / 卷纲 / 章纲」在右侧辅助栏「详情」顶部；本页中间用于编辑当前选中节点的摘要与细纲。
              </p>
              {outline.length === 0 ? (
                <p className="max-w-sm text-xs leading-relaxed">
                  当前作品尚无写作卷章，不影响在此做五层规划；需要导图或推送正文时，请先在写作页创建卷与章节。
                </p>
              ) : null}
            </div>
          )}
          {activeTab === "outline" && !planningSelectedNode && !workId && !useSamplePreview && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <BookOpen className="h-10 w-10 opacity-40" />
              <p>请从顶部选择作品以开始推演。</p>
            </div>
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
            <ScrollArea className="min-h-0 flex-1">
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
          <>
          <div
            className="group relative z-10 w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整右侧栏宽度"
            title="拖拽调整宽度；双击恢复默认"
            onMouseDown={(e) => {
              e.preventDefault()
              beginPanelDrag("right", e.clientX)
            }}
            onDoubleClick={resetRightPanelWidth}
          />
          <div
            className="flex min-h-0 flex-shrink-0 flex-col border-l border-border/40 bg-card/20 overflow-hidden"
            style={{ width: `${rightPanelWidth}px` }}
          >
            {/* Panel Tabs */}
            <div className="flex items-center border-b border-border/40">
              <div className="flex h-[45px] w-10 shrink-0 items-center justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  type="button"
                  title="收起右侧栏"
                  onClick={() => setShowRightPanel(false)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
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
              <TuiyanChatPanel
                planningSelectedNode={planningSelectedNode}
                outlineNodeTitle={selectedNode?.title ?? null}
                chatHistory={chatHistory}
                isGenerating={isGenerating}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSend={(text) => {
                  const msg: ChatMessage = {
                    id: `m${Date.now()}`,
                    role: "user",
                    content: text,
                    timestamp: new Date(),
                    relatedOutlineId: selectedOutlineId ?? undefined,
                  }
                  setChatHistory((prev) => [...prev, msg])
                  setChatInput("")
                  setRightPanelTab("chat")
                  void runBranchPredict(text, planningContext)
                }}
                onWriteToDraft={writeToAiPanelDraftAndOpenEditor}
                onGoWence={goWenceWithPrefill}
                chatScrollRef={chatScrollRef}
              />
            )}

            {rightPanelTab === "reference" && (
              <TuiyanReferencePanel
                linkedRefWorkIds={linkedRefWorkIds}
                refLibrary={refLibrary}
                currentNodeKeywords={planningSelectedNode?.title ?? selectedNode?.title ?? ""}
                onLinkRef={(id) => setLinkedRefWorkIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                onUnlinkRef={(id) => setLinkedRefWorkIds((prev) => prev.filter((x) => x !== id))}
                onApplyToOutline={(r) => { void applyRefToOutline(r) }}
                onInjectToChat={(text) => {
                  setChatInput((prev) => prev ? `${prev}\n\n【参考段落】\n${text}` : `【参考段落】\n${text}`)
                  setRightPanelTab("chat")
                }}
              />
            )}

            {rightPanelTab === "detail" && (
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4 space-y-4">
                  <TuiyanPlanningUnifiedPanel
                    workId={workId}
                    useSamplePreview={useSamplePreview}
                    planningMode={planningMode}
                    onPlanningModeChange={setPlanningMode}
                    planningIdea={planningIdea}
                    onPlanningIdeaChange={setPlanningIdea}
                    onOpenBigIdeaDialog={() => setPlanningIdeaDialogOpen(true)}
                    selectedPromptTemplate={selectedPromptTemplate}
                    onPickPromptTemplate={setSelectedPromptTemplate}
                    onClearPromptTemplate={() => setSelectedPromptTemplate(null)}
                    planningBusyLevel={planningBusyLevel}
                    planningError={planningError}
                    planningMasterTotal={planningMasterTotal}
                    planningOutlineNodesLength={planningOutlineNodes.length}
                    planningVolumeTotal={planningVolumeTotal}
                    planningChapterOutlineTotal={planningChapterOutlineTotal}
                    planningSelectedNode={planningSelectedNode}
                    planningSelectedMeta={planningSelectedNode ? planningMetaByNodeId[planningSelectedNode.id] : undefined}
                    planningActiveOutline={planningActiveOutline}
                    planningActiveVolume={planningActiveVolume}
                    onUpdateSelectedNodeSummary={updatePlanningNodeSummary}
                    onOpenPushDialog={() => setPlanningPushDialogOpen(true)}
                    onGenerateMasterOutline={() => void generatePlanningLevel("master_outline", null)}
                    onGenerateOutline={() => {
                      if (planningActiveMaster) void generatePlanningLevel("outline", planningActiveMaster)
                    }}
                    onGenerateVolumeForActiveOutline={() => {
                      if (planningActiveOutline) void generatePlanningLevel("volume", planningActiveOutline)
                    }}
                    onGenerateChapterOutlinesForActiveVolume={() => {
                      if (planningActiveVolume) void generatePlanningLevel("chapter_outline", planningActiveVolume)
                    }}
                    planningScale={planningScale}
                    onPlanningScaleChange={handlePlanningScaleChange}
                    volumeCountForActiveOutline={volumeCountForActiveOutline}
                    onGenerateVolume={(node) => void generatePlanningLevel("volume", node)}
                    onRegenerateMasterOutline={() => void generatePlanningLevel("master_outline", null)}
                    onRegenerateOutlineRoot={() => {
                      if (planningActiveMaster) void generatePlanningLevel("outline", planningActiveMaster)
                    }}
                    onGenerateChapterOutlines={(node) => void generatePlanningLevel("chapter_outline", node)}
                    onRegenerateVolume={() => void regenerateCurrentVolume()}
                    onGenerateChapterDetail={(node) => void generatePlanningLevel("chapter_detail", node)}
                    onRegenerateChapterOutlines={() => {
                      if (planningActiveVolume) void generatePlanningLevel("chapter_outline", planningActiveVolume)
                    }}
                    onDeleteSelectedNode={() => {
                      if (!planningSelectedNode) return
                      setPlanningDeleteTarget({
                        type: "node",
                        nodeId: planningSelectedNode.id,
                        nodeTitle: planningSelectedNode.title || PLANNING_LEVEL_LABEL[planningSelectedNode.level],
                      })
                    }}
                    onClearAllPlanning={() => setPlanningDeleteTarget({ type: "all" })}
                  />
                  {selectedNode && selectedNode.children && selectedNode.children.length > 0 && (
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
                </div>
              </ScrollArea>
            )}
          </div>
          </>
        )}

        {!showRightPanel && (
          <div className="flex w-8 shrink-0 items-start border-l border-border/40 bg-card/10 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="mx-auto h-7 w-7 p-0"
              type="button"
              title="展开右侧栏"
              onClick={() => setShowRightPanel(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>

    <PlanningDeleteConfirmDialog
      target={planningDeleteTarget}
      onConfirm={(target) => {
        executePlanningDelete(target)
        setPlanningDeleteTarget(null)
      }}
      onCancel={() => setPlanningDeleteTarget(null)}
    />
    </>
  )
}
