import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearWenceHandoff, readWenceHandoff } from "../util/wence-handoff";
import { clearWenceRefsImport, readWenceRefsImport } from "../util/wence-refs-import";
import { writeAiPanelDraft } from "../util/ai-panel-draft";
import { writeEditorHitHandoff } from "../util/editor-hit-handoff";
import {
  listWenceSessionIndex,
  loadWenceSession,
  saveWenceSession,
  createWenceSession,
  deleteWenceSession,
  getActiveWenceSessionId,
  setActiveWenceSessionId,
  ensureWenceSessionsBootstrap,
  type WenceSessionStored,
  type WenceSessionIndexEntry,
} from "../util/wence-chat-sessions";
import {
  pullWenceSessionsFromCloud,
  pushWenceSessionToCloud,
  canSyncWenceToCloud,
} from "../util/wence-chat-cloud";
import { loadAiSettings, saveAiSettings, getProviderConfig } from "../ai/storage";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../ai/client";
import {
  buildWenceChatSystemContent,
  buildWenceChatApiMessages,
  type WenceChatWorkAttach,
} from "../ai/assemble-context";
import { readLastWorkId } from "../util/lastWorkId";
import type { AiChatMessage } from "../ai/types";
import {
  addBibleCharacter,
  addBibleForeshadow,
  addBibleGlossaryTerm,
  addBibleTimelineEvent,
  addBibleWorldEntry,
  getWork,
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listBibleWorldEntries,
  listChapters,
  listWorks,
} from "../db/repo";
import type { Work } from "../db/types";
import { workTagsToProfileText } from "../util/work-tags";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { cn } from "../lib/utils";
import {
  MessageSquare,
  Send,
  Plus,
  Search,
  MoreHorizontal,
  Sparkles,
  Clock,
  ChevronRight,
  Lightbulb,
  Target,
  Zap,
  Brain,
  BookOpen,
  Settings,
  Trash2,
  Edit3,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Network,
  Users,
  TrendingUp,
  Swords,
  Heart,
  Bookmark,
} from "lucide-react";
import { getMockReferenceBook, MOCK_REFERENCE_BOOKS } from "../data/reference-library-mock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { AIModelSelector, AI_MODELS } from "../components/ai-model-selector";
import { aiModelIdToProvider, aiProviderToModelId } from "../util/ai-ui-model-map";

// 运行时消息类型（带时间戳，展示用）
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// 会话列表项（UI 展示用，来自 WenceSessionIndexEntry）
interface Conversation {
  id: string;
  title: string;
  type: StrategyType;
  lastMessage: string;
  timestamp: number;
}

// ── 引用材料（P1-1） ──────────────────────────────────────────────────────

type WenceRefSourceModule = "tuiyan" | "liuguang" | "reference" | "writing" | "manual" | "handoff";

type WenceRefMaterial = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source: {
    module: WenceRefSourceModule;
    workId?: string | null;
    chapterId?: string | null;
    refWorkId?: string | null;
    hint?: string;
  };
};

function wenceRefsStorageKey(sessionId: string): string {
  return `liubai:wenceRefs:v1:${sessionId}`;
}

