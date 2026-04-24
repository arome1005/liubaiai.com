import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import {
  listInspirationCollections,
  listInspirationFragments,
  deleteInspirationFragment,
  addInspirationCollection,
  addInspirationFragment,
  updateInspirationFragment,
  importAllDataMerge,
  listWorks,
  getWork,
  listChapters,
  deleteInspirationCollection,
  updateInspirationCollection,
} from "../db/repo";
import type { InspirationCollection, InspirationFragment, InspirationLink } from "../db/types";
import { SCHEMA_VERSION } from "../db/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";
import {
  loadInspirationFavoriteIds,
} from "../util/inspiration-favorites";
import { clearInspirationFavoriteIds } from "../util/inspiration-favorites";
import { normalizeWorkTagList } from "../util/work-tags";
import { buildInspirationBackupZip, parseInspirationBackupFile } from "../storage/inspiration-backup";
import {
  writeInspirationTransferHandoff,
  type InspirationTransferMode,
} from "../util/inspiration-transfer-handoff";
import { fetchUrlPreview, hostnameFromUrl } from "../util/url-preview";
import { workPathSegment } from "../util/work-url";
import { createSpeechRecognizer } from "../util/speech-recognition";
import { readInspirationReturnState, clearInspirationReturnState, writeInspirationReturnState } from "../util/inspiration-return";
import { generateInspirationFiveExpansions, InspirationExpandError } from "../ai/inspiration-expand";
import {
  INSPIRATION_EXPAND_HANDOFF_KEY,
  INSPIRATION_DRAFT_EXPAND_SOURCE_ID,
  parseInspirationExpandHandoff,
} from "../util/inspiration-expand-handoff";
import { loadAiSettings } from "../ai/storage";
import {
  Lightbulb,
  Plus,
  Search,
  Filter,
  Grid3X3,
  List,
  Folder,
  Mic,
  FileText,
  Image,
  Quote,
  Sparkles,
  Star,
  Trash2,
  Edit3,
  ChevronDown,
  MoreHorizontal,
  LayoutGrid,
  Type,
  Headphones,
  Bookmark,
  Zap,
  Check,
  Upload,
  Shuffle,
  X,
  Send,
  Tag,
  Link2,
  Lock,
  Archive,
  Download,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { TooltipProvider } from "../components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

/** 内部标签前缀：用于 UI「类型」筛选，不在卡片上展示 */
const KIND_TAG_PREFIX = "lb-kind:";
/** 内置示例标记：用于"一键清除示例" */
const DEMO_TAG = "lb-demo:1";
const LS_INSP_DEMO_SEEDED = "liubai:inspirationDemoSeeded:v1";
const LS_INSP_DEMO_DISABLED = "liubai:inspirationDemoDisabled:v1";
const LS_INSP_VIEW_STATE = "liubai:inspirationViewState:v1";

type InspirationViewState = {
  viewMode: "grid" | "list" | "masonry";
  density: "comfortable" | "cozy" | "compact";
  searchQuery: string;
  selectedType: string;
  selectedCollection: string | null;
  selectedTag: string | null;
  showFavoritesOnly: boolean;
};

function loadInspirationViewState(): InspirationViewState | null {
  try {
    const raw = localStorage.getItem(LS_INSP_VIEW_STATE);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<InspirationViewState>;
    const okView = j.viewMode === "grid" || j.viewMode === "list" || j.viewMode === "masonry";
    const okDensity = j.density === "comfortable" || j.density === "cozy" || j.density === "compact";
    if (!okView || !okDensity) return null;
    return {
      viewMode: j.viewMode,
      density: j.density,
      searchQuery: typeof j.searchQuery === "string" ? j.searchQuery : "",
      selectedType: typeof j.selectedType === "string" ? j.selectedType : "all",
      selectedCollection: typeof j.selectedCollection === "string" ? j.selectedCollection : null,
      selectedTag: typeof j.selectedTag === "string" ? j.selectedTag : null,
      showFavoritesOnly: !!j.showFavoritesOnly,
    };
  } catch {
    return null;
  }
}

function saveInspirationViewState(s: InspirationViewState): void {
  try {
    localStorage.setItem(LS_INSP_VIEW_STATE, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const V0_DEMO_COLLECTIONS = [
  { name: "凌云志素材", sortOrder: 0 },
  { name: "人物灵感", sortOrder: 1 },
  { name: "世界观设定", sortOrder: 2 },
  { name: "对话片段", sortOrder: 3 },
  { name: "未分类", sortOrder: 4 },
] as const;

const V0_DEMO_FRAGMENTS: Array<{
  kind: "text" | "voice" | "image" | "quote" | "idea" | "bookmark";
  title?: string;
  body: string;
  tags: string[];
  collectionName?: (typeof V0_DEMO_COLLECTIONS)[number]["name"];
  isFavorite?: boolean;
}> = [
  {
    kind: "text",
    title: "角色心理转变",
    body: "主角在得知真相后的反应不应该是愤怒，而是一种更深层的悲伤和自我怀疑。这样可以让角色更加立体，也为后续的成长埋下伏笔。",
    tags: ["人物", "情感"],
    collectionName: "人物灵感",
    isFavorite: true,
  },
  {
    kind: "quote",
    title: "关于自我认知",
    body: "人最难的不是认识别人，而是认识自己。我们总是在别人身上看到自己的影子，却不愿意承认那就是自己。\n\n——《人间失格》太宰治",
    tags: ["情感", "人物"],
    collectionName: "人物灵感",
    isFavorite: true,
  },
  {
    kind: "idea",
    title: "修仙体系新解读",
    body: "如果修仙世界的「道」其实是一种高维信息体，修炼的本质是让自己的意识能够解码这种信息？这样可以解释为什么顿悟如此重要。",
    tags: ["世界观", "设定"],
    collectionName: "世界观设定",
  },
  {
    kind: "voice",
    title: "反派角色塑造（语音）",
    body: "（语音碎片示例）关于反派动机的思考：他不是为了毁灭世界，而是为了重建一个他认为更公平的世界。他的方法是错误的，但他的初衷是可以理解的。",
    tags: ["人物", "冲突"],
    collectionName: "人物灵感",
  },
  {
    kind: "bookmark",
    title: "叙事节奏研究（书签）",
    body: "（书签示例）这篇关于叙事节奏的文章非常有参考价值，特别是关于「张弛有度」的部分，可以用在连载节奏控制上。\n\n来源：https://example.com/narrative-pacing",
    tags: ["剧情", "伏笔"],
    collectionName: "凌云志素材",
  },
  {
    kind: "text",
    title: "师徒对话片段",
    body: "「师父，为什么您总说修行如逆水行舟？」\n「因为顺流而下的，从来不是你自己选择的方向。」\n\n这段对话可以用在入门时的场景，为后续选择做铺垫。",
    tags: ["对话", "伏笔"],
    collectionName: "对话片段",
    isFavorite: true,
  },
] as const;

const inspirationTypes = [
  { id: "all", label: "全部", icon: LayoutGrid },
  { id: "text", label: "文字", icon: Type },
  { id: "voice", label: "语音", icon: Headphones },
  { id: "image", label: "图片", icon: Image },
  { id: "quote", label: "引用", icon: Quote },
  { id: "idea", label: "想法", icon: Sparkles },
  { id: "bookmark", label: "书签", icon: Bookmark },
];

function inspirationKindFromFragment(f: InspirationFragment): string {
  const hit = f.tags.find((t) => t.startsWith(KIND_TAG_PREFIX));
  const id = hit?.slice(KIND_TAG_PREFIX.length);
  if (id && inspirationTypes.some((x) => x.id === id && x.id !== "all")) return id;
  return "text";
}

function visibleTagsForFragment(f: InspirationFragment): string[] {
  return f.tags.filter((t) => !t.startsWith(KIND_TAG_PREFIX));
}

function kindAccentClasses(kindId: string): { iconWrap: string; icon: string; chipOn: string; chipOff: string } {
  // 目标：接近 v0UI 的"按类型上色"，并在暗色模式下保持对比度
  switch (kindId) {
    case "voice":
      return {
        iconWrap: "bg-emerald-500/15",
        icon: "text-emerald-600 dark:text-emerald-400",
        chipOn: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        chipOff: "hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400",
      };
    case "image":
      return {
        iconWrap: "bg-purple-500/15",
        icon: "text-purple-600 dark:text-purple-400",
        chipOn: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
        chipOff: "hover:bg-purple-500/10 hover:text-purple-600 dark:hover:text-purple-400",
      };
    case "quote":
      return {
        iconWrap: "bg-amber-500/15",
        icon: "text-amber-700 dark:text-amber-400",
        chipOn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        chipOff: "hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400",
      };
    case "idea":
      return {
        iconWrap: "bg-cyan-500/15",
        icon: "text-cyan-700 dark:text-cyan-400",
        chipOn: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
        chipOff: "hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-400",
      };
    case "bookmark":
      return {
        iconWrap: "bg-rose-500/15",
        icon: "text-rose-600 dark:text-rose-400",
        chipOn: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
        chipOff: "hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400",
      };
    case "text":
    default:
      return {
        iconWrap: "bg-blue-500/15",
        icon: "text-blue-600 dark:text-blue-400",
        chipOn: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
        chipOff: "hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400",
      };
  }
}

function tagAccentClasses(tag: string): string {
  const t = tag.trim();
  // v0UI tagSuggestions 的中文映射（与 demo tags 对齐）
  if (t === "剧情") return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
  if (t === "人物") return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
  if (t === "对话") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (t === "设定") return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  if (t === "情感") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (t === "冲突") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (t === "世界观") return "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300";
  if (t === "伏笔") return "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300";
  return "bg-muted/50 text-muted-foreground";
}

function collectionDotClasses(name: string): string {
  // v0UI mockFolders 色系（近似）
  if (name === "凌云志素材") return "bg-blue-500";
  if (name === "人物灵感") return "bg-purple-500";
  if (name === "世界观设定") return "bg-amber-500";
  if (name === "对话片段") return "bg-emerald-500";
  if (name === "未分类") return "bg-muted-foreground/60";
  return "bg-muted-foreground/60";
}

function InspirationCard({
  fragment,
  kindId,
  isFavorite,
  onEdit,
  onDelete,
  onToggleFavorite,
  onExpand,
  onTransfer,
  bulkMode,
  selected,
  onToggleSelect,
  density,
  masonryItem,
}: {
  fragment: InspirationFragment;
  kindId: string;
  isFavorite: boolean;
  onEdit: (fragment: InspirationFragment) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onExpand: (fragment: InspirationFragment) => void;
  onTransfer: (fragment: InspirationFragment) => void;
  bulkMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  density: "comfortable" | "cozy" | "compact";
  masonryItem: boolean;
}) {
  const typeConfig = inspirationTypes.find((t) => t.id === kindId) || inspirationTypes[1];
  const TypeIcon = typeConfig.icon;
  const displayTags = visibleTagsForFragment(fragment);
  const accent = kindAccentClasses(kindId);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border/40 bg-card/50 transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5",
        density === "comfortable" ? "p-4" : density === "cozy" ? "p-3" : "p-2",
        masonryItem ? "mb-4 break-inside-avoid" : "",
        bulkMode && selected ? "ring-2 ring-primary/40" : "",
      )}
      onClick={() => {
        if (bulkMode) onToggleSelect(fragment.id);
      }}
      role={bulkMode ? "button" : undefined}
      tabIndex={bulkMode ? 0 : undefined}
      onKeyDown={(e) => {
        if (!bulkMode) return;
        if (e.key === "Enter" || e.key === " ") onToggleSelect(fragment.id);
      }}
    >
      {bulkMode ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(fragment.id);
          }}
          className={cn(
            "absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border",
            selected
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background",
          )}
          aria-label={selected ? "取消选择" : "选择"}
        >
          {selected ? <Check className="h-4 w-4" /> : null}
        </button>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", accent.iconWrap)}>
            <TypeIcon className={cn("h-3.5 w-3.5", accent.icon)} />
          </div>
          <span className="text-xs text-muted-foreground">{typeConfig.label}</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
            bulkMode ? "pointer-events-none opacity-0" : "",
          )}
        >
          <button
            type="button"
            onClick={() => onToggleFavorite(fragment.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
          >
            <Star
              className={cn(
                "h-4 w-4",
                isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => onEdit(fragment)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
          >
            <Edit3 className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(fragment.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex-1">
        <p
          className={cn(
            density === "compact" ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
            "text-foreground line-clamp-4",
          )}
        >
          {fragment.body}
        </p>
      </div>

      {displayTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {displayTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className={cn("h-5 px-1.5 text-[10px] font-normal", tagAccentClasses(tag))}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(fragment.createdAt)}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => onTransfer(fragment)}>
            <Send className="h-3 w-3" />
            转入写作
          </Button>
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => onExpand(fragment)}>
            <Zap className="h-3 w-3" />
            扩容
          </Button>
        </div>
      </div>
    </div>
  );
}

function RandomInspirationCard({ fragments }: { fragments: InspirationFragment[] }) {
  const [idx, setIdx] = useState(0);
  const list = fragments.length ? fragments : [];
  const cur = list[idx % Math.max(1, list.length)];
  if (!cur) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">随机灵感</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2"
          onClick={() => {
            if (!list.length) return;
            setIdx(Math.floor(Math.random() * list.length));
          }}
        >
          <Shuffle className="h-3.5 w-3.5" />
          换一个
        </Button>
      </div>
      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{cur.body}</p>
    </div>
  );
}

function SidebarQuickCapture({
  onCapture,
}: {
  onCapture: (kind: "text" | "voice", body: string) => Promise<void> | void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [activeType, setActiveType] = useState<"text" | "voice">("text");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const [voiceSupported] = useState(() => !!createSpeechRecognizer());
  const [voiceOn, setVoiceOn] = useState(false);

  const handleSubmit = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    await onCapture(activeType, text);
    setBody("");
    setIsExpanded(false);
  }, [activeType, body, onCapture]);

  useEffect(() => {
    if (!isExpanded) {
      setVoiceOn(false);
      if (recRef.current) {
        try {
          recRef.current.onresult = null;
          recRef.current.onerror = null;
          recRef.current.onend = null;
          recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }, [isExpanded]);

  const toggleVoice = useCallback(() => {
    if (!voiceSupported) return;
    if (!recRef.current) recRef.current = createSpeechRecognizer({ lang: "zh-CN", interimResults: true });
    const rec = recRef.current;
    if (!rec) return;
    if (voiceOn) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setVoiceOn(false);
      return;
    }
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
      }
      if (text.trim().length) {
        setBody((prev) => {
          const base = prev.trim();
          return base.length ? `${base} ${text.trim()}` : text.trim();
        });
      }
    };
    rec.onerror = () => setVoiceOn(false);
    rec.onend = () => setVoiceOn(false);
    try {
      rec.start();
      setVoiceOn(true);
    } catch {
      setVoiceOn(false);
    }
  }, [voiceOn, voiceSupported]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 bg-card/50 transition-all duration-300",
        isExpanded ? "shadow-lg" : "",
      )}
    >
      {!isExpanded ? (
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
            window.setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">捕捉灵感...</p>
            <p className="text-xs text-muted-foreground/60 truncate">随时记录你的想法、引用、语音备忘</p>
          </div>
          <div className="flex gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Mic className="h-4 w-4" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <Image className="h-4 w-4" />
            </div>
          </div>
        </button>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveType("text")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all",
                activeType === "text" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <FileText className="h-4 w-4" />
              文字
            </button>
            <button
              type="button"
              onClick={() => setActiveType("voice")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all",
                activeType === "voice" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Mic className="h-4 w-4" />
              语音
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50"
              title="收起"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activeType === "text" ? (
            <>
              <Textarea
                ref={(el) => {
                  inputRef.current = el;
                }}
                placeholder="记录你的灵感..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[100px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" title="添加标签（待接）">
                    <Tag className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" title="关联作品（待接）">
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" title="添加图片（待接）">
                    <Image className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={!body.trim()} className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  保存
                </Button>
              </div>
            </>
          ) : (
            <>
              <Textarea
                ref={(el) => {
                  inputRef.current = el;
                }}
                placeholder={voiceSupported ? "开始语音转写或手动输入…" : "当前浏览器不支持语音识别，请手动输入…"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[100px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={voiceOn ? "default" : "outline"}
                    onClick={() => toggleVoice()}
                    disabled={!voiceSupported}
                    className="gap-1.5"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    {voiceSupported ? (voiceOn ? "停止转写" : "开始转写") : "不支持语音"}
                  </Button>
                  <span className="text-xs text-muted-foreground">不上传音频，仅保存转写文本</span>
                </div>
                <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={!body.trim()} className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  保存
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function InspirationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fragments, setFragments] = useState<InspirationFragment[]>([]);
  const [collections, setCollections] = useState<InspirationCollection[]>([]);
  // legacy: 收藏曾是本机 localStorage（favoriteIds）；现已迁移为 fragment.isFavorite
  const legacyFavoriteIdsRef = useRef<Set<string>>(loadInspirationFavoriteIds());
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"grid" | "list" | "masonry">("grid");
  const [density, setDensity] = useState<"comfortable" | "cozy" | "compact">("comfortable");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureContent, setQuickCaptureContent] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InspirationFragment | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSourceName, setEditSourceName] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editWorkId, setEditWorkId] = useState<string | null>(null);
  const [editCollectionId, setEditCollectionId] = useState<string | null>(null);
  const [editIsFavorite, setEditIsFavorite] = useState(false);
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [editArchived, setEditArchived] = useState(false);
  const [urlPreviewBusy, setUrlPreviewBusy] = useState(false);
  const [editLinks, setEditLinks] = useState<InspirationLink[]>([]);
  const [newLinkType, setNewLinkType] = useState<InspirationLink["type"]>("character");
  const [newLinkName, setNewLinkName] = useState("");

  const [bulkTagsOpen, setBulkTagsOpen] = useState(false);
  const [bulkTagsValue, setBulkTagsValue] = useState("");
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveCollectionId, setBulkMoveCollectionId] = useState<string | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<InspirationFragment | null>(null);
  const [transferWorks, setTransferWorks] = useState<Array<{ id: string; title: string }>>([]);
  const [transferWorkId, setTransferWorkId] = useState<string>("");
  const [transferChapters, setTransferChapters] = useState<Array<{ id: string; title: string }>>([]);
  const [transferChapterId, setTransferChapterId] = useState<string>("");
  const [transferMode, setTransferMode] = useState<InspirationTransferMode>("insertCursor");

  // 从写作页回跳：恢复筛选/视图状态
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("restore") !== "1") return;
    const s = readInspirationReturnState();
    clearInspirationReturnState();
    if (s) {
      setSearchQuery(s.searchQuery);
      setSelectedType(s.selectedType);
      setSelectedCollection(s.selectedCollection);
      setSelectedTag(s.selectedTag);
      setShowFavoritesOnly(s.showFavoritesOnly);
      setViewMode(s.viewMode);
      setDensity(s.density);
    }
    sp.delete("restore");
    const q = sp.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // 常驻：记忆筛选/视图状态（非仅回跳）
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("restore") === "1") return; // 交由回跳逻辑覆盖
    const s = loadInspirationViewState();
    if (!s) return;
    setSearchQuery(s.searchQuery);
    setSelectedType(s.selectedType);
    setSelectedCollection(s.selectedCollection);
    setSelectedTag(s.selectedTag);
    setShowFavoritesOnly(s.showFavoritesOnly);
    setViewMode(s.viewMode);
    setDensity(s.density);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveInspirationViewState({
      viewMode,
      density,
      searchQuery,
      selectedType,
      selectedCollection,
      selectedTag,
      showFavoritesOnly,
    });
  }, [density, searchQuery, selectedCollection, selectedTag, selectedType, showFavoritesOnly, viewMode]);

  const exportInspiration = useCallback(async () => {
    const payload = {
      app: "liubai-writing",
      kind: "inspiration-export",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      inspirationCollections: collections,
      inspirationFragments: fragments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liubai-inspiration-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [collections, fragments]);

  const exportInspirationZip = useCallback(async () => {
    const blob = await buildInspirationBackupZip({
      inspirationCollections: collections,
      inspirationFragments: fragments,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `liubai-inspiration-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [collections, fragments]);

  const importInspirationMerge = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json,.zip,application/zip";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!window.confirm("合并导入将保留现有数据，并追加导入的流光碎片/集合（生成新 id）。确定继续？")) return;
      void (async () => {
        try {
          const parsed = await parseInspirationBackupFile(file);
          const inspCols = Array.isArray(parsed.inspirationCollections) ? parsed.inspirationCollections : [];
          const inspFrags = Array.isArray(parsed.inspirationFragments) ? parsed.inspirationFragments : [];

          // 尝试保留"已存在作品"的归属，否则降级为 null
          const works = await listWorks();
          const workIdSet = new Set(works.map((w) => w.id));
          const normalizedFrags = inspFrags.map((f) => ({
            ...f,
            workId: f.workId && workIdSet.has(f.workId) ? f.workId : null,
          }));

          await importAllDataMerge({
            works: [],
            chapters: [],
            inspirationCollections: inspCols,
            inspirationFragments: normalizedFrags,
          });
          toast.success("合并导入完成。建议刷新页面以加载最新数据。");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "导入失败");
        }
      })();
    };
    input.click();
  }, []);

  const [expandOpen, setExpandOpen] = useState(false);
  const [expandTarget, setExpandTarget] = useState<InspirationFragment | null>(null);
  const [expandUserHint, setExpandUserHint] = useState("");
  const [expandBusy, setExpandBusy] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [expandSegments, setExpandSegments] = useState<string[]>([]);
  const expandAbortRef = useRef<AbortController | null>(null);

  const seedV0DemoData = useCallback(async () => {
    try {
      // 1) create collections (dedupe by name)
      const existingCols = await listInspirationCollections();
      const nameToId = new Map(existingCols.map((c) => [c.name, c.id] as const));
      for (const c of V0_DEMO_COLLECTIONS) {
        if (nameToId.has(c.name)) continue;
        const created = await addInspirationCollection({ name: c.name, sortOrder: c.sortOrder });
        nameToId.set(created.name, created.id);
      }
      const cols = await listInspirationCollections();
      setCollections(cols);

      // 2) create fragments (dedupe by body hash-ish)
      const existingFrags = await listInspirationFragments();
      const bodySet = new Set(existingFrags.map((f) => f.body.trim()));
      for (const f of V0_DEMO_FRAGMENTS) {
        const body = f.body.trim();
        if (bodySet.has(body)) continue;
        const collectionId = f.collectionName ? (nameToId.get(f.collectionName) ?? null) : null;
        const tags = [DEMO_TAG, `${KIND_TAG_PREFIX}${f.kind}`, ...f.tags];
        await addInspirationFragment({
          title: f.title,
          isFavorite: !!f.isFavorite,
          body,
          tags,
          workId: null,
          collectionId,
        });
        bodySet.add(body);
      }
      const next = await listInspirationFragments();
      setFragments(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "装载示例失败");
    }
  }, []);

  const restoreDemoData = useCallback(async () => {
    try {
      try {
        localStorage.removeItem(LS_INSP_DEMO_DISABLED);
        localStorage.setItem(LS_INSP_DEMO_SEEDED, "1");
      } catch {
        /* ignore */
      }
      await seedV0DemoData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "恢复示例失败");
    }
  }, [seedV0DemoData]);

  const clearDemoData = useCallback(async () => {
    if (!window.confirm("清除内置示例数据？这不会删除你的真实碎片。")) return;
    try {
      try {
        localStorage.setItem(LS_INSP_DEMO_DISABLED, "1");
      } catch {
        /* ignore */
      }
      const all = await listInspirationFragments();
      const demoFrags = all.filter((f) => Array.isArray(f.tags) && f.tags.includes(DEMO_TAG));
      if (demoFrags.length) {
        await Promise.all(demoFrags.map((f) => deleteInspirationFragment(f.id)));
      }
      const cols = await listInspirationCollections();
      const demoNameSet = new Set(V0_DEMO_COLLECTIONS.map((c) => c.name));
      const remaining = await listInspirationFragments();
      const usedColIds = new Set(remaining.map((f) => f.collectionId).filter(Boolean) as string[]);
      const maybeDemoCols = cols.filter((c) => demoNameSet.has(c.name) && !usedColIds.has(c.id));
      if (maybeDemoCols.length) {
        await Promise.all(maybeDemoCols.map((c) => deleteInspirationCollection(c.id)));
      }
      setFragments(remaining);
      setCollections(await listInspirationCollections());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清除失败");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [fragmentsData, collectionsData] = await Promise.all([
          listInspirationFragments(),
          listInspirationCollections(),
        ]);
        // one-time backfill: localStorage favorites -> fragment.isFavorite
        const legacy = legacyFavoriteIdsRef.current;
        if (legacy.size) {
          const need = fragmentsData.filter((f) => legacy.has(f.id) && !f.isFavorite);
          if (need.length) {
            await Promise.all(need.map((f) => updateInspirationFragment(f.id, { isFavorite: true })));
            fragmentsData.forEach((f) => {
              if (legacy.has(f.id)) f.isFavorite = true;
            });
          }
          // 不论是否命中，都清掉 legacy，避免后续反复回写（并且以后以 isFavorite 为准）
          clearInspirationFavoriteIds();
          legacy.clear();
        }
        setFragments(fragmentsData);
        setCollections(collectionsData);

        // 新手默认示例：只要碎片为 0 且用户未显式禁用，就自动补回示例（避免"空库时随机灵感消失"）
        try {
          const disabled = localStorage.getItem(LS_INSP_DEMO_DISABLED) === "1";
          const seeded = localStorage.getItem(LS_INSP_DEMO_SEEDED) === "1";
          if (!disabled && fragmentsData.length === 0) {
            if (!seeded) localStorage.setItem(LS_INSP_DEMO_SEEDED, "1");
            await seedV0DemoData();
          }
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 全局速记 → 流光页扩容接力：/inspiration?expandDraft=1
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("expandDraft") !== "1") return;
    try {
      const raw = localStorage.getItem(INSPIRATION_EXPAND_HANDOFF_KEY);
      if (!raw) return;
      const payload = parseInspirationExpandHandoff(raw);
      if (!payload) return;
      const draft: InspirationFragment = {
        id: INSPIRATION_DRAFT_EXPAND_SOURCE_ID,
        body: payload.body,
        tags: payload.tags,
        workId: payload.workId,
        collectionId: payload.collectionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setExpandTarget(draft);
      setExpandUserHint("");
      setExpandOpen(true);
    } finally {
      sp.delete("expandDraft");
      const q = sp.toString();
      navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const runExpand = useCallback(async (fragment: InspirationFragment) => {
    expandAbortRef.current?.abort();
    const ac = new AbortController();
    expandAbortRef.current = ac;
    setExpandBusy(true);
    setExpandError(null);
    setExpandSegments([]);
    try {
      const settings = loadAiSettings();
      const { segments } = await generateInspirationFiveExpansions({
        fragmentBody: fragment.body,
        tags: visibleTagsForFragment(fragment),
        userHint: expandUserHint.trim() || undefined,
        settings,
        signal: ac.signal,
      });
      setExpandSegments(segments);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof InspirationExpandError) {
        setExpandError(e.message);
        return;
      }
      setExpandError(e instanceof Error ? e.message : "扩容失败");
    } finally {
      setExpandBusy(false);
      expandAbortRef.current = null;
    }
  }, [expandUserHint]);

  const openExpand = useCallback((fragment: InspirationFragment) => {
    setExpandTarget(fragment);
    setExpandUserHint("");
    setExpandOpen(true);
    void runExpand(fragment);
  }, [runExpand]);

  const filteredFragments = useMemo(() => {
    let list = [...fragments];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.body.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (selectedType !== "all") {
      list = list.filter((f) => inspirationKindFromFragment(f) === selectedType);
    }

    if (selectedCollection) {
      list = list.filter((f) => f.collectionId === selectedCollection);
    }

    if (selectedTag) {
      list = list.filter((f) => visibleTagsForFragment(f).includes(selectedTag));
    }

    // 默认隐藏归档；私密默认可见（由云端 RLS 控制"只对自己可见"，无需前端隐藏）
    list = list.filter((f) => !f.archived);

    if (showFavoritesOnly) {
      list = list.filter((f) => !!f.isFavorite);
    }

    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [
    fragments,
    searchQuery,
    selectedType,
    selectedCollection,
    selectedTag,
    showFavoritesOnly,
  ]);

  const collectionCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of fragments) {
      const cid = f.collectionId;
      if (!cid) continue;
      map[cid] = (map[cid] ?? 0) + 1;
    }
    return map;
  }, [fragments]);

  const sidebarScopeFragments = useMemo(() => {
    let list = [...fragments];
    if (selectedCollection) list = list.filter((f) => f.collectionId === selectedCollection);
    if (selectedType !== "all") list = list.filter((f) => inspirationKindFromFragment(f) === selectedType);
    if (showFavoritesOnly) list = list.filter((f) => !!f.isFavorite);
    return list;
  }, [fragments, selectedCollection, selectedType, showFavoritesOnly]);

  // v0UI 语义：左侧"随机灵感"来自全局池，不应被当前筛选影响；且默认排除归档
  const randomPoolFragments = useMemo(() => fragments.filter((f) => !f.archived), [fragments]);

  const commonTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of sidebarScopeFragments) {
      for (const t of visibleTagsForFragment(f)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [sidebarScopeFragments]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let addedThisMonth = 0;
    let favorites = 0;
    for (const f of sidebarScopeFragments) {
      const d = new Date(f.createdAt);
      if (d.getFullYear() === y && d.getMonth() === m) addedThisMonth += 1;
      if (f.isFavorite) favorites += 1;
    }
    return { addedThisMonth, favorites, total: sidebarScopeFragments.length };
  }, [sidebarScopeFragments]);

  const handleQuickCapture = useCallback(async () => {
    if (!quickCaptureContent.trim()) return;
    try {
      const created = await addInspirationFragment({
        body: quickCaptureContent.trim(),
        tags: [`${KIND_TAG_PREFIX}text`],
        workId: null,
        collectionId: null,
      });
      setFragments((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
      setQuickCaptureContent("");
      setIsQuickCaptureOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }, [quickCaptureContent]);

  const openEdit = useCallback((f: InspirationFragment) => {
    setEditTarget(f);
    setEditTitle((f.title ?? "").trim());
    setEditSourceName((f.sourceName ?? "").trim());
    setEditSourceUrl((f.sourceUrl ?? "").trim());
    setEditBody((f.body ?? "").trim());
    setEditTags(visibleTagsForFragment(f).join(" "));
    setEditWorkId(f.workId ?? null);
    setEditCollectionId(f.collectionId ?? null);
    setEditIsFavorite(!!f.isFavorite);
    setEditIsPrivate(!!f.isPrivate);
    setEditArchived(!!f.archived);
    setEditLinks(Array.isArray(f.links) ? f.links : []);
    setEditOpen(true);
  }, []);

  const openTransfer = useCallback((f: InspirationFragment) => {
    setTransferTarget(f);
    setTransferOpen(true);
  }, []);

  useEffect(() => {
    if (!transferOpen) return;
    void (async () => {
      const ws = await listWorks();
      const slim = ws.map((w) => ({ id: w.id, title: w.title }));
      setTransferWorks(slim);
      if (!transferWorkId && slim.length) {
        setTransferWorkId(slim[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferOpen]);

  useEffect(() => {
    if (!transferOpen || !transferWorkId) return;
    void (async () => {
      const cs = await listChapters(transferWorkId);
      const slim = cs.map((c) => ({ id: c.id, title: c.title }));
      setTransferChapters(slim);
      if (!transferChapterId && slim.length) setTransferChapterId(slim[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferOpen, transferWorkId]);

  const applyTransfer = useCallback(() => {
    const f = transferTarget;
    if (!f) return;
    if (!transferWorkId || !transferChapterId) {
      toast.info("请选择作品与章节");
      return;
    }
    void (async () => {
      const title = f.title?.trim();
      const head = title ? `【流光】${title}\n` : "【流光】\n";
      const text = `${head}${(f.body ?? "").trim()}\n\n`;
      const r = writeInspirationTransferHandoff({
        workId: transferWorkId,
        chapterId: transferChapterId,
        mode: transferMode,
        text,
        createdAt: Date.now(),
        sourceId: f.id,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      writeInspirationReturnState({
        searchQuery,
        selectedType,
        selectedCollection,
        selectedTag,
        showFavoritesOnly,
        viewMode,
        density,
        createdAt: Date.now(),
      });
      const qp =
        transferMode === "insertCursor"
          ? "?liuguangInsert=1"
          : transferMode === "appendEnd"
            ? "?liuguangAppend=1"
            : "?liuguangDraft=1";
      const w = await getWork(transferWorkId);
      const seg = w ? workPathSegment(w) : transferWorkId;
      navigate(`/work/${seg}${qp}&chapter=${transferChapterId}`);
    })();
  }, [navigate, transferChapterId, transferMode, transferTarget, transferWorkId, searchQuery, selectedType, selectedCollection, selectedTag, showFavoritesOnly, viewMode, density]);

  const saveEdit = useCallback(async () => {
    const t = editTarget;
    if (!t) return;
    const tags = normalizeWorkTagList(
      editTags
        .split(/[\s,，]+/g)
        .map((x) => x.trim())
        .filter(Boolean),
    ) ?? [];
    // keep kind tag
    const kindId = inspirationKindFromFragment(t);
    const kindTag = `${KIND_TAG_PREFIX}${kindId}`;
    const mergedTags = [kindTag, ...tags.filter((x) => !x.startsWith(KIND_TAG_PREFIX))];
    const patch: Partial<InspirationFragment> = {
      title: editTitle.trim() || undefined,
      sourceName: editSourceName.trim() || undefined,
      sourceUrl: editSourceUrl.trim() || undefined,
      body: editBody.trim() || "（空碎片）",
      tags: mergedTags,
      workId: editWorkId ?? null,
      collectionId: editCollectionId ?? null,
      isFavorite: editIsFavorite,
      isPrivate: editIsPrivate,
      archived: editArchived,
      links: editLinks,
    };
    await updateInspirationFragment(t.id, patch);
    setFragments((prev) => prev.map((f) => (f.id === t.id ? { ...f, ...patch, updatedAt: Date.now() } : f)));
    setEditOpen(false);
    setEditTarget(null);
  }, [
    editArchived,
    editBody,
    editCollectionId,
    editIsFavorite,
    editIsPrivate,
    editSourceName,
    editSourceUrl,
    editTags,
    editTarget,
    editTitle,
    editWorkId,
  ]);

  const refreshUrlPreview = useCallback(async () => {
    const t = editTarget;
    const url = editSourceUrl.trim();
    if (!t || !url) return;
    try {
      setUrlPreviewBusy(true);
      const preview = await fetchUrlPreview(url);
      const patch: Partial<InspirationFragment> = {
        urlTitle: preview.title,
        urlSite: preview.site,
        urlDescription: preview.description,
        urlFetchedAt: Date.now(),
      };
      await updateInspirationFragment(t.id, patch);
      setFragments((prev) => prev.map((f) => (f.id === t.id ? { ...f, ...patch, updatedAt: Date.now() } : f)));
      // 同步到编辑弹层展示
      setEditTarget((cur) => (cur && cur.id === t.id ? { ...cur, ...patch } : cur));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "抓取失败");
    } finally {
      setUrlPreviewBusy(false);
    }
  }, [editSourceUrl, editTarget]);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("确定删除这条灵感吗？")) return;
    try {
      await deleteInspirationFragment(id);
      setFragments((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }, []);

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearBulk = useCallback(() => {
    setBulkSelection(new Set());
    setBulkMode(false);
  }, []);

  const bulkIds = useMemo(() => [...bulkSelection], [bulkSelection]);

  const bulkArchive = useCallback(
    async (archived: boolean) => {
      const ids = [...bulkSelection];
      if (!ids.length) return;
      const ok = window.confirm(archived ? `归档选中 ${ids.length} 条？` : `取消归档选中 ${ids.length} 条？`);
      if (!ok) return;
      try {
        await Promise.all(ids.map((id) => updateInspirationFragment(id, { archived })));
        setFragments((prev) => prev.map((f) => (bulkSelection.has(f.id) ? { ...f, archived, updatedAt: Date.now() } : f)));
        setBulkSelection(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "批量操作失败");
      }
    },
    [bulkSelection],
  );

  const bulkFavorite = useCallback(
    async (isFavorite: boolean) => {
      const ids = [...bulkSelection];
      if (!ids.length) return;
      const ok = window.confirm(isFavorite ? `收藏选中 ${ids.length} 条？` : `取消收藏选中 ${ids.length} 条？`);
      if (!ok) return;
      try {
        await Promise.all(ids.map((id) => updateInspirationFragment(id, { isFavorite })));
        setFragments((prev) =>
          prev.map((f) => (bulkSelection.has(f.id) ? { ...f, isFavorite, updatedAt: Date.now() } : f)),
        );
        setBulkSelection(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "批量收藏失败");
      }
    },
    [bulkSelection],
  );

  const bulkDelete = useCallback(async () => {
    const ids = [...bulkSelection];
    if (!ids.length) return;
    const ok = window.confirm(`确定删除选中 ${ids.length} 条灵感？不可恢复（除非已有备份）。`);
    if (!ok) return;
    try {
      await Promise.all(ids.map((id) => deleteInspirationFragment(id)));
      setFragments((prev) => prev.filter((f) => !bulkSelection.has(f.id)));
      setBulkSelection(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量删除失败");
    }
  }, [bulkSelection]);

  const applyBulkTags = useCallback(async () => {
    const ids = [...bulkSelection];
    if (!ids.length) return;
    const tagsToAdd =
      normalizeWorkTagList(
        bulkTagsValue
          .split(/[\s,，]+/g)
          .map((x) => x.trim())
          .filter(Boolean),
      ) ?? [];
    if (!tagsToAdd.length) {
      setBulkTagsOpen(false);
      return;
    }
    try {
      const map = new Map(fragments.map((f) => [f.id, f] as const));
      await Promise.all(
        ids.map(async (id) => {
          const f = map.get(id);
          if (!f) return;
          const kindTag = `${KIND_TAG_PREFIX}${inspirationKindFromFragment(f)}`;
          const base = visibleTagsForFragment(f);
          const merged = normalizeWorkTagList([...base, ...tagsToAdd]) ?? [];
          const nextTags = [kindTag, ...merged.filter((x) => !x.startsWith(KIND_TAG_PREFIX))];
          await updateInspirationFragment(id, { tags: nextTags });
        }),
      );
      setFragments((prev) =>
        prev.map((f) => {
          if (!bulkSelection.has(f.id)) return f;
          const kindTag = `${KIND_TAG_PREFIX}${inspirationKindFromFragment(f)}`;
          const merged = normalizeWorkTagList([...visibleTagsForFragment(f), ...tagsToAdd]) ?? [];
          return {
            ...f,
            tags: [kindTag, ...merged.filter((x) => !x.startsWith(KIND_TAG_PREFIX))],
            updatedAt: Date.now(),
          };
        }),
      );
      setBulkTagsOpen(false);
      setBulkTagsValue("");
      setBulkSelection(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量打标签失败");
    }
  }, [bulkSelection, bulkTagsValue, fragments]);

  const applyBulkMove = useCallback(async () => {
    const ids = [...bulkSelection];
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => updateInspirationFragment(id, { collectionId: bulkMoveCollectionId })));
      setFragments((prev) =>
        prev.map((f) =>
          bulkSelection.has(f.id) ? { ...f, collectionId: bulkMoveCollectionId, updatedAt: Date.now() } : f,
        ),
      );
      setBulkMoveOpen(false);
      setBulkSelection(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量移动失败");
    }
  }, [bulkMoveCollectionId, bulkSelection]);

  const handleToggleFavorite = useCallback((id: string) => {
    const cur = fragments.find((f) => f.id === id);
    if (!cur) return;
    const next = !cur.isFavorite;
    setFragments((prev) => prev.map((f) => (f.id === id ? { ...f, isFavorite: next, updatedAt: Date.now() } : f)));
    void updateInspirationFragment(id, { isFavorite: next });
  }, []);

  const handleNewCollection = useCallback(async () => {
    const name = window.prompt("文件夹名称");
    if (!name?.trim()) return;
    try {
      const maxSort = collections.reduce((m, c) => Math.max(m, c.sortOrder), -1);
      const c = await addInspirationCollection({ name: name.trim(), sortOrder: maxSort + 1 });
      setCollections((prev) => [...prev, c].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  }, [collections]);

  const renameCollection = useCallback(async (c: InspirationCollection) => {
    const next = window.prompt("重命名文件夹", c.name) ?? "";
    if (!next.trim() || next.trim() === c.name.trim()) return;
    try {
      await updateInspirationCollection(c.id, { name: next.trim() });
      setCollections((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: next.trim(), updatedAt: Date.now() } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    }
  }, []);

  const removeCollection = useCallback(async (c: InspirationCollection) => {
    const ok = window.confirm(`删除文件夹「${c.name}」？其下碎片将移动到"全部灵感"（不删除碎片）。`);
    if (!ok) return;
    try {
      const affected = fragments.filter((f) => f.collectionId === c.id).map((f) => f.id);
      if (affected.length) {
        await Promise.all(affected.map((id) => updateInspirationFragment(id, { collectionId: null })));
        setFragments((prev) => prev.map((f) => (f.collectionId === c.id ? { ...f, collectionId: null, updatedAt: Date.now() } : f)));
      }
      await deleteInspirationCollection(c.id);
      setCollections((prev) => prev.filter((x) => x.id !== c.id));
      if (selectedCollection === c.id) setSelectedCollection(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }, [fragments, selectedCollection]);

  const saveExpandedAsNew = useCallback(async (body: string) => {
    const t = expandTarget;
    if (!t) return;
    const tags = t.tags ?? [];
    const created = await addInspirationFragment({
      body: body.trim(),
      tags,
      workId: t.workId ?? null,
      collectionId: t.collectionId ?? null,
    });
    setFragments((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
  }, [expandTarget]);

  const replaceExpanded = useCallback(async (body: string) => {
    const t = expandTarget;
    if (!t) return;
    if (t.id === INSPIRATION_DRAFT_EXPAND_SOURCE_ID) {
      // 草稿来源：无原记录可覆盖，退化为新增
      await saveExpandedAsNew(body);
      return;
    }
    await updateInspirationFragment(t.id, { body: body.trim() });
    setFragments((prev) => prev.map((f) => (f.id === t.id ? { ...f, body: body.trim(), updatedAt: Date.now() } : f)));
  }, [expandTarget, saveExpandedAsNew]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 border-r border-border/40 bg-card/20 flex flex-col">
            <div className="p-3 space-y-2">
              {/* v0UI：左侧栏标题 */}
              <div className="flex items-center gap-2 px-1 pt-0.5 pb-1.5">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-base font-semibold text-foreground">流光 - 灵感碎片</span>
              </div>

              {/* v0UI 同款：侧边栏内联快速捕捉 */}
              <SidebarQuickCapture
                onCapture={async (kind, text) => {
                  const created = await addInspirationFragment({
                    body: text,
                    tags: [`${KIND_TAG_PREFIX}${kind}`],
                    workId: null,
                    collectionId: selectedCollection ?? null,
                  });
                  setFragments((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
                }}
              />

              {/* v0UI：随机灵感（全局池；不受筛选影响） */}
              {randomPoolFragments.length > 0 ? (
                <RandomInspirationCard fragments={randomPoolFragments} />
              ) : null}
            </div>

            <div className="flex-1 overflow-auto px-2">
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCollection(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    selectedCollection === null
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  全部灵感
                  <span className="ml-auto text-xs">{fragments.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    showFavoritesOnly
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Star className="h-4 w-4" />
                  我的收藏
                </button>

                <div className="my-2 border-t border-border/40" />

                <div className="flex items-center justify-between px-2 py-1">
                  <div className="text-xs font-medium text-muted-foreground">文件夹</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    title="新建文件夹"
                    onClick={() => void handleNewCollection()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {collections.map((collection) => (
                  <div
                    key={collection.id}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      selectedCollection === collection.id
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(collection.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", collectionDotClasses(collection.name))}
                        aria-hidden
                      />
                      <span className="truncate">{collection.name}</span>
                    </button>
                    <span className="ml-auto text-xs tabular-nums">
                      {collectionCountById[collection.id] ?? 0}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 group-hover:opacity-100"
                          aria-label="文件夹菜单"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void renameCollection(collection)}>
                          <Edit3 className="mr-2 h-4 w-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => void removeCollection(collection)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除文件夹
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>

            {/* v0UI 左下角：常用标签 + 本月统计 */}
            <div className="border-t border-border/40 bg-card/10 px-3 py-3">
              <div className="text-xs font-medium text-muted-foreground">常用标签</div>
              {commonTags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {commonTags.map((t) => {
                    const on = selectedTag === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTag((cur) => (cur === t ? null : t))}
                        className={cn(
                          "rounded-md px-2 py-1 text-[11px] leading-none transition-colors",
                          on ? "ring-1 ring-primary/35" : "hover:ring-1 hover:ring-border/60",
                          tagAccentClasses(t),
                        )}
                        title={on ? "取消筛选" : "按此标签筛选"}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">暂无标签</div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">本月新增</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums">{monthStats.addedThisMonth}</div>
                </div>
                <div className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">收藏</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums">{monthStats.favorites}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                当前范围：{monthStats.total} 条{selectedTag ? ` · 标签「${selectedTag}」` : ""}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-card/20 px-6 py-2.5">
              {/* v0UI 同款：类型一排按钮 */}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-1 [-webkit-overflow-scrolling:touch]">
                <button
                  type="button"
                  onClick={() => setIsQuickCaptureOpen(true)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                  title="快速捕捉"
                >
                  <Plus className="h-3.5 w-3.5" />
                  捕捉
                </button>
                {inspirationTypes.map((t) => {
                  const on = selectedType === t.id;
                  const Icon = t.icon;
                  const accent = kindAccentClasses(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors",
                        on
                          ? cn(accent.chipOn)
                          : cn("text-muted-foreground hover:bg-muted/50 hover:text-foreground", accent.chipOff),
                      )}
                      aria-pressed={on}
                      title={t.label}
                    >
                      <Icon className={cn("h-3.5 w-3.5", on ? "" : "opacity-90")} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* 右侧：搜索 + 筛选按钮（保留扩展位） */}
              <div className="flex items-center gap-2">
                <div className="relative w-[min(18rem,30vw)] max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索灵感…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-background/50 pl-9"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter className="h-4 w-4" />
                      筛选
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowFavoritesOnly((v) => !v)}
                      className={cn(showFavoritesOnly && "bg-primary/10")}
                    >
                      <Star className="mr-2 h-4 w-4" />
                      仅看收藏
                    </DropdownMenuItem>
                    {selectedCollection ? (
                      <DropdownMenuItem onClick={() => setSelectedCollection(null)}>
                        <Folder className="mr-2 h-4 w-4" />
                        清除文件夹筛选
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => void clearDemoData()}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      清除内置示例
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void restoreDemoData()}>
                      <Upload className="mr-2 h-4 w-4" />
                      恢复内置示例
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDensity("comfortable")}>
                      密度：舒适
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDensity("cozy")}>
                      密度：紧凑
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDensity("compact")}>
                      密度：极致
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {!bulkMode ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <MoreHorizontal className="h-4 w-4" />
                        操作
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void exportInspiration()}>
                        <Download className="mr-2 h-4 w-4" />
                        导出
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void exportInspirationZip()}>
                        <Download className="mr-2 h-4 w-4" />
                        ZIP
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => importInspirationMerge()}>
                        <Upload className="mr-2 h-4 w-4" />
                        导入
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkMode(true);
                          setBulkSelection(new Set());
                        }}
                      >
                        批量
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {bulkMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">已选 {bulkIds.length}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkSelection(new Set(filteredFragments.map((f) => f.id)));
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkSelection((prev) => {
                        const next = new Set<string>();
                        const all = filteredFragments.map((f) => f.id);
                        for (const id of all) if (!prev.has(id)) next.add(id);
                        return next;
                      });
                    }}
                  >
                    反选
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBulkTagsOpen(true)}>
                    批量标签
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBulkMoveOpen(true)}>
                    移动文件夹
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkFavorite(true)}>
                    收藏
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkFavorite(false)}>
                    取消收藏
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkArchive(true)}>
                    归档
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void bulkArchive(false)}>
                    取消归档
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void bulkDelete()}>
                    删除
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBulkSelection(new Set())}>
                    清空
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => clearBulk()}>
                    退出
                  </Button>
                </div>
              ) : (
                <></>
              )}

              <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    viewMode === "grid"
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    viewMode === "list"
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("masonry")}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    viewMode === "masonry"
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="瀑布流"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* v0：筛选/视图状态回显（可清除） */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border/30 bg-card/10 px-6 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">当前：</span>
              {selectedCollection ? (
                <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">
                  文件夹：{collections.find((c) => c.id === selectedCollection)?.name ?? "（已删）"}
                </span>
              ) : null}
              {selectedType !== "all" ? (
                <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">
                  类型：{inspirationTypes.find((t) => t.id === selectedType)?.label ?? selectedType}
                </span>
              ) : null}
              {selectedTag ? (
                <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">
                  标签：{selectedTag}
                </span>
              ) : null}
              {showFavoritesOnly ? (
                <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">仅收藏</span>
              ) : null}
              {searchQuery.trim() ? (
                <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">
                  搜索：{searchQuery.trim().slice(0, 16)}
                  {searchQuery.trim().length > 16 ? "…" : ""}
                </span>
              ) : null}
              <span className="rounded-md border border-border/50 bg-background/40 px-2 py-0.5">
                视图：{viewMode === "grid" ? "网格" : viewMode === "list" ? "列表" : "瀑布流"} · 密度：
                {density === "comfortable" ? "舒适" : density === "cozy" ? "适中" : "紧凑"}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2 text-xs"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedType("all");
                  setSelectedCollection(null);
                  setSelectedTag(null);
                  setShowFavoritesOnly(false);
                }}
              >
                清除筛选
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {filteredFragments.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                    <Lightbulb className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium">还没有灵感碎片</h3>
                  <p className="mt-1 text-sm text-muted-foreground">点击&quot;快速捕捉&quot;记录你的第一个灵感，或装载 v0UI 示例数据。</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Button type="button" variant="default" onClick={() => setIsQuickCaptureOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      快速捕捉
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void seedV0DemoData()}>
                      <Upload className="mr-2 h-4 w-4" />
                      装载示例（v0UI）
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    viewMode === "masonry"
                      ? "columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4"
                      : "grid gap-4",
                    viewMode === "grid"
                      ? cn(
                          density === "compact" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2" : "",
                          density !== "compact" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "",
                        )
                      : viewMode === "list"
                        ? "grid-cols-1"
                        : "",
                  )}
                >
                  {filteredFragments.map((fragment) => (
                    <InspirationCard
                      key={fragment.id}
                      fragment={fragment}
                      kindId={inspirationKindFromFragment(fragment)}
                      isFavorite={!!fragment.isFavorite}
                        onEdit={openEdit}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                      onExpand={openExpand}
                      onTransfer={openTransfer}
                      bulkMode={bulkMode}
                      selected={bulkSelection.has(fragment.id)}
                      onToggleSelect={toggleBulkSelect}
                      density={density}
                      masonryItem={viewMode === "masonry"}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>转入写作</DialogTitle>
              <DialogDescription>选择作品/章节与插入方式</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">作品</label>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={transferWorkId}
                  onChange={(e) => {
                    setTransferWorkId(e.target.value);
                    setTransferChapterId("");
                  }}
                >
                  {transferWorks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">章节</label>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={transferChapterId}
                  onChange={(e) => setTransferChapterId(e.target.value)}
                >
                  {transferChapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">方式</label>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={transferMode}
                  onChange={(e) => setTransferMode(e.target.value as InspirationTransferMode)}
                >
                  <option value="insertCursor">光标位插入</option>
                  <option value="appendEnd">章末追加</option>
                  <option value="mergeAiDraft">写入 AI 侧栏草稿</option>
                </select>
              </div>
              <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                {(transferTarget?.title ? `【流光】${transferTarget.title}\n` : "【流光】\n") +
                  ((transferTarget?.body ?? "").trim().slice(0, 220) || "（空）") +
                  (((transferTarget?.body ?? "").trim().length ?? 0) > 220 ? "…" : "")}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTransferOpen(false);
                  setTransferTarget(null);
                }}
              >
                取消
              </Button>
              <Button type="button" onClick={() => applyTransfer()}>
                去写作
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkTagsOpen} onOpenChange={setBulkTagsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>批量打标签</DialogTitle>
              <DialogDescription>给已选碎片追加标签（空格/逗号分隔）</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Input value={bulkTagsValue} onChange={(e) => setBulkTagsValue(e.target.value)} placeholder="人物 情感 伏笔…" />
              <div className="text-xs text-muted-foreground">已选 {bulkIds.length} 条</div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkTagsOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void applyBulkTags()}>
                应用
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>批量移动到文件夹</DialogTitle>
              <DialogDescription>把已选碎片移动到指定集合（可选"未归类"）</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">目标文件夹</label>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={bulkMoveCollectionId ?? ""}
                  onChange={(e) => setBulkMoveCollectionId(e.target.value ? e.target.value : null)}
                >
                  <option value="">未归类</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-muted-foreground">已选 {bulkIds.length} 条</div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkMoveOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void applyBulkMove()}>
                应用
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) setEditTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>编辑碎片</DialogTitle>
              <DialogDescription>修改标题、来源、标签、归属与隐私/归档状态</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">标题（可选）</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="给碎片一个标题…" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-xs text-muted-foreground">来源（可选）</label>
                  <Input value={editSourceName} onChange={(e) => setEditSourceName(e.target.value)} placeholder="如：微信读书/随手记" />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs text-muted-foreground">URL（可选）</label>
                  <Input value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)} placeholder="https://…" />
                </div>
              </div>

              {editSourceUrl.trim() ? (
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {editTarget?.urlTitle ?? editTarget?.title ?? "链接预览"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                        {(editTarget?.urlSite ?? hostnameFromUrl(editSourceUrl.trim()) ?? "未知站点") +
                          (editTarget?.urlFetchedAt ? ` · ${new Date(editTarget.urlFetchedAt).toLocaleDateString("zh-CN")}` : "")}
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void refreshUrlPreview()} disabled={urlPreviewBusy}>
                      {urlPreviewBusy ? "抓取中…" : "抓取预览"}
                    </Button>
                  </div>
                  {editTarget?.urlDescription ? (
                    <div className="mt-2 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {editTarget.urlDescription}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">正文</label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="min-h-[160px]" />
              </div>

              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground">标签（空格/逗号分隔）</label>
                <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="人物 情感 伏笔…" />
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">关联人物 / 情节</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">先做可扩展的自由关联；后续可对接推演/锦囊实体</div>
                  </div>
                </div>
                {editLinks.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editLinks.map((l) => (
                      <Badge key={l.id} variant="secondary" className="gap-1">
                        <span className="text-[10px] text-muted-foreground">{l.type === "character" ? "人物" : "情节"}</span>
                        <span>{l.name}</span>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditLinks((prev) => prev.filter((x) => x.id !== l.id))}
                          aria-label="移除关联"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">暂无关联</div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                    value={newLinkType}
                    onChange={(e) => setNewLinkType(e.target.value as InspirationLink["type"])}
                  >
                    <option value="character">人物</option>
                    <option value="plot">情节</option>
                  </select>
                  <Input
                    value={newLinkName}
                    onChange={(e) => setNewLinkName(e.target.value)}
                    placeholder="输入名称并添加…"
                    className="w-[min(20rem,70vw)]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const name = newLinkName.trim();
                      if (!name) return;
                      setEditLinks((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), type: newLinkType, name, createdAt: Date.now() },
                      ]);
                      setNewLinkName("");
                    }}
                  >
                    添加
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={editIsFavorite ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditIsFavorite((v) => !v)}
                >
                  <Star className="h-4 w-4" />
                  收藏
                </Button>
                <Button
                  type="button"
                  variant={editIsPrivate ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditIsPrivate((v) => !v)}
                >
                  <Lock className="h-4 w-4" />
                  私密
                </Button>
                <Button
                  type="button"
                  variant={editArchived ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditArchived((v) => !v)}
                >
                  <Archive className="h-4 w-4" />
                  归档
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => void saveEdit()}>
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isQuickCaptureOpen} onOpenChange={setIsQuickCaptureOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                快速捕捉
              </DialogTitle>
              <DialogDescription>记录转瞬即逝的灵感</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                value={quickCaptureContent}
                onChange={(e) => setQuickCaptureContent(e.target.value)}
                placeholder="输入你的灵感..."
                className="min-h-[120px]"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" type="button">
                  <Mic className="h-4 w-4" />
                  语音输入
                </Button>
                <Button variant="outline" size="sm" className="gap-2" type="button">
                  <Image className="h-4 w-4" />
                  添加图片
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsQuickCaptureOpen(false)}>
                取消
              </Button>
              <Button onClick={() => void handleQuickCapture()} disabled={!quickCaptureContent.trim()}>
                <Check className="mr-2 h-4 w-4" />
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={expandOpen}
          onOpenChange={(o) => {
            if (!o) expandAbortRef.current?.abort();
            setExpandOpen(o);
            if (!o) {
              setExpandTarget(null);
              setExpandSegments([]);
              setExpandUserHint("");
              setExpandError(null);
              setExpandBusy(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 五段扩容
              </DialogTitle>
              <DialogDescription>基于当前碎片生成 5 个不同角度的扩写候选，可逐条保存。</DialogDescription>
            </DialogHeader>

            {expandTarget ? (
              <div className="space-y-3 py-2">
                <div className="rounded-lg border border-border/50 bg-card/40 p-3">
                  <div className="text-xs text-muted-foreground mb-1">原碎片</div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{expandTarget.body}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">作者补充说明（可选）</div>
                  <Textarea
                    value={expandUserHint}
                    onChange={(e) => setExpandUserHint(e.target.value)}
                    placeholder="例如：希望偏悬疑 / 加强冲突 / 更温柔…"
                    className="min-h-[72px]"
                    disabled={expandBusy}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={expandBusy}
                      onClick={() => void runExpand(expandTarget)}
                    >
                      {expandBusy ? "生成中…" : "重新生成"}
                    </Button>
                    {expandError ? <span className="text-sm text-red-600">{expandError}</span> : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {expandSegments.map((seg, i) => (
                    <div key={i} className="rounded-lg border border-border/50 bg-card/30 p-3 flex flex-col gap-2">
                      <div className="text-xs text-muted-foreground">候选 {i + 1}</div>
                      <div className="text-sm leading-relaxed whitespace-pre-wrap flex-1">{seg}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => void saveExpandedAsNew(seg)}
                        >
                          保存为新碎片
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void replaceExpanded(seg)}
                        >
                          覆盖原碎片
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void navigator.clipboard?.writeText(seg)}
                        >
                          复制
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setExpandOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