function loadWenceRefs(sessionId: string): WenceRefMaterial[] {
  try {
    const raw = localStorage.getItem(wenceRefsStorageKey(sessionId));
    if (!raw) return [];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: WenceRefMaterial[] = [];
    for (const row of j) {
      if (!row || typeof row !== "object") continue;
      const r = row as Partial<WenceRefMaterial>;
      if (typeof r.id !== "string" || !r.id) continue;
      if (typeof r.title !== "string") continue;
      if (typeof r.content !== "string") continue;
      if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) continue;
      const src = (r as any).source;
      if (!src || typeof src !== "object") continue;
      const module = (src as any).module;
      if (typeof module !== "string") continue;
      out.push({
        id: r.id,
        title: r.title,
        content: r.content,
        createdAt: r.createdAt,
        source: {
          module: module as WenceRefSourceModule,
          workId: (src as any).workId ?? undefined,
          chapterId: (src as any).chapterId ?? undefined,
          refWorkId: (src as any).refWorkId ?? undefined,
          hint: (src as any).hint ?? undefined,
        },
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function saveWenceRefs(sessionId: string, refs: WenceRefMaterial[]) {
  try {
    localStorage.setItem(wenceRefsStorageKey(sessionId), JSON.stringify(refs.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

// 策略类型定义（对齐 v0）
type StrategyType = "plot" | "character" | "worldbuilding" | "pacing" | "conflict" | "foreshadow";

const strategyConfig: Record<
  StrategyType,
  { icon: typeof Brain; label: string; description: string }
> = {
  plot: { icon: Network, label: "情节设计", description: "故事走向与转折点" },
  character: { icon: Users, label: "人物塑造", description: "性格、动机与弧光" },
  worldbuilding: { icon: BookOpen, label: "世界构建", description: "设定与规则体系" },
  pacing: { icon: TrendingUp, label: "节奏把控", description: "松紧与张弛有度" },
  conflict: { icon: Swords, label: "冲突设计", description: "矛盾与对抗升级" },
  foreshadow: { icon: Lightbulb, label: "伏笔铺设", description: "埋线与回收时机" },
};

function makeMsg(role: Message["role"], content: string): Message {
  return { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, content, timestamp: Date.now() };
}

/** AiChatMessage[] → Message[]（补 id 和 timestamp，展示用） */
function toDisplayMessages(stored: AiChatMessage[]): Message[] {
  return stored.map((m, i) => ({
    id: `m-${i}`,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: Date.now(),
  }));
}

/** 从会话索引项派生展示用 Conversation，strategy 从 title 的 [] 前缀解析 */
function indexEntryToConversation(e: WenceSessionIndexEntry, lastMsg = ""): Conversation {
  const match = e.title.match(/^\[([^\]]+)\]\s*(.*)/);
  const type: StrategyType = (match?.[1] as StrategyType) ?? "plot";
  const title = match?.[2] ?? e.title;
  return { id: e.id, title, type, lastMessage: lastMsg, timestamp: e.updatedAt };
}


/** 问策「技法卡」假数据：referenceBookId 对应 {@link MOCK_REFERENCE_BOOKS} */
type TechniqueCardMock = {
  id: string;
  categoryLabel: string;
  title: string;
  referenceBookId: string;
  summary: string;
  tags: string[];
};

const initialTechniqueCards: TechniqueCardMock[] = [
  {
    id: "tc-1",
    categoryLabel: "技法",
    title: "悬念层叠技法",
    referenceBookId: "1",
    summary:
      "在揭示一个谜底的同时，立即抛出更大的谜团。读者获得满足感的同时，好奇心被进一步勾起。",
    tags: ["悬念", "节奏", "钩子"],
  },
  {
    id: "tc-2",
    categoryLabel: "人物",
    title: "人物弧光三段式",
    referenceBookId: "9",
    summary:
      "起点状态（弱小但有特质）→ 成长催化（外部压力+内心觉醒）→ 蜕变展现（关键时刻的选择证明成长）",
    tags: ["人物塑造", "成长线", "结构"],
  },
  {
    id: "tc-3",
    categoryLabel: "节奏",
    title: "战斗节奏控制",
    referenceBookId: "10",
    summary:
      "在长战斗中穿插「呼吸点」——技能冷却、双方喘息、旁观者反应——让读者有消化空间，避免疲劳。",
    tags: ["战斗", "节奏", "技巧"],
  },
];

type BibleEntryType = "character" | "world" | "glossary" | "timeline" | "foreshadow";
const BIBLE_ENTRY_TYPES: { value: BibleEntryType; label: string }[] = [
  { value: "character", label: "人物" },
  { value: "world", label: "世界观条目" },
  { value: "glossary", label: "术语" },
  { value: "timeline", label: "时间线事件" },
  { value: "foreshadow", label: "伏笔" },
];

// v0 风格「快捷问题」
const quickQuestions = [
  { icon: Brain, label: "分析人物动机", prompt: "请帮我分析主角在这个情节中的行为动机是否合理，以及如何让读者更容易共情？" },
  { icon: Swords, label: "设计冲突升级", prompt: "当前章节的冲突强度不够，如何在保持合理性的前提下让矛盾更加尖锐？" },
  { icon: TrendingUp, label: "调整叙事节奏", prompt: "这几章的节奏有些拖沓，如何在不删减关键情节的情况下提升阅读体验？" },
  { icon: Lightbulb, label: "伏笔回收建议", prompt: "我在第 X 章埋下了这个伏笔，现在想在第 Y 章回收，请给我几个回收方案。" },
  { icon: Heart, label: "情感共鸣设计", prompt: "如何让这个场景更有感染力，让读者产生强烈的情感共鸣？" },
  { icon: Target, label: "章节目标检查", prompt: "请检查这章是否达成了应有的叙事目标，有哪些地方需要加强？" },
] as const;

export function ChatPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // ── 真实 session 状态，来自 localStorage ──────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    ensureWenceSessionsBootstrap(readLastWorkId());
    return listWenceSessionIndex().map((e) => {
      const stored = loadWenceSession(e.id);
      const lastMsg = stored?.messages.at(-1)?.content.slice(0, 80) ?? "";
      return indexEntryToConversation(e, lastMsg);
    });
  });
  const [currentConversation, setCurrentConversation] = useState<string>(() => {
    const active = getActiveWenceSessionId();
    const ids = new Set(listWenceSessionIndex().map((e) => e.id));
    return active && ids.has(active) ? active : (listWenceSessionIndex()[0]?.id ?? "");
  });
  /** 当前激活会话的消息（展示格式） */
  const [currentMessages, setCurrentMessages] = useState<Message[]>(() => {
    const active = getActiveWenceSessionId() ?? listWenceSessionIndex()[0]?.id;
    if (!active) return [];
    const stored = loadWenceSession(active);
    return stored ? toDisplayMessages(stored.messages) : [];
  });
  /** 流式输出中的 AI 回复片段 */
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── 其他 UI 状态 ─────────────────────────────────────────────────────
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStrategyFilter, setActiveStrategyFilter] = useState<StrategyType | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<"dialog" | "strategy" | "tech" | "refs">("strategy");
  const [quickQuestionsOpen, setQuickQuestionsOpen] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(() =>
    aiProviderToModelId(loadAiSettings().provider),
  );
  const selectedAiModel = useMemo(
    () => AI_MODELS.find((m) => m.id === selectedModelId) ?? AI_MODELS[0],
    [selectedModelId],
  );
  const handleSelectAiModel = useCallback((modelId: string) => {
    const provider = aiModelIdToProvider(modelId);
    const s = loadAiSettings();
    saveAiSettings({ ...s, provider });
    setSelectedModelId(modelId);
  }, []);
  const [techniqueCards, setTechniqueCards] = useState<TechniqueCardMock[]>(() => {
    try {
      const raw = localStorage.getItem("liubai:techniqueCards");
      if (raw) return JSON.parse(raw) as TechniqueCardMock[];
    } catch { /* ignore */ }
    return initialTechniqueCards;
  });
  const [bibleWriteStatus, setBibleWriteStatus] = useState<{ msgId: string; ok: boolean; label: string } | null>(null);
  const [bookmarkedTechniqueIds, setBookmarkedTechniqueIds] = useState<Set<string>>(
    () => new Set(["tc-1", "tc-2"]),
  );

  // 写入锦囊对话框状态
  const [bibleDialog, setBibleDialog] = useState<{ open: boolean; msgId: string; content: string }>({
    open: false, msgId: "", content: "",
  });
  const [bibleDialogWorks, setBibleDialogWorks] = useState<Work[]>([]);
  const [bibleDialogWorkId, setBibleDialogWorkId] = useState("");
  const [bibleDialogType, setBibleDialogType] = useState<BibleEntryType>("character");
  const [bibleDialogTitle, setBibleDialogTitle] = useState("");
  const [bibleDialogNote, setBibleDialogNote] = useState("");
  const [bibleDialogSubmitting, setBibleDialogSubmitting] = useState(false);

  // ── 问策上下文装配（关联作品 + 设定索引） ────────────────────────────────
  const [worksList, setWorksList] = useState<Work[]>([]);
  const [attachedWorkId, setAttachedWorkId] = useState<string | null>(null);
  const [attachedWork, setAttachedWork] = useState<Work | null>(null);
  const [includeSettingIndex, setIncludeSettingIndex] = useState(false);
  const [settingIndexText, setSettingIndexText] = useState("");
  const [settingIndexLoading, setSettingIndexLoading] = useState(false);

  // ── 引用材料（可见/可移除/可追溯） ───────────────────────────────────────
  const [refs, setRefs] = useState<WenceRefMaterial[]>([]);
  const [refDraftTitle, setRefDraftTitle] = useState("手动引用");
  const [refDraftContent, setRefDraftContent] = useState("");

  // ── 切换会话时重新加载消息 ────────────────────────────────────────────
  useEffect(() => {
    setActiveWenceSessionId(currentConversation);
    const stored = loadWenceSession(currentConversation);
    setCurrentMessages(stored ? toDisplayMessages(stored.messages) : []);
    setStreamingContent(null);
    setAttachedWorkId(stored?.workId ?? null);
    setIncludeSettingIndex(stored?.includeSettingIndex ?? false);
    setRefs(loadWenceRefs(currentConversation));
  }, [currentConversation]);

  // 关联作品信息（标题/标签侧写/风格卡）
  useEffect(() => {
    if (!attachedWorkId) {
      setAttachedWork(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const w = await getWork(attachedWorkId);
      if (cancelled) return;
      setAttachedWork(w ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachedWorkId]);

  // 设定索引文本（人物/世界观/术语名录）
  useEffect(() => {
    if (!includeSettingIndex || !attachedWorkId) {
      setSettingIndexText("");
      return;
    }
    let cancelled = false;
    setSettingIndexLoading(true);
    void (async () => {
      const [chars, worlds, gloss] = await Promise.all([
        listBibleCharacters(attachedWorkId),
        listBibleWorldEntries(attachedWorkId),
        listBibleGlossaryTerms(attachedWorkId),
      ]);
      const parts: string[] = [];
      if (chars.length) parts.push(`【人物】${chars.map((c) => c.name).join("、")}`);
      if (worlds.length) parts.push(`【世界观】${worlds.map((w) => w.title).join("、")}`);
      if (gloss.length) parts.push(`【术语】${gloss.map((g) => g.term).join("、")}`);
      const text = parts.join("\n");
      if (cancelled) return;
      setSettingIndexText(text);
    })()
      .catch(() => {
        if (!cancelled) setSettingIndexText("");
      })
      .finally(() => {
        if (!cancelled) setSettingIndexLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attachedWorkId, includeSettingIndex]);

  useEffect(() => {
    saveWenceRefs(currentConversation, refs);
  }, [currentConversation, refs]);

  // ── mount 时拉取云端会话 ──────────────────────────────────────────────
  useEffect(() => {
    const settings = loadAiSettings();
    if (!canSyncWenceToCloud(settings)) return;
    pullWenceSessionsFromCloud({
      settings,
      listLocal: () => {
        return listWenceSessionIndex()
          .map((e) => loadWenceSession(e.id))
          .filter((s): s is WenceSessionStored => s !== null);
      },
      upsertLocal: (s) => {
        saveWenceSession(s);
      },
    }).then(() => {
      // 刷新会话列表（可能有新会话拉入）
      setConversations(
        listWenceSessionIndex().map((e) => {
          const stored = loadWenceSession(e.id);
          const lastMsg = stored?.messages.at(-1)?.content.slice(0, 80) ?? "";
          return indexEntryToConversation(e, lastMsg);
        }),
      );
    }).catch(() => { /* 云同步失败静默 */ });
  }, []);

  // works list（关联作品选择用）
  useEffect(() => {
    void listWorks().then(setWorksList).catch(() => setWorksList([]));
  }, []);

  useEffect(() => {
    const onFocus = () =>
      setSelectedModelId(aiProviderToModelId(loadAiSettings().provider));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    // 推演交接：预填问策输入框（一次性消费）
    const sp = new URLSearchParams(location.search);
    if (sp.get("handoff") !== "1") return;
    const payload = readWenceHandoff();
    clearWenceHandoff();
    if (!payload) return;
    if (payload.refs && payload.refs.trim()) {
      const ref: WenceRefMaterial = {
        id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: payload.title?.trim() ? `交接：${payload.title.trim()}` : "交接引用",
        content: payload.refs.trim(),
        createdAt: Date.now(),
        source: { module: "handoff", workId: payload.workId, hint: "来自跨模块交接" },
      };
      setRefs((prev) => [ref, ...prev]);
      setRightPaneTab("dialog");
    }
    setInputMessage(payload.prompt);
    if (payload.workId) {
      setAttachedWorkId(payload.workId);
      const stored = loadWenceSession(currentConversation);
      if (stored && stored.workId !== payload.workId) {
        const updated: WenceSessionStored = { ...stored, workId: payload.workId, updatedAt: Date.now() };
        saveWenceSession(updated);
        setConversations((prev) =>
          prev.map((c) => (c.id === currentConversation ? { ...c, timestamp: updated.updatedAt } : c)),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    // 藏经等模块：仅导入引用材料，不覆盖输入框（一次性消费）
    const sp = new URLSearchParams(location.search);
    if (sp.get("refsImport") !== "1") return;
    const payload = readWenceRefsImport();
    clearWenceRefsImport();
    if (!payload) return;
    if (!payload.content.trim()) return;
    const ref: WenceRefMaterial = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: payload.title?.trim() ? payload.title.trim() : "藏经引用",
      content: payload.content.trim(),
      createdAt: Date.now(),
      source: {
        module: "reference",
        workId: payload.workId,
        refWorkId: payload.refWorkId,
        hint: payload.hint,
      },
    };
    setRefs((prev) => [ref, ...prev]);
    setRightPaneTab("refs");
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("refsImport");
      window.history.replaceState({}, "", u.toString());
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentConversation, currentMessages.length, streamingContent]);

  // 技法卡持久化
  useEffect(() => {
    localStorage.setItem("liubai:techniqueCards", JSON.stringify(techniqueCards));
  }, [techniqueCards]);

  /** 保存当前会话到 localStorage + 异步推送云端 */
  const persistSession = useCallback((sessionId: string, msgs: AiChatMessage[]) => {
    const now = Date.now();
    const existing = loadWenceSession(sessionId);
    if (!existing) return;
    const updated: WenceSessionStored = { ...existing, messages: msgs, updatedAt: now };
    saveWenceSession(updated);
    // 更新左侧会话列表预览
    setConversations((prev) =>
      prev.map((c) =>
        c.id === sessionId
          ? { ...c, lastMessage: msgs.at(-1)?.content.slice(0, 80) ?? "", timestamp: now }
          : c,
      ),
    );
    // 异步云端推送
    const settings = loadAiSettings();
    pushWenceSessionToCloud({ settings, session: updated }).catch(() => {});
  }, []);

  const handleSendMessage = useCallback(async () => {
    const text = inputMessage.trim();
    if (!text || isLoading) return;

    const userMsg = makeMsg("user", text);
    setInputMessage("");
    setIsLoading(true);

    // 追加用户消息到展示层
    const nextMessages = [...currentMessages, userMsg];
    setCurrentMessages(nextMessages);

    // 构建历史消息（AiChatMessage 格式）
    const sessionStored = loadWenceSession(currentConversation);
    const history: AiChatMessage[] = sessionStored?.messages ?? [];
    const newHistory: AiChatMessage[] = [...history, { role: "user", content: text }];

    try {
      const settings = loadAiSettings();
      const config = getProviderConfig(settings, settings.provider);
      let attached: WenceChatWorkAttach | null = null;
      if (attachedWorkId && attachedWork) {
        const card = await getWorkStyleCard(attachedWorkId).catch(() => undefined);
        attached = {
          workTitle: attachedWork.title ?? "未命名作品",
          workStyle: {
            pov: card?.pov ?? "",
            tone: card?.tone ?? "",
            bannedPhrases: card?.bannedPhrases ?? "",
            styleAnchor: card?.styleAnchor ?? "",
            extraRules: card?.extraRules ?? "",
          },
          tagProfileText: workTagsToProfileText(attachedWork.tags),
          settingIndexText: includeSettingIndex ? settingIndexText : undefined,
        };
      }
      let systemContent = buildWenceChatSystemContent(attached);
      if (refs.length > 0) {
        const block = refs
          .slice(0, 12)
          .map((r, idx) => {
            const head = `${idx + 1}. ${r.title}（来源：${r.source.module}${r.source.hint ? `·${r.source.hint}` : ""}）`;
            return `${head}\n${r.content.trim()}`;
          })
          .join("\n\n---\n\n");
        systemContent += `\n\n引用材料（用户提供/跨模块带入，可移除；不要把引用当作既定事实，请在回答中标注"基于引用材料"）：\n${block}`;
      }
      const apiMessages = buildWenceChatApiMessages(systemContent, newHistory);

      abortRef.current = new AbortController();
      let aiText = "";
      setStreamingContent("");

      await generateWithProviderStream({
        provider: settings.provider,
        config,
        messages: apiMessages,
        signal: abortRef.current.signal,
        onDelta: (delta) => {
          aiText += delta;
          setStreamingContent(aiText);
        },
      });

      setStreamingContent(null);
      const aiMsg = makeMsg("assistant", aiText);
      setCurrentMessages([...nextMessages, aiMsg]);

      // 保存到 localStorage + 云端
      const finalHistory: AiChatMessage[] = [...newHistory, { role: "assistant", content: aiText }];
      persistSession(currentConversation, finalHistory);
    } catch (err) {
      setStreamingContent(null);
      if (!isFirstAiGateCancelledError(err)) {
        const errMsg = makeMsg("assistant", `⚠️ AI 响应失败：${err instanceof Error ? err.message : "未知错误"}`);
        setCurrentMessages([...nextMessages, errMsg]);
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [
    inputMessage,
    isLoading,
    currentMessages,
    currentConversation,
    persistSession,
    attachedWorkId,
    attachedWork,
    includeSettingIndex,
    settingIndexText,
    refs,
  ]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString("zh-CN");
  };

  const filteredConversations = conversations.filter((c) => {
    const matchesFilter = activeStrategyFilter ? c.type === activeStrategyFilter : true;
    const q = searchQuery.trim();
    const matchesSearch = !q
      ? true
      : `${c.title} ${c.lastMessage}`.toLowerCase().includes(q.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const applyQuickPrompt = (prompt: string) => {
    setInputMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}` : prompt));
  };

  const activeConv = conversations.find((c) => c.id === currentConversation);
  const activeConvMessageCount = currentMessages.length;

  async function writeToBible(msgId: string, content: string, type: "character" | "world" | "glossary" | "timeline") {
    const workId = attachedWorkId ?? readLastWorkId();
    if (!workId) { alert("请先在写作页打开一部作品，再写入锦囊。"); return; }
    const label = type === "character" ? "人物" : type === "world" ? "世界观" : type === "glossary" ? "术语" : "时间线";
    try {
      let entryId: string | null = null;
      if (type === "character") {
        const e = await addBibleCharacter(workId, { name: content.slice(0, 60), motivation: content });
        entryId = e.id;
      } else if (type === "world") {
        const e = await addBibleWorldEntry(workId, { entryKind: "other", title: content.slice(0, 60), body: content });
        entryId = e.id;
      } else if (type === "glossary") {
        const e = await addBibleGlossaryTerm(workId, { term: content.slice(0, 40), category: "term", note: content });
        entryId = e.id;
      } else {
        const e = await addBibleTimelineEvent(workId, { label: content.slice(0, 60), note: content, chapterId: null });
        entryId = e.id;
      }
      setBibleWriteStatus({ msgId, ok: true, label });
      setTimeout(() => setBibleWriteStatus(null), 3000);

      // P0-3：写回后定位到新增条目
      if (entryId) {
        const tab =
          type === "character" ? "characters" : type === "world" ? "world" : type === "glossary" ? "glossary" : "timeline";
        navigate(`/work/${workId}/bible?tab=${tab}&entry=${encodeURIComponent(entryId)}`);
      }
    } catch (e) {
      setBibleWriteStatus({ msgId, ok: false, label: e instanceof Error ? e.message : "写入失败" });
      setTimeout(() => setBibleWriteStatus(null), 4000);
    }
  }

  async function writeToAiDraftFromAssistant(content: string) {
    const workId = attachedWorkId ?? readLastWorkId();
    if (!workId) {
      toast.info("请先在写作页打开/选择一部作品。");
      return;
    }
    const chapters = await listChapters(workId);
    if (chapters.length === 0) {
      toast.info("该作品还没有章节，请先在写作页创建章节。");
      return;
    }
    const sorted = [...chapters].sort((a, b) => a.order - b.order);
    const chapterId = sorted[0]!.id;
    const text = content.trim();
    if (!text) return;
    const r = writeAiPanelDraft(workId, chapterId, text + "\n");
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const needle = text.slice(0, 80);
    if (needle) {
      writeEditorHitHandoff({
        workId,
        chapterId,
        query: needle,
        isRegex: false,
        offset: 0,
        source: { module: "wence", title: "问策写回草稿", hint: "来自问策 AI 输出" },
      });
      navigate(`/work/${workId}?hit=1&chapter=${encodeURIComponent(chapterId)}`);
    } else {
      navigate(`/work/${workId}?chapter=${encodeURIComponent(chapterId)}`);
    }
  }

  const deleteConversation = (id: string) => {
    deleteWenceSession(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversation === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      if (remaining[0]) {
        setCurrentConversation(remaining[0].id);
      } else {
        // 没有剩余会话：新建一个
        const newId = createWenceSession({ workId: readLastWorkId() });
        setConversations([indexEntryToConversation({ id: newId, title: "新建对话", workId: null, updatedAt: Date.now() })]);
        setCurrentConversation(newId);
        setCurrentMessages([]);
      }
    }
  };

  const createConversation = () => {
    const baseType: StrategyType = activeStrategyFilter ?? "plot";
    const title = `[${baseType}] 新建对话`;
    const newId = createWenceSession({ workId: readLastWorkId(), title });
    setConversations((prev) => [
      indexEntryToConversation({ id: newId, title, workId: readLastWorkId(), updatedAt: Date.now() }),
      ...prev,
    ]);
    setCurrentConversation(newId);
    setCurrentMessages([]);
    setInputMessage("");
  };

  const deleteTechniqueCard = (id: string) => {
    setTechniqueCards((prev) => prev.filter((c) => c.id !== id));
    setBookmarkedTechniqueIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleTechniqueBookmark = (id: string) => {
    setBookmarkedTechniqueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMsgAsTechniqueCard = (content: string) => {
    const firstLine = content.split("\n").find((l) => l.trim()) ?? "";
    const title = firstLine.replace(/^[#*>\-\s]+/, "").slice(0, 40) || "AI 建议";
    const id = `tc-${Date.now()}`;
    const defaultBook = MOCK_REFERENCE_BOOKS[0];
    setTechniqueCards((prev) => [
      {
        id,
        categoryLabel: "AI提炼",
        title,
        referenceBookId: defaultBook?.id ?? "1",
        summary: content.slice(0, 220),
        tags: ["AI", "对话提炼"],
      },
      ...prev,
    ]);
    setRightPaneTab("tech");
  };

  const applyTechniqueCard = (card: TechniqueCardMock) => {
    const snippet = `【技法参考：${card.title}】\n${card.summary}`;
    setInputMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
  };

  // 会话级：更新关联作品与设定索引开关（写入 session store）
  const persistSessionMeta = useCallback(
    (patch: Partial<Pick<WenceSessionStored, "workId" | "includeSettingIndex">>) => {
      const stored = loadWenceSession(currentConversation);
      if (!stored) return;
      const updated: WenceSessionStored = { ...stored, ...patch, updatedAt: Date.now() };
      saveWenceSession(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === currentConversation ? { ...c, timestamp: updated.updatedAt } : c)),
      );
    },
    [currentConversation],
  );

  const addTechniqueCard = () => {
    const defaultBook = MOCK_REFERENCE_BOOKS[0];
    if (!defaultBook) return;
    const id = `tc-${Date.now()}`;
    setTechniqueCards((prev) => [
      {
        id,
        categoryLabel: "技法",
        title: "未命名技法卡",
        referenceBookId: defaultBook.id,
        summary: "在此填写从藏经参考书提炼的技法要点…",
        tags: ["新卡片"],
      },
      ...prev,
    ]);
  };

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧会话列表 */}
          <div className="w-72 border-r border-border/40 bg-card/20 flex flex-col">
            {/* 左上角标题（v0 风格） */}
            <div className="px-3 pt-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <MessageSquare className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-semibold leading-5 text-foreground">问策</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">策略对话 · 创作咨询</div>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="新建对话"
                  onClick={createConversation}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 搜索 */}
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索对话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background/50"
                />
              </div>

              {/* 策略类型筛选（从 v0 抄过来） */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveStrategyFilter(null)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    activeStrategyFilter === null
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  全部
                </button>
                {Object.entries(strategyConfig).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveStrategyFilter(key as StrategyType)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                      activeStrategyFilter === key
                        ? "bg-primary/20 text-primary"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <cfg.icon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 会话列表 */}
            <div className="flex-1 overflow-auto px-2">
              <div className="space-y-0.5">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setCurrentConversation(conv.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                      currentConversation === conv.id
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate pr-2">{conv.title}</span>
                      <span className="text-[10px] shrink-0">
                        {formatRelativeTime(conv.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs line-clamp-1 opacity-70">{conv.lastMessage}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="h-4 text-[10px] px-1">
                        {loadWenceSession(conv.id)?.messages.length ?? 0} 条消息
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 中间对话区 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 对话头部 */}
            <div className="flex items-center justify-between border-b border-border/40 bg-card/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <h2 className="font-medium">
                  {activeConv?.title}
                </h2>
                <Badge
                  variant="outline"
                  className="h-auto max-w-[min(14rem,40vw)] gap-1 py-0.5 pl-1.5 pr-2 text-[10px]"
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate font-medium">{selectedAiModel.name}</span>
                  {selectedAiModel.id.startsWith("qianlong") ? (
                    <span className="shrink-0 text-muted-foreground">· {selectedAiModel.subtitle}</span>
                  ) : null}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>重命名</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Copy className="mr-2 h-4 w-4" />
                      复制对话
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <BookOpen className="mr-2 h-4 w-4" />
                      导出记录
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (!activeConv) return;
                        deleteConversation(activeConv.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除对话
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {currentMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "flex-row-reverse" : ""
                  )}
                >
                  {/* 头像 */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      message.role === "assistant"
                        ? "bg-primary/10"
                        : "bg-muted"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <Sparkles className="h-4 w-4 text-primary" />
                    ) : (
                      <span className="text-xs">我</span>
                    )}
                  </div>

                  {/* 消息内容 */}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      message.role === "assistant"
                        ? "bg-muted/50 text-foreground"
                        : "bg-primary/10 text-foreground"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                    <div className={cn("mt-1 flex items-center gap-2 text-[10px]", message.role === "assistant" ? "text-muted-foreground" : "text-primary/70")}>
                      {formatTime(message.timestamp)}
                      {message.role === "assistant" && (
                        <>
                          {bibleWriteStatus?.msgId === message.id ? (
                            <span className={cn("flex items-center gap-0.5", bibleWriteStatus.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                              {bibleWriteStatus.ok ? <Check className="h-2.5 w-2.5" /> : null}
                              {bibleWriteStatus.ok ? `已写入锦囊·${bibleWriteStatus.label}` : bibleWriteStatus.label}
                            </span>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                                  写入锦囊 ▾
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="text-xs">
                                <DropdownMenuItem onClick={() => void writeToBible(message.id, message.content, "character")}>人物</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void writeToBible(message.id, message.content, "world")}>世界观条目</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void writeToBible(message.id, message.content, "glossary")}>术语</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void writeToBible(message.id, message.content, "timeline")}>时间线事件</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <button
                            type="button"
                            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            onClick={() => saveMsgAsTechniqueCard(message.content)}
                          >
                            保存为技法卡
                          </button>
                          <button
                            type="button"
                            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            onClick={() => void writeToAiDraftFromAssistant(message.content)}
                          >
                            写入草稿
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="max-w-[80%] bg-muted/50 rounded-2xl px-4 py-2.5 text-sm text-foreground">
                    {streamingContent ? (
                      <div className="whitespace-pre-wrap">{streamingContent}</div>
                    ) : (
                      <div className="flex gap-1 py-1">
                        <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce" />
                        <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce [animation-delay:0.1s]" />
                        <span className="h-2 w-2 rounded-full bg-primary/50 animate-bounce [animation-delay:0.2s]" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 输入区 */}
            <div className="border-t border-border/40 bg-card/20 p-4">
              {/* 快捷问题（置于输入框上方；横向滚动，避免不全） */}
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickQuestionsOpen((v) => !v)}
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    aria-expanded={quickQuestionsOpen}
                  >
                    快捷问题
                    {quickQuestionsOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 min-w-0 max-w-[min(12rem,42vw)] flex-1 gap-1 px-2 sm:flex-initial"
                          onClick={() => setShowModelSelector(true)}
                          aria-label="选择 AI 模型"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>div]:h-5 [&>div]:w-5 [&>div]:scale-[0.62] [&>div]:origin-center">
                            {selectedAiModel.icon}
                          </span>
                          <span className="min-w-0 truncate text-xs font-medium">
                            {selectedAiModel.name}
                            {selectedAiModel.id.startsWith("qianlong")
                              ? ` · ${selectedAiModel.subtitle}`
                              : ""}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">当前模型（与全局 AI 设置同步）</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        历史
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>对话历史</DialogTitle>
                      </DialogHeader>
                      <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
                        {currentMessages.map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              "rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-sm",
                              m.role === "user" ? "bg-primary/5" : ""
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                {m.role === "user" ? "我" : "助手"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(m.timestamp)}
                              </span>
                            </div>
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <AIModelSelector
                  open={showModelSelector}
                  onOpenChange={setShowModelSelector}
                  selectedModelId={selectedModelId}
                  onSelectModel={handleSelectAiModel}
                  title="选择模型"
                />
                {quickQuestionsOpen && (
                  <div className="-mx-1 overflow-x-auto px-1">
                    <div className="flex w-max gap-2">
                      {quickQuestions.map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => applyQuickPrompt(q.prompt)}
                          className="flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3 py-1.5 text-xs text-foreground/90 hover:bg-card/80 transition-colors"
                        >
                          <q.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="whitespace-nowrap">{q.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="输入你的问题..."
                  className="min-h-[80px] max-h-[60vh] resize-y"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <BookOpen className="h-3.5 w-3.5" />
                    引用锦囊
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <Target className="h-3.5 w-3.5" />
                    关联章节
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                >
                  <Send className="h-4 w-4" />
                  发送
                </Button>
              </div>
            </div>
          </div>

          {/* 右侧策略面板 */}
          <div className="w-72 border-l border-border/40 bg-card/20 flex flex-col">
            <div className="border-b border-border/40 p-3">
              <div className="flex items-center gap-1.5">
                <div
                  className="grid min-h-8 min-w-0 flex-1 grid-cols-4 gap-0.5 rounded-lg bg-muted/40 p-0.5"
                  role="tablist"
                  aria-label="右侧面板"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPaneTab === "dialog"}
                    onClick={() => setRightPaneTab("dialog")}
                    className={cn(
                      "rounded-md px-1 py-1.5 text-center text-xs transition-colors",
                      rightPaneTab === "dialog"
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    对话
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPaneTab === "strategy"}
                    onClick={() => setRightPaneTab("strategy")}
                    className={cn(
                      "rounded-md px-1 py-1.5 text-center text-xs transition-colors",
                      rightPaneTab === "strategy"
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    策略
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPaneTab === "tech"}
                    onClick={() => setRightPaneTab("tech")}
                    className={cn(
                      "rounded-md px-1 py-1.5 text-center text-xs transition-colors",
                      rightPaneTab === "tech"
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    技法卡
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightPaneTab === "refs"}
                    onClick={() => setRightPaneTab("refs")}
                    className={cn(
                      "rounded-md px-1 py-1.5 text-center text-xs transition-colors",
                      rightPaneTab === "refs"
                        ? "bg-background/90 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    引用
                  </button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" aria-label="面板设置">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">会话装配</div>
                    <div className="px-2 py-2">
                      <div className="text-xs text-muted-foreground mb-1">关联作品</div>
                      <select
                        className="input wence-select w-full text-xs"
                        value={attachedWorkId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          setAttachedWorkId(v);
                          persistSessionMeta({ workId: v });
                        }}
                      >
                        <option value="">不关联（通用咨询）</option>
                        {worksList.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.title.trim() || "未命名作品"}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        提示：关联作品后可注入风格卡/标签侧写/（可选）设定索引。
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        const next = !includeSettingIndex;
                        setIncludeSettingIndex(next);
                        persistSessionMeta({ includeSettingIndex: next });
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>设定索引（人物/世界观/术语）</span>
                        <span className="text-xs text-muted-foreground">{includeSettingIndex ? "开" : "关"}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setRightPaneTab("refs")}>
                      打开引用材料
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {includeSettingIndex ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <div className="text-xs font-medium text-foreground">已开启设定索引</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    会向 AI 注入人物/世界观/术语名录（非正文）。{settingIndexLoading ? "正在加载索引…" : null}
                  </div>
                  {attachedWork ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">关联作品：{attachedWork.title}</div>
                  ) : null}
                </div>
              ) : null}
              {rightPaneTab === "dialog" && (
                <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium">当前对话</div>
                    <Badge variant="secondary" className="h-5 text-[10px] px-2">
                      {activeConvMessageCount} 条
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="truncate">标题：{activeConv?.title ?? "-"}</div>
                    <div className="truncate">
                      类型：
                      {activeConv ? strategyConfig[activeConv.type].label : "-"}
                    </div>
                    <div className="truncate">
                      最近：{activeConv ? formatRelativeTime(activeConv.timestamp) : "-"}
                    </div>
                  </div>
                </div>
              )}

              {rightPaneTab === "strategy" && (
                <>
                  {/* 写作技法（策略里） */}
                  <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">写作技法</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      当前对话中可以使用"三幕式结构\"来组织剧情，让故事更有张力
                    </p>
                  </div>

                  {/* 关联内容 */}
                  <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">关联内容</span>
                    </div>
                    <div className="space-y-1.5">
                      <button className="w-full text-left text-xs text-muted-foreground hover:text-foreground truncate">
                        • 第一章：初入江湖
                      </button>
                      <button className="w-full text-left text-xs text-muted-foreground hover:text-foreground truncate">
                        • 主角人物设定
                      </button>
                      <button className="w-full text-left text-xs text-muted-foreground hover:text-foreground truncate">
                        • 宗门世界观
                      </button>
                    </div>
                  </div>

                  {/* 快捷操作 */}
                  <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">快捷操作</span>
                    </div>
                    <div className="space-y-1.5">
                      <Button variant="outline" size="sm" className="w-full justify-start text-xs h-7">
                        <ChevronRight className="h-3 w-3 mr-1" />
                        生成剧情分支
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start text-xs h-7">
                        <ChevronRight className="h-3 w-3 mr-1" />
                        优化对话描写
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start text-xs h-7">
                        <ChevronRight className="h-3 w-3 mr-1" />
                        检查逻辑漏洞
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {rightPaneTab === "tech" && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">技法卡片</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        从参考书中提炼的写作技法与结构分析（来源关联藏经假数据）
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      onClick={addTechniqueCard}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新建卡片
                    </Button>
                  </div>

                  {techniqueCards.map((card) => {
                    const book = getMockReferenceBook(card.referenceBookId);
                    const bookmarked = bookmarkedTechniqueIds.has(card.id);
                    return (
                      <div
                        key={card.id}
                        className="rounded-xl border border-border/40 bg-card/50 p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <Badge variant="secondary" className="h-5 text-[10px]">
                            {card.categoryLabel}
                          </Badge>
                          <div className="flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              aria-label={bookmarked ? "取消收藏" : "收藏"}
                              onClick={() => toggleTechniqueBookmark(card.id)}
                            >
                              <Bookmark
                                className={cn(
                                  "h-4 w-4",
                                  bookmarked
                                    ? "fill-primary text-primary"
                                    : "text-muted-foreground",
                                )}
                              />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              aria-label="删除技法卡"
                              onClick={() => deleteTechniqueCard(card.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm font-medium leading-snug">{card.title}</div>
                        <div className="mt-1.5">
                          <Link
                            to="/reference"
                            className="text-[11px] text-primary hover:underline"
                            title="打开藏经参考书库"
                          >
                            来源：《{book?.title ?? "未知书目"}》
                          </Link>
                          {book ? (
                            <span className="text-[10px] text-muted-foreground"> · {book.author}</span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {card.summary}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {card.tags.map((t) => (
                            <span key={t} className="text-[10px] text-muted-foreground">
                              #{t}
                            </span>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2.5 h-7 w-full gap-1 text-xs"
                          onClick={() => applyTechniqueCard(card)}
                        >
                          <ChevronRight className="h-3 w-3" />
                          应用到当前对话
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {rightPaneTab === "refs" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="text-sm font-medium">引用材料</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      这些材料会作为"引用"注入系统提示词，可逐条移除。请仅用于辅助分析，不要洗稿或大段照搬。
                    </p>
                    <div className="mt-2 space-y-2">
                      <Label className="text-xs">标题</Label>
                      <Input value={refDraftTitle} onChange={(e) => setRefDraftTitle(e.target.value)} />
                      <Label className="text-xs">内容</Label>
                      <Textarea
                        value={refDraftContent}
                        onChange={(e) => setRefDraftContent(e.target.value)}
                        placeholder="粘贴要引用的材料…"
                        className="min-h-[90px] resize-y"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={!refDraftContent.trim()}
                        onClick={() => {
                          const r: WenceRefMaterial = {
                            id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            title: (refDraftTitle || "手动引用").trim().slice(0, 60),
                            content: refDraftContent.trim(),
                            createdAt: Date.now(),
                            source: { module: "manual", workId: attachedWorkId, hint: "手动粘贴" },
                          };
                          setRefs((prev) => [r, ...prev]);
                          setRefDraftContent("");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加引用
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-card/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">已引用（{refs.length}）</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        disabled={refs.length === 0}
                        onClick={() => setRefs([])}
                      >
                        清空
                      </Button>
                    </div>
                    {refs.length === 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">暂无引用材料。</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {refs.slice(0, 20).map((r) => (
                          <div key={r.id} className="rounded-lg border border-border/40 bg-background/40 p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-foreground">{r.title}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  来源：{r.source.module}
                                  {r.source.hint ? ` · ${r.source.hint}` : ""}
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                aria-label="移除引用"
                                onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] text-muted-foreground">
                              {r.content}
                            </div>
                          </div>
                        ))}
                        {refs.length > 20 ? (
                          <div className="text-[10px] text-muted-foreground">仅展示前 20 条引用。</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
