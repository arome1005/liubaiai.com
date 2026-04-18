import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { cn } from "../lib/utils";
import {
  addBibleCharacter,
  addBibleGlossaryTerm,
  addBibleWorldEntry,
  addBibleTimelineEvent,
  addWritingStyleSample,
  addReferenceExcerpt,
  addReferenceExtract,
  clearAllReferenceLibraryData,
  createReferenceFromPlainText,
  createReferenceTag,
  deleteReferenceExcerpt,
  deleteReferenceExtract,
  deleteReferenceLibraryEntry,
  deleteReferenceTag,
  getReferenceChunkAt,
  getWork,
  listChapters,
  listReferenceExcerptsWithTagIds,
  listReferenceChapterHeads,
  listReferenceExtracts,
  listReferenceLibrary,
  listReferenceTags,
  listWorks,
  rebuildAllReferenceSearchIndex,
  searchReferenceLibrary,
  updateReferenceExcerpt,
  updateReferenceExtract,
  updateReferenceLibraryEntry,
} from "../db/repo";
import type {
  Chapter,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceExtract,
  ReferenceExtractType,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  Work,
} from "../db/types";
import { REFERENCE_IMPORT_HEAVY_BYTES } from "../db/types";
import {
  extractReferenceContent,
  getExtractTypeLabel,
  EXTRACT_TYPES,
  ReferenceExtractError,
} from "../ai/reference-extract";
import { getDB } from "../db/database";
import { extractPlainTextFromDocx } from "../util/extract-docx-text";
import { extractPlainTextFromPdf } from "../util/extract-pdf-text";
import { readUtf8TextFileWithCheck } from "../util/readUtf8TextFile";
import { downloadReferenceLibraryZip } from "../util/reference-batch-export";
import {
  loadReferenceFavoriteIds,
  loadReferenceFavoriteScope,
  saveReferenceFavoriteIds,
  saveReferenceFavoriteScope,
  type ReferenceFavoriteScope,
} from "../util/reference-favorites";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Book,
  FileText,
  Star,
  Grid3X3,
  List,
  Filter,
  ChevronDown,
  Search,
  Upload,
  Download,
  Eye,
  Edit3,
  MoreVertical,
  Tag,
  Trash2,
  X,
  SortAsc,
  Bookmark,
  Clock,
  BarChart3,
  TrendingUp,
  Reply,
  Wand2,
  Sparkles,
} from "lucide-react";
import { PromptExtractDialog } from "../components/PromptExtractDialog";
import { ReferenceAiChatDialog } from "../components/ReferenceAiChatDialog";
import { parseReferenceKeyCardsFromExtractBody, type ReferenceKeyCard } from "../util/reference-key-cards";
import { writeAiPanelDraft } from "../util/ai-panel-draft";
import { writeWenceRefsImport } from "../util/wence-refs-import";
import { writeEditorHitHandoff } from "../util/editor-hit-handoff";
import { writeEditorRefsImport } from "../util/editor-refs-import";

const CONTEXT_TAIL = 280;
const CONTEXT_HEAD = 280;

const LS_REF_PROGRESS_FILTER = "liubai-ref3_8-progress-filter";
const LS_REF_PROGRESS_WORK = "liubai-ref3_8-progress-work";
const LS_REF_READER_POS_PREFIX = "liubai-ref:readerPos:";
const LS_REF_VIEW_MODE = "liubai:referenceViewMode";
const LS_REF_SEARCH_MODE = "liubai:referenceSearchMode";
const LS_REF_SORT_BY = "liubai:referenceSortBy";
type ReferenceSortBy = "recent" | "words" | "progress";

/** 统计非标点符号字符数 */
function countNonPunctuation(s: string): number {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length;
}

type ReferenceViewMode = "grid" | "list";
type ReferenceSearchMode = "strict" | "hybrid";

function loadReferenceSearchMode(): ReferenceSearchMode {
  try {
    return localStorage.getItem(LS_REF_SEARCH_MODE) === "hybrid" ? "hybrid" : "strict";
  } catch {
    return "strict";
  }
}

function loadProgressFilterEnabled(): boolean {
  try {
    return localStorage.getItem(LS_REF_PROGRESS_FILTER) === "1";
  } catch {
    return false;
  }
}

function loadProgressFilterWorkId(): string {
  try {
    return localStorage.getItem(LS_REF_PROGRESS_WORK) ?? "";
  } catch {
    return "";
  }
}

/** 与全书搜索「仅进度前」一致：关联章节 order 严格小于进度章 order */
function isLinkedChapterBeforeProgress(
  chapters: Chapter[],
  progressCursor: string | null,
  linkedChapterId: string | null | undefined,
): boolean {
  if (!linkedChapterId || !progressCursor) return true;
  const cur = chapters.find((c) => c.id === progressCursor);
  const linkCh = chapters.find((c) => c.id === linkedChapterId);
  if (!cur || !linkCh) return true;
  return linkCh.order < cur.order;
}

function refCoverHue(refId: string): number {
  let h = 0;
  for (let i = 0; i < refId.length; i++) h = (h * 31 + refId.charCodeAt(i)) >>> 0;
  return h % 360;
}

function highlightChunkText(text: string, start: number, end: number) {
  if (start < 0 || end > text.length || start >= end) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, start)}
      <mark className="reference-highlight-mark">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function ReferenceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReferenceLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  /** 大文件（≥5MB）或长时间索引：全屏式进度 */
  const [heavyJob, setHeavyJob] = useState<{
    phase: "chunks" | "index";
    percent: number;
    label?: string;
    fileName?: string;
  } | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [maintainBusy, setMaintainBusy] = useState(false);

  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<ReferenceSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [refSearchMode, setRefSearchMode] = useState<ReferenceSearchMode>(loadReferenceSearchMode);
  /** 仅搜当前打开的书；null = 全库 */
  const [searchScopeRefId, setSearchScopeRefId] = useState<string | null>(null);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const searchDialogRef = useRef<HTMLTextAreaElement>(null);

  const [activeRefId, setActiveRefId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  /** 3.7：阅读器仅保留当前段与相邻段正文，不全量载入 */
  const [activeChunkCount, setActiveChunkCount] = useState(0);
  const [loadedChunks, setLoadedChunks] = useState<{
    prev?: ReferenceChunk;
    cur?: ReferenceChunk;
    next?: ReferenceChunk;
  }>({});
  const [focusOrdinal, setFocusOrdinal] = useState(0);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  const [activeChapterHeads, setActiveChapterHeads] = useState<ReferenceChapterHead[]>([]);

  const [readerCollapsed, setReaderCollapsed] = useState(false);
  const [excerpts, setExcerpts] = useState<Array<ReferenceExcerpt & { tagIds: string[] }>>([]);
  const [allTags, setAllTags] = useState<ReferenceTag[]>([]);
  const [excerptTagFilterId, setExcerptTagFilterId] = useState<string>("");
  const [progressFilterEnabled, setProgressFilterEnabled] = useState(loadProgressFilterEnabled);
  const [progressFilterWorkId, setProgressFilterWorkId] = useState(loadProgressFilterWorkId);
  const [progressChapters, setProgressChapters] = useState<Chapter[]>([]);
  const [progressCursor, setProgressCursor] = useState<string | null>(null);
  const [worksList, setWorksList] = useState<Work[]>([]);
  const [editingExcerptId, setEditingExcerptId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [editLinkedWorkId, setEditLinkedWorkId] = useState<string>("");
  const [editLinkedChapterId, setEditLinkedChapterId] = useState<string>("");
  const [editChapters, setEditChapters] = useState<Chapter[]>([]);
  const [newTagName, setNewTagName] = useState("");
  /** 书目 id → 检测到的章节标题行（展开时懒加载） */
  const [refChapterHeadsById, setRefChapterHeadsById] = useState<Record<string, ReferenceChapterHead[]>>({});
  const [refHeadsForHits, setRefHeadsForHits] = useState<Record<string, ReferenceChapterHead[]>>({});
  const [viewMode, setViewMode] = useState<ReferenceViewMode>(() => {
    try {
      const v = localStorage.getItem(LS_REF_VIEW_MODE);
      return v === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadReferenceFavoriteIds());
  const [favoriteScope, setFavoriteScope] = useState<ReferenceFavoriteScope>(() => loadReferenceFavoriteScope());
  const [exportSelection, setExportSelection] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<ReferenceSortBy>(() => {
    try {
      const v = localStorage.getItem(LS_REF_SORT_BY);
      if (v === "words" || v === "progress") return v;
      return "recent";
    } catch { return "recent"; }
  });
  const [extractCountById, setExtractCountById] = useState<Record<string, number>>({});

  // ── 提炼要点（P1-03）状态 ──────────────────────────────────────────────
  // ── 提炼提示词 Dialog 状态 ──────────────────────────────────────────────────
  const [promptExtractDialogOpen, setPromptExtractDialogOpen] = useState(false);
  const [promptExtractSource, setPromptExtractSource] = useState<
    | { kind: "excerpt"; excerptText: string; excerptNote?: string; excerptId: string; bookTitle?: string }
    | { kind: "book"; chunkCount: number; bookTitle?: string }
    | null
  >(null);
  const promptExtractChunksRef = useRef<string[]>([]);

  // ── 藏经 AI 聊天弹窗（自由提炼提示词） ───────────────────────────────────────
  const [aiChatDialogOpen, setAiChatDialogOpen] = useState(false);
  const [aiChatBookChunks, setAiChatBookChunks] = useState<string[]>([]);

  const [extractPanelOpen, setExtractPanelOpen] = useState(false);
  const [extractType, setExtractType] = useState<ReferenceExtractType>("characters");
  const [extractStreaming, setExtractStreaming] = useState("");
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [savedExtracts, setSavedExtracts] = useState<ReferenceExtract[]>([]);
  const importAbortRef = useRef<AbortController | null>(null);

  // ── 书籍详情工作台（P2-1） ───────────────────────────────────────────────
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchRefId, setWorkbenchRefId] = useState<string | null>(null);
  const [workbenchEntry, setWorkbenchEntry] = useState<ReferenceLibraryEntry | null>(null);
  const [workbenchHeads, setWorkbenchHeads] = useState<ReferenceChapterHead[]>([]);
  const [workbenchExcerpts, setWorkbenchExcerpts] = useState<Array<ReferenceExcerpt & { tagIds: string[] }>>([]);
  const [workbenchExtracts, setWorkbenchExtracts] = useState<ReferenceExtract[]>([]);
  const [workbenchTab, setWorkbenchTab] = useState<"overview" | "excerpts" | "extracts">("overview");

  type ConfirmKind =
    | "delete-book"
    | "delete-excerpt"
    | "delete-tag"
    | "clear-library"
    | "delete-extract"
    | "simple";
  type ConfirmState =
    | { open: false }
    | {
        open: true;
        kind: ConfirmKind;
        title: string;
        description: string;
        actionText: string;
        destructive?: boolean;
        payload: Record<string, unknown>;
      };

  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);

  function openConfirm(next: Omit<Extract<ConfirmState, { open: true }>, "open">) {
    setConfirmState({ open: true, ...next });
  }

  function confirmOnce(opts: { title: string; description: string; actionText: string; destructive?: boolean }) {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      openConfirm({
        kind: "simple",
        title: opts.title,
        description: opts.description,
        actionText: opts.actionText,
        destructive: opts.destructive,
        payload: {},
      });
    });
  }

  async function runConfirmAction() {
    if (!confirmState.open) return;
    if (confirmBusy) return;
    setConfirmBusy(true);
    try {
      switch (confirmState.kind) {
        case "delete-book": {
          const id = String(confirmState.payload.id ?? "");
          if (!id) break;
          await deleteReferenceLibraryEntry(id);
          if (activeRefId === id) {
            setActiveRefId(null);
            setActiveChunkCount(0);
            setLoadedChunks({});
            setExcerpts([]);
            setHighlight(null);
          }
          if (searchScopeRefId === id) setSearchScopeRefId(null);
          await refresh();
          break;
        }
        case "delete-excerpt": {
          const id = String(confirmState.payload.id ?? "");
          if (!id) break;
          await deleteReferenceExcerpt(id);
          if (activeRefId) await loadExcerpts(activeRefId);
          if (editingExcerptId === id) setEditingExcerptId(null);
          break;
        }
        case "delete-tag": {
          const id = String(confirmState.payload.id ?? "");
          if (!id) break;
          await deleteReferenceTag(id);
          if (excerptTagFilterId === id) setExcerptTagFilterId("");
          await refresh();
          if (activeRefId) await loadExcerpts(activeRefId);
          break;
        }
        case "clear-library": {
          setMaintainBusy(true);
          try {
            await clearAllReferenceLibraryData();
            setActiveRefId(null);
            setActiveChunkCount(0);
            setLoadedChunks({});
            setExcerpts([]);
            setSearchHits([]);
            await refresh();
          } finally {
            setMaintainBusy(false);
          }
          break;
        }
        case "delete-extract": {
          const id = String(confirmState.payload.id ?? "");
          if (!id) break;
          await deleteReferenceExtract(id);
          setSavedExtracts((prev) => prev.filter((e) => e.id !== id));
          break;
        }
        case "simple": {
          confirmResolveRef.current?.(true);
          confirmResolveRef.current = null;
          break;
        }
        default:
          break;
      }
    } finally {
      setConfirmBusy(false);
      setConfirmState({ open: false });
    }
  }
  const [importWorkId, setImportWorkId] = useState<string>("");
  const [importBusy, setImportBusy] = useState<Record<string, boolean>>({});
  const extractAbortRef = useRef<AbortController | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const chunkAnchorRef = useRef<HTMLDivElement>(null);

  function loadReaderPos(refWorkId: string): number | null {
    try {
      const raw = localStorage.getItem(LS_REF_READER_POS_PREFIX + refWorkId);
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  function saveReaderPos(refWorkId: string, ordinal: number) {
    try {
      localStorage.setItem(LS_REF_READER_POS_PREFIX + refWorkId, String(ordinal));
    } catch {
      /* ignore */
    }
  }

  async function refresh() {
    setItems(await listReferenceLibrary());
    setAllTags(await listReferenceTags());
    setRefChapterHeadsById({});
    setRefHeadsForHits({});
  }

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const c = (it.category ?? "").trim();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (categoryFilter) list = list.filter((it) => (it.category ?? "").trim() === categoryFilter);
    if (favoriteScope === "favorites") list = list.filter((it) => favoriteIds.has(it.id));
    list = [...list].sort((a, b) => {
      if (sortBy === "words") return b.totalChars - a.totalChars;
      if (sortBy === "progress") {
        const pctA = a.chunkCount > 1 ? ((loadReaderPos(a.id) ?? 0) / (a.chunkCount - 1)) : 0;
        const pctB = b.chunkCount > 1 ? ((loadReaderPos(b.id) ?? 0) / (b.chunkCount - 1)) : 0;
        return pctB - pctA;
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [items, categoryFilter, favoriteScope, favoriteIds, sortBy]);

  useEffect(() => {
    const valid = new Set(items.map((i) => i.id));
    setFavoriteIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size !== prev.size) saveReferenceFavoriteIds(next);
      return next;
    });
    setExportSelection((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    saveReferenceFavoriteScope(favoriteScope);
  }, [favoriteScope]);

  const libraryTotals = useMemo(() => {
    let chars = 0;
    for (const it of items) chars += it.totalChars;
    return { count: items.length, chars };
  }, [items]);

  const totalExtracts = useMemo(() => Object.values(extractCountById).reduce((a, b) => a + b, 0), [extractCountById]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_REF_VIEW_MODE, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem(LS_REF_SORT_BY, sortBy); } catch { /* ignore */ }
  }, [sortBy]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_REF_SEARCH_MODE, refSearchMode);
    } catch {
      /* ignore */
    }
  }, [refSearchMode]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
        setWorksList(await listWorks());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 加载每本书的提炼条目数
  useEffect(() => {
    if (items.length === 0) { setExtractCountById({}); return; }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        items.map(async (it) => [it.id, (await listReferenceExtracts(it.id)).length] as const)
      );
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const [id, n] of entries) counts[id] = n;
      setExtractCountById(counts);
    })();
    return () => { cancelled = true; };
  }, [items]);

  // 提炼面板变化时同步当前书的计数
  useEffect(() => {
    if (!activeRefId) return;
    setExtractCountById(prev => ({ ...prev, [activeRefId]: savedExtracts.length }));
  }, [activeRefId, savedExtracts.length]);

  const loadExcerpts = useCallback(async (refId: string) => {
    setExcerpts(await listReferenceExcerptsWithTagIds(refId));
  }, []);

  useEffect(() => {
    if (!progressFilterWorkId) {
      setProgressChapters([]);
      setProgressCursor(null);
      return;
    }
    void (async () => {
      const w = await getWork(progressFilterWorkId);
      const ch = await listChapters(progressFilterWorkId);
      setProgressCursor(w?.progressCursor ?? null);
      setProgressChapters([...ch].sort((a, b) => a.order - b.order));
    })();
  }, [progressFilterWorkId]);

  useEffect(() => {
    if (!editLinkedWorkId) {
      setEditChapters([]);
      return;
    }
    void listChapters(editLinkedWorkId).then((c) => {
      setEditChapters([...c].sort((a, b) => a.order - b.order));
    });
  }, [editLinkedWorkId]);

  useEffect(() => {
    if (!activeRefId || activeChunkCount === 0) {
      setLoadedChunks({});
      return;
    }
    let cancelled = false;
    const o = Math.max(0, Math.min(focusOrdinal, activeChunkCount - 1));
    if (o !== focusOrdinal) {
      setFocusOrdinal(o);
      return;
    }
    void (async () => {
      const [prev, cur, next] = await Promise.all([
        o > 0 ? getReferenceChunkAt(activeRefId, o - 1) : Promise.resolve(undefined),
        getReferenceChunkAt(activeRefId, o),
        o + 1 < activeChunkCount ? getReferenceChunkAt(activeRefId, o + 1) : Promise.resolve(undefined),
      ]);
      if (!cancelled) setLoadedChunks({ prev, cur, next });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRefId, focusOrdinal, activeChunkCount]);

  useEffect(() => {
    if (!activeRefId) {
      setActiveChapterHeads([]);
      return;
    }
    void listReferenceChapterHeads(activeRefId).then(setActiveChapterHeads);
  }, [activeRefId]);

  useEffect(() => {
    if (!activeRefId) return;
    saveReaderPos(activeRefId, focusOrdinal);
  }, [activeRefId, focusOrdinal]);

  const currentChapterIndex = useMemo(() => {
    if (!activeRefId) return -1;
    if (activeChapterHeads.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < activeChapterHeads.length; i++) {
      if (activeChapterHeads[i]!.ordinal <= focusOrdinal) idx = i;
      else break;
    }
    return idx;
  }, [activeRefId, activeChapterHeads, focusOrdinal]);

  const currentChapterTitle = useMemo(() => {
    if (currentChapterIndex < 0) return "";
    return activeChapterHeads[currentChapterIndex]?.title ?? "";
  }, [activeChapterHeads, currentChapterIndex]);

  const openReader = useCallback(
    async (entry: ReferenceLibraryEntry, ordinal = 0, hl?: { start: number; end: number } | null) => {
      setActiveRefId(entry.id);
      setActiveTitle(entry.title);
      setActiveChunkCount(entry.chunkCount);
      setReaderCollapsed(false);
      const max = Math.max(0, entry.chunkCount - 1);
      const resume = hl ? null : loadReaderPos(entry.id);
      const pick = ordinal === 0 && resume !== null ? resume : ordinal;
      const o = Math.max(0, Math.min(pick, max));
      setFocusOrdinal(o);
      setHighlight(hl ?? null);
      setLoadedChunks({});
      await loadExcerpts(entry.id);
    },
    [loadExcerpts],
  );

  const toggleReferenceFavorite = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveReferenceFavoriteIds(next);
      return next;
    });
  }, []);

  const selectAllFilteredForExport = useCallback(() => {
    setExportSelection(new Set(filteredItems.map((r) => r.id)));
  }, [filteredItems]);

  const clearExportSelection = useCallback(() => {
    setExportSelection(new Set());
  }, []);

  const runExportZip = useCallback(async () => {
    if (exportSelection.size === 0) return;
    setBusy(true);
    try {
      await downloadReferenceLibraryZip(items, [...exportSelection]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [exportSelection, items]);

  const filterEmptyHint = useMemo(() => {
    if (items.length === 0) return "";
    if (filteredItems.length > 0) return "";
    if (favoriteScope === "favorites" && categoryFilter) {
      return "当前分类下没有已收藏的书目，可调整分类或改为「全部书目」。";
    }
    if (favoriteScope === "favorites") {
      return "暂无符合筛选的收藏书目。点击书目旁的星标可将原著加入收藏（仅本机）。";
    }
    if (categoryFilter) {
      return "当前分类下没有书目，请调整分类筛选。";
    }
    return "没有符合筛选的书目。";
  }, [items.length, filteredItems.length, favoriteScope, categoryFilter]);

  /** 从编辑器「在参考库打开」等深链进入：?ref=&ord=&hs=&he= */
  const deepLinkKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const refId = searchParams.get("ref");
    if (!refId) {
      deepLinkKeyRef.current = null;
      return;
    }
    const key = searchParams.toString();
    if (deepLinkKeyRef.current === key) return;
    if (items.length === 0) return;
    const entry = items.find((x) => x.id === refId);
    if (!entry) {
      deepLinkKeyRef.current = key;
      toast.error("地址栏中的参考书目不存在或已删除。");
      setSearchParams({}, { replace: true });
      return;
    }
    deepLinkKeyRef.current = key;
    const ord = parseInt(searchParams.get("ord") ?? "0", 10);
    const hs = searchParams.get("hs");
    const he = searchParams.get("he");
    const hl =
      hs !== null && he !== null && hs !== "" && he !== ""
        ? { start: parseInt(hs, 10), end: parseInt(he, 10) }
        : null;
    void openReader(entry, Number.isFinite(ord) ? ord : 0, hl).then(() => {
      setSearchParams({}, { replace: true });
      deepLinkKeyRef.current = null;
    });
  }, [loading, items, searchParams, openReader, setSearchParams]);

  // ── 提炼要点：加载已保存条目 ─────────────────────────────────────────
  useEffect(() => {
    if (!activeRefId || !extractPanelOpen) return;
    void listReferenceExtracts(activeRefId).then(setSavedExtracts);
  }, [activeRefId, extractPanelOpen]);

  // ── 工作台数据加载（按 workbenchRefId）────────────────────────────────────
  useEffect(() => {
    if (!workbenchOpen || !workbenchRefId) return;
    let cancelled = false;
    void (async () => {
      const entry = items.find((x) => x.id === workbenchRefId) ?? null;
      const [heads, excerpts, extracts] = await Promise.all([
        listReferenceChapterHeads(workbenchRefId),
        listReferenceExcerptsWithTagIds(workbenchRefId),
        listReferenceExtracts(workbenchRefId),
      ]);
      if (cancelled) return;
      setWorkbenchEntry(entry);
      setWorkbenchHeads(heads);
      setWorkbenchExcerpts(excerpts);
      setWorkbenchExtracts(extracts);
    })();
    return () => {
      cancelled = true;
    };
  }, [items, workbenchOpen, workbenchRefId]);

  // 切换书目时重置提炼面板
  useEffect(() => {
    setExtractStreaming("");
    setExtractError(null);
    setExtractLoading(false);
    setSavedExtracts([]);
  }, [activeRefId]);

  const handleStartExtract = useCallback(async () => {
    if (!activeRefId || !activeTitle) return;
    setExtractError(null);
    setExtractStreaming("");
    setExtractLoading(true);
    const ctrl = new AbortController();
    extractAbortRef.current = ctrl;

    try {
      // 加载该书目所有分块文本
      const db = getDB();
      const chunks = await db.referenceChunks
        .where("refWorkId")
        .equals(activeRefId)
        .sortBy("ordinal");
      const chunkTexts = chunks.map((c) => c.content);

      const fullResult = await extractReferenceContent({
        chunkTexts,
        type: extractType,
        bookTitle: activeTitle,
        signal: ctrl.signal,
        onDelta: (delta) => setExtractStreaming((prev) => prev + delta),
      });

      if (!ctrl.signal.aborted && fullResult.trim()) {
        const saved = await addReferenceExtract({
          refWorkId: activeRefId,
          type: extractType,
          body: fullResult,
        });
        setSavedExtracts((prev) => [saved, ...prev]);
        setExtractStreaming("");
      }
    } catch (err) {
      if (err instanceof ReferenceExtractError) {
        setExtractError(err.message);
      } else if (!ctrl.signal.aborted) {
        setExtractError(err instanceof Error ? err.message : "提炼失败");
      }
    } finally {
      setExtractLoading(false);
      extractAbortRef.current = null;
    }
  }, [activeRefId, activeTitle, extractType]);

  const handleImportExtract = useCallback(async (extract: ReferenceExtract) => {
    const wid = importWorkId;
    if (!wid) {
      toast.error("请先在上方选择要导入的作品。");
      return;
    }
    setImportBusy((prev) => ({ ...prev, [extract.id]: true }));
    try {
      let bibleId: string | undefined;
      const body = extract.body;
      const titlePrefix = `【藏经提炼·${activeTitle}】`;
      if (extract.type === "characters") {
        const entity = await addBibleCharacter(wid, {
          name: titlePrefix + "人物关系网络",
          motivation: body,
          relationships: "",
          voiceNotes: "",
          taboos: "",
        });
        bibleId = entity.id;
      } else if (extract.type === "worldbuilding") {
        const entity = await addBibleWorldEntry(wid, {
          entryKind: "世界观",
          title: titlePrefix + "世界观规则",
          body,
        });
        bibleId = entity.id;
      } else if (extract.type === "plot_beats") {
        const entity = await addBibleTimelineEvent(wid, {
          label: titlePrefix + "情节节拍",
          note: body,
          chapterId: null,
        });
        bibleId = entity.id;
      } else if (extract.type === "craft") {
        // craft → 笔感样本
        const entity = await addWritingStyleSample(wid, {
          title: titlePrefix + "技法摘要",
          body,
        });
        bibleId = entity.id;
      } else {
        // key_cards：不做"一键导入"，交给卡片级「应用」按钮（避免一口气生成大量锦囊）
        toast.info("结构化要点卡片：请在下方卡片列表中逐张应用到作品模块。");
        return;
      }
      if (bibleId) {
        await updateReferenceExtract(extract.id, { importedBibleId: bibleId });
        setSavedExtracts((prev) =>
          prev.map((e) => (e.id === extract.id ? { ...e, importedBibleId: bibleId } : e)),
        );
      }
      toast.success("已导入锦囊", {
        description: "可前往「锦囊」页查看。",
        action: importWorkId ? { label: "去锦囊", onClick: () => navigate(`/work/${importWorkId}/bible`) } : undefined,
      });
    } catch (err) {
      toast.error("导入失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportBusy((prev) => ({ ...prev, [extract.id]: false }));
    }
  }, [activeTitle, importWorkId, navigate]);

  const applyKeyCardToWork = useCallback(
    async (card: ReferenceKeyCard) => {
      const wid = importWorkId;
      if (!wid) {
        toast.error("请先在上方选择要导入的作品。");
        return;
      }
      const titlePrefix = `【藏经卡片·${activeTitle}】`;
      const title = `${titlePrefix}${card.title}`.slice(0, 120);
      const body = [card.body, card.sourceHint ? `\n\n> 线索：${card.sourceHint}` : ""].join("").trim();

      // 先按 kind 做一个合理默认映射；后续可做「选择目标模块」增强
      if (card.kind === "character") {
        await addBibleCharacter(wid, {
          name: title,
          motivation: body,
          relationships: "",
          voiceNotes: "",
          taboos: "",
        });
      } else if (card.kind === "plot") {
        await addBibleTimelineEvent(wid, {
          label: title,
          note: body,
          chapterId: null,
        });
      } else if (card.kind === "craft" || card.kind === "quote") {
        await addWritingStyleSample(wid, { title, body });
      } else if (card.kind === "glossary") {
        // 术语：把 title 当 term，正文进 definition（repo 类型里叫 body）
        await addBibleGlossaryTerm(wid, {
          term: card.title,
          category: "藏经卡片",
          definition: body,
        });
      } else {
        await addBibleWorldEntry(wid, {
          entryKind: "藏经卡片",
          title,
          body,
        });
      }
      const tab = card.kind === "character" ? "characters"
        : card.kind === "plot" ? "timeline"
        : card.kind === "craft" || card.kind === "quote" ? "penfeel"
        : card.kind === "glossary" ? "glossary"
        : "world";
      toast.success("已应用到作品锦囊", {
        action: { label: "去查看", onClick: () => navigate(`/work/${wid}/bible?tab=${tab}`) },
      });
    },
    [activeTitle, importWorkId, navigate],
  );

  const formatKeyCardText = useCallback(
    (card: ReferenceKeyCard) => {
      const parts: string[] = [];
      parts.push(`【藏经要点卡片】${activeTitle}`.trim());
      parts.push(`类型：${card.kind}`);
      parts.push(`标题：${card.title}`);
      if (card.sourceHint) parts.push(`线索：${card.sourceHint}`);
      if (card.tags?.length) parts.push(`标签：${card.tags.join(" / ")}`);
      parts.push("");
      if (card.body) parts.push(card.body.trim());
      return parts.join("\n").trim() + "\n";
    },
    [activeTitle],
  );

  const applyKeyCardToWenceRefs = useCallback(
    (card: ReferenceKeyCard) => {
      if (!importWorkId) {
        toast.error("请先在上方选择一个作品（用于问策关联作品上下文）。");
        return;
      }
      const content = formatKeyCardText(card);
      writeWenceRefsImport({
        workId: importWorkId,
        title: `藏经卡片：${card.title}`.slice(0, 80),
        content,
        refWorkId: activeRefId ?? undefined,
        hint: `来自藏经·${activeTitle} · ${card.kind}`,
      });
      navigate("/chat?refsImport=1");
    },
    [activeRefId, activeTitle, formatKeyCardText, importWorkId, navigate],
  );

  const applyKeyCardToAiDraft = useCallback(
    async (card: ReferenceKeyCard) => {
      const wid = importWorkId;
      if (!wid) {
        toast.error("请先在上方选择要写入草稿的作品。");
        return;
      }
      const chapters = await listChapters(wid);
      if (chapters.length === 0) {
        toast.error("该作品还没有章节，请先在写作页创建章节。");
        return;
      }
      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const chapterId =
        (progressCursor && sorted.some((c) => c.id === progressCursor) ? progressCursor : null) ?? sorted[0]!.id;
      const text = formatKeyCardText(card);
      const r = writeAiPanelDraft(wid, chapterId, text);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      navigate(`/work/${wid}?chapter=${encodeURIComponent(chapterId)}`);
    },
    [formatKeyCardText, importWorkId, navigate, progressCursor],
  );

  const jumpKeyCardToWritingHit = useCallback(
    async (card: ReferenceKeyCard) => {
      const wid = importWorkId;
      if (!wid) {
        toast.error("请先在上方选择要跳转的作品。");
        return;
      }
      const chapters = await listChapters(wid);
      if (chapters.length === 0) {
        toast.error("该作品还没有章节，请先在写作页创建章节。");
        return;
      }
      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const chapterId =
        (progressCursor && sorted.some((c) => c.id === progressCursor) ? progressCursor : null) ?? sorted[0]!.id;
      const needle = (card.title || card.body || "").trim().slice(0, 80);
      if (!needle) {
        toast.error("该卡片没有可用于定位的标题/正文。");
        return;
      }
      writeEditorHitHandoff({
        workId: wid,
        chapterId,
        query: needle,
        isRegex: false,
        offset: 0,
        source: {
          module: "reference",
          title: `藏经卡片：${card.title}`.slice(0, 80),
          hint: `来自《${activeTitle}》`,
        },
      });
      navigate(`/work/${wid}?hit=1&chapter=${encodeURIComponent(chapterId)}`);
    },
    [activeTitle, importWorkId, navigate, progressCursor],
  );

  const sendExcerptToWritingAsRef = useCallback(
    async (ex: ReferenceExcerpt) => {
      const wid = ex.linkedWorkId ?? importWorkId;
      if (!wid) {
        toast.error("请先在上方选择要跳转的作品（或先在摘录里绑定作品/章节）。");
        return;
      }
      const chapters = await listChapters(wid);
      if (chapters.length === 0) {
        toast.error("该作品还没有章节，请先在写作页创建章节。");
        return;
      }
      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const chapterId =
        ex.linkedChapterId ??
        ((progressCursor && sorted.some((c) => c.id === progressCursor) ? progressCursor : null) ?? sorted[0]!.id);

      writeEditorRefsImport({
        workId: wid,
        chapterId,
        items: [
          {
            id: ex.id,
            title: `藏经摘录：${activeTitle}`.slice(0, 80),
            content: [ex.text, ex.note ? `\n\n备注：${ex.note}` : ""].join("").trim(),
            createdAt: Date.now(),
            source: { module: "reference", hint: "来自藏经摘录" },
          },
        ],
      });
      navigate(`/work/${wid}?refsImport=1&chapter=${encodeURIComponent(chapterId)}`);
    },
    [activeTitle, importWorkId, navigate, progressCursor],
  );

  // ── 打开「提炼提示词」Dialog ───────────────────────────────────────────────

  const openPromptExtractFromExcerpt = useCallback(
    (ex: ReferenceExcerpt) => {
      setPromptExtractSource({
        kind: "excerpt",
        excerptText: ex.text,
        excerptNote: ex.note ?? "",
        excerptId: ex.id,
      });
      setPromptExtractDialogOpen(true);
    },
    [],
  );

  const openPromptExtractFromBook = useCallback(async () => {
    if (!activeRefId) return;
    const db = getDB();
    const chunks = await db.referenceChunks
      .where("refWorkId")
      .equals(activeRefId)
      .sortBy("ordinal");
    promptExtractChunksRef.current = chunks.map((c) => c.content);
    setPromptExtractSource({ kind: "book", chunkCount: chunks.length });
    setPromptExtractDialogOpen(true);
  }, [activeRefId]);

  /** 从书架卡片直接触发整书提炼，不需要先打开阅读器 */
  const openPromptExtractFromEntry = useCallback(async (entry: ReferenceLibraryEntry) => {
    const db = getDB();
    const chunks = await db.referenceChunks
      .where("refWorkId")
      .equals(entry.id)
      .sortBy("ordinal");
    promptExtractChunksRef.current = chunks.map((c) => c.content);
    setPromptExtractSource({ kind: "book", chunkCount: chunks.length, bookTitle: entry.title });
    setPromptExtractDialogOpen(true);
  }, []);

  const jumpExcerptToReader = useCallback(
    async (ex: ReferenceExcerpt) => {
      const entry = items.find((x) => x.id === ex.refWorkId);
      if (!entry) {
        toast.error("该参考书目已不存在，无法跳转。");
        return;
      }
      await openReader(entry, ex.ordinal, { start: ex.startOffset, end: ex.endOffset });
    },
    [items, openReader],
  );

  useEffect(() => {
    if (chunkAnchorRef.current && highlight) {
      chunkAnchorRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusOrdinal, highlight, activeRefId]);

  useEffect(() => {
    if (searchScopeRefId !== null && activeRefId) {
      setSearchScopeRefId(activeRefId);
    }
  }, [activeRefId, searchScopeRefId]);

  useEffect(() => {
    if (searchScopeRefId && !activeRefId) setSearchScopeRefId(null);
  }, [activeRefId, searchScopeRefId]);

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    setSearchLoading(true);
    try {
      const hits = await searchReferenceLibrary(q, {
        refWorkId: searchScopeRefId ?? undefined,
        limit: 80,
        mode: refSearchMode,
      });
      setSearchHits(hits);
    } finally {
      setSearchLoading(false);
    }
  }

  async function switchRefSearchMode(next: ReferenceSearchMode) {
    setRefSearchMode(next);
    const q = searchQ.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const hits = await searchReferenceLibrary(q, {
        refWorkId: searchScopeRefId ?? undefined,
        limit: 80,
        mode: next,
      });
      setSearchHits(hits);
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    const ids = [...new Set(searchHits.map((h) => h.refWorkId))].slice(0, 12);
    if (ids.length === 0) {
      setRefHeadsForHits({});
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => listReferenceChapterHeads(id).then((list) => [id, list] as const))).then(
      (pairs) => {
        if (cancelled) return;
        const map: Record<string, ReferenceChapterHead[]> = {};
        for (const [id, list] of pairs) map[id] = list;
        setRefHeadsForHits(map);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [searchHits]);

  function chapterLabelForHit(refWorkId: string, ordinal: number): string {
    const heads = refHeadsForHits[refWorkId];
    if (!heads || heads.length === 0) return "";
    let idx = -1;
    for (let i = 0; i < heads.length; i++) {
      if (heads[i]!.ordinal <= ordinal) idx = i;
      else break;
    }
    if (idx < 0) return "";
    return heads[idx]?.title ?? "";
  }

  function openPicker() {
    fileRef.current?.click();
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const isAbortError = (err: unknown) =>
      (err instanceof DOMException && err.name === "AbortError") ||
      (typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "AbortError");

    // 初始化本次导入的取消控制器（用于批量/单本导入 + 索引阶段）
    const abort = new AbortController();
    importAbortRef.current?.abort();
    importAbortRef.current = abort;

    const txtFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".txt"));
    const pdfFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const docxFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".docx"));

    const formatCount =
      (txtFiles.length > 0 ? 1 : 0) + (pdfFiles.length > 0 ? 1 : 0) + (docxFiles.length > 0 ? 1 : 0);
    if (formatCount > 1) {
      toast.error("请勿在同一批选择中混合 .txt、.pdf 与 .docx，请按格式分开导入。");
      return;
    }

    if (formatCount === 0) {
      toast.info("支持 UTF-8 的 .txt、带文本层的 .pdf、以及 Word 的 .docx（均在浏览器内本地解析，不上传）。旧版 .doc 请先用 Word 另存为 .docx。可多选同类型文件。");
      return;
    }

    if (txtFiles.length > 0) {
      if (txtFiles.length < picked.length) {
        toast.info(`已忽略 ${picked.length - txtFiles.length} 个非 .txt 文件，将导入 ${txtFiles.length} 个 .txt。`);
      }
    } else if (pdfFiles.length > 0) {
      if (pdfFiles.length < picked.length) {
        toast.info(`已忽略 ${picked.length - pdfFiles.length} 个非 .pdf 文件，将导入 ${pdfFiles.length} 个 .pdf。`);
      }
    } else if (docxFiles.length < picked.length) {
      toast.info(`已忽略 ${picked.length - docxFiles.length} 个非 .docx 文件，将导入 ${docxFiles.length} 个 .docx。`);
    }

    if (txtFiles.length > 0) {
    if (txtFiles.length === 1) {
      const file = txtFiles[0]!;
      setBusy(true);
      try {
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const { text, suspiciousEncoding } = await readUtf8TextFileWithCheck(file);
        if (suspiciousEncoding) {
          const go = await confirmOnce({
            title: "继续导入？",
            description:
              "文本疑似非 UTF-8，或含较多无法解码字符；继续导入可能出现乱码。请将 .txt 另存为 UTF-8 后导入更稳妥。",
            actionText: "继续导入",
          });
          if (!go) return;
        }
        const title =
          window.prompt("参考库标题（书名）", file.name.replace(/\.txt$/i, "").trim() || "未命名") ?? "";
        if (title === "") return;
        const cat =
          window.prompt("分类（可空，便于筛选。如：科幻设定、历史资料）", "") ?? "";
        const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
        if (large) {
          setHeavyJob({ phase: "chunks", percent: 0, label: "读取完成，准备写入…", fileName: file.name });
        }
        const entry = await createReferenceFromPlainText(
          {
            title: title.trim() || "未命名",
            sourceName: file.name,
            fullText: text,
            category: cat.trim(),
          },
          large
            ? {
                onProgress: (p) =>
                  setHeavyJob({
                    phase: p.phase,
                    percent: p.percent,
                    label: p.label,
                    fileName: file.name,
                  }),
                signal: abort.signal,
              }
            : { signal: abort.signal },
        );
        setHeavyJob(null);
        await refresh();
        await openReader(entry, 0, null);
      } catch (err) {
        setHeavyJob(null);
        if (!isAbortError(err)) {
          toast.error(err instanceof Error ? err.message : "导入失败");
        }
      } finally {
        setBusy(false);
        if (importAbortRef.current === abort) importAbortRef.current = null;
      }
      return;
    }

      const batchCat =
        window.prompt("批量导入默认分类（可空；留空则仅按书名管理）", "") ?? "";

      setBusy(true);
      setImportProgress({ current: 0, total: txtFiles.length, fileName: "" });
      const errors: string[] = [];
      let ok = 0;
      try {
        for (let i = 0; i < txtFiles.length; i++) {
          if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
          const file = txtFiles[i]!;
          setImportProgress({ current: i + 1, total: txtFiles.length, fileName: file.name });
          try {
            const { text, suspiciousEncoding } = await readUtf8TextFileWithCheck(file);
            if (suspiciousEncoding) {
              const go = await confirmOnce({
                title: "继续导入？",
                description: `${file.name}：疑似非 UTF-8 或无法解码字符较多，继续导入可能乱码。`,
                actionText: "继续导入",
              });
              if (!go) continue;
            }
            const stem = file.name.replace(/\.txt$/i, "").trim() || "未命名";
            const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
            if (large) {
              setHeavyJob({
                phase: "chunks",
                percent: 0,
                label: `批量 ${i + 1}/${txtFiles.length}`,
                fileName: file.name,
              });
            }
            await createReferenceFromPlainText(
              {
                title: stem,
                sourceName: file.name,
                fullText: text,
                category: batchCat.trim(),
              },
              large
                ? {
                    onProgress: (p) =>
                      setHeavyJob({
                        phase: p.phase,
                        percent: p.percent,
                        label: `${p.label ?? ""}（${i + 1}/${txtFiles.length}）`,
                        fileName: file.name,
                      }),
                    signal: abort.signal,
                  }
                : { signal: abort.signal },
            );
            setHeavyJob(null);
            ok++;
            await refresh();
          } catch (err) {
            setHeavyJob(null);
            if (isAbortError(err)) throw err;
            errors.push(`${file.name}：${err instanceof Error ? err.message : "导入失败"}`);
          }
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      } catch (err) {
        if (!isAbortError(err)) throw err;
      } finally {
        setImportProgress(null);
        setHeavyJob(null);
        setBusy(false);
        if (importAbortRef.current === abort) importAbortRef.current = null;
      }

      if (abort.signal.aborted) return;
      if (errors.length > 0) {
        const head = errors.slice(0, 8);
        const more = errors.length > 8 ? `\n… 共 ${errors.length} 条失败` : "";
        toast.info(`批量导入完成：成功 ${ok}，失败 ${errors.length}。`);
      }
      return;
    }

    if (pdfFiles.length > 0) {
    if (pdfFiles.length === 1) {
      const file = pdfFiles[0]!;
      setBusy(true);
      try {
        setHeavyJob({ phase: "chunks", percent: 0, label: "正在读取 PDF…", fileName: file.name });
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const buf = await file.arrayBuffer();
        const { text } = await extractPlainTextFromPdf(buf, {
          onProgress: ({ page, totalPages }) => {
            setHeavyJob({
              phase: "chunks",
              percent: Math.min(48, Math.round((page / Math.max(1, totalPages)) * 48)),
              label: `解析 PDF ${page}/${totalPages} 页`,
              fileName: file.name,
            });
          },
          signal: abort.signal,
        });
        setHeavyJob(null);
        const title =
          window.prompt("参考库标题（书名）", file.name.replace(/\.pdf$/i, "").trim() || "未命名") ?? "";
        if (title === "") return;
        const cat =
          window.prompt("分类（可空，便于筛选。如：科幻设定、历史资料）", "") ?? "";
        const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
        if (large) {
          setHeavyJob({ phase: "chunks", percent: 0, label: "解析完成，准备写入…", fileName: file.name });
        }
        const entry = await createReferenceFromPlainText(
          {
            title: title.trim() || "未命名",
            sourceName: file.name,
            fullText: text,
            category: cat.trim(),
          },
          large
            ? {
                onProgress: (p) =>
                  setHeavyJob({
                    phase: p.phase,
                    percent: p.percent,
                    label: p.label,
                    fileName: file.name,
                  }),
                signal: abort.signal,
              }
            : { signal: abort.signal },
        );
        setHeavyJob(null);
        await refresh();
        await openReader(entry, 0, null);
      } catch (err) {
        setHeavyJob(null);
        if (!isAbortError(err)) {
          toast.error(err instanceof Error ? err.message : "导入失败");
        }
      } finally {
        setBusy(false);
        if (importAbortRef.current === abort) importAbortRef.current = null;
      }
      return;
    }

    const batchCatPdf =
      window.prompt("批量导入默认分类（可空；留空则仅按书名管理）", "") ?? "";

    setBusy(true);
    setImportProgress({ current: 0, total: pdfFiles.length, fileName: "" });
    const pdfErrors: string[] = [];
    let pdfOk = 0;
    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const file = pdfFiles[i]!;
        setImportProgress({ current: i + 1, total: pdfFiles.length, fileName: file.name });
        try {
          setHeavyJob({ phase: "chunks", percent: 0, label: "正在读取 PDF…", fileName: file.name });
          const buf = await file.arrayBuffer();
          const { text } = await extractPlainTextFromPdf(buf, {
            onProgress: ({ page, totalPages }) => {
              setHeavyJob({
                phase: "chunks",
                percent: Math.min(48, Math.round((page / Math.max(1, totalPages)) * 48)),
                label: `解析 ${i + 1}/${pdfFiles.length} · ${page}/${totalPages} 页`,
                fileName: file.name,
              });
            },
            signal: abort.signal,
          });
          setHeavyJob(null);
          const stem = file.name.replace(/\.pdf$/i, "").trim() || "未命名";
          const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
          if (large) {
            setHeavyJob({
              phase: "chunks",
              percent: 0,
              label: `批量 ${i + 1}/${pdfFiles.length}`,
              fileName: file.name,
            });
          }
          await createReferenceFromPlainText(
            {
              title: stem,
              sourceName: file.name,
              fullText: text,
              category: batchCatPdf.trim(),
            },
            large
              ? {
                  onProgress: (p) =>
                    setHeavyJob({
                      phase: p.phase,
                      percent: p.percent,
                      label: `${p.label ?? ""}（${i + 1}/${pdfFiles.length}）`,
                      fileName: file.name,
                    }),
                  signal: abort.signal,
                }
              : { signal: abort.signal },
          );
          setHeavyJob(null);
          pdfOk++;
          await refresh();
        } catch (err) {
          setHeavyJob(null);
          if (isAbortError(err)) throw err;
          pdfErrors.push(`${file.name}：${err instanceof Error ? err.message : "导入失败"}`);
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      setImportProgress(null);
      setHeavyJob(null);
      setBusy(false);
      if (importAbortRef.current === abort) importAbortRef.current = null;
    }

    if (abort.signal.aborted) return;
    if (pdfErrors.length > 0) {
      const head = pdfErrors.slice(0, 8);
      const more = pdfErrors.length > 8 ? `\n… 共 ${pdfErrors.length} 条失败` : "";
      toast.info(`批量导入完成：成功 ${pdfOk}，失败 ${pdfErrors.length}。`);
    }
    return;
    }

    if (docxFiles.length === 1) {
      const file = docxFiles[0]!;
      setBusy(true);
      try {
        setHeavyJob({ phase: "chunks", percent: 0, label: "正在解析 Word 文档…", fileName: file.name });
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const buf = await file.arrayBuffer();
        const text = await extractPlainTextFromDocx(buf);
        setHeavyJob(null);
        const title =
          window.prompt("参考库标题（书名）", file.name.replace(/\.docx$/i, "").trim() || "未命名") ?? "";
        if (title === "") return;
        const cat =
          window.prompt("分类（可空，便于筛选。如：科幻设定、历史资料）", "") ?? "";
        const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
        if (large) {
          setHeavyJob({ phase: "chunks", percent: 0, label: "解析完成，准备写入…", fileName: file.name });
        }
        const entry = await createReferenceFromPlainText(
          {
            title: title.trim() || "未命名",
            sourceName: file.name,
            fullText: text,
            category: cat.trim(),
          },
          large
            ? {
                onProgress: (p) =>
                  setHeavyJob({
                    phase: p.phase,
                    percent: p.percent,
                    label: p.label,
                    fileName: file.name,
                  }),
                signal: abort.signal,
              }
            : { signal: abort.signal },
        );
        setHeavyJob(null);
        await refresh();
        await openReader(entry, 0, null);
      } catch (err) {
        setHeavyJob(null);
        if (!isAbortError(err)) {
          toast.error(err instanceof Error ? err.message : "导入失败");
        }
      } finally {
        setBusy(false);
        if (importAbortRef.current === abort) importAbortRef.current = null;
      }
      return;
    }

    const batchCatDocx =
      window.prompt("批量导入默认分类（可空；留空则仅按书名管理）", "") ?? "";

    setBusy(true);
    setImportProgress({ current: 0, total: docxFiles.length, fileName: "" });
    const docxErrors: string[] = [];
    let docxOk = 0;
    try {
      for (let i = 0; i < docxFiles.length; i++) {
        if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const file = docxFiles[i]!;
        setImportProgress({ current: i + 1, total: docxFiles.length, fileName: file.name });
        try {
          setHeavyJob({ phase: "chunks", percent: 0, label: "正在解析 Word 文档…", fileName: file.name });
          if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
          const buf = await file.arrayBuffer();
          const text = await extractPlainTextFromDocx(buf);
          setHeavyJob(null);
          const stem = file.name.replace(/\.docx$/i, "").trim() || "未命名";
          const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
          if (large) {
            setHeavyJob({
              phase: "chunks",
              percent: 0,
              label: `批量 ${i + 1}/${docxFiles.length}`,
              fileName: file.name,
            });
          }
          await createReferenceFromPlainText(
            {
              title: stem,
              sourceName: file.name,
              fullText: text,
              category: batchCatDocx.trim(),
            },
            large
              ? {
                  onProgress: (p) =>
                    setHeavyJob({
                      phase: p.phase,
                      percent: p.percent,
                      label: `${p.label ?? ""}（${i + 1}/${docxFiles.length}）`,
                      fileName: file.name,
                    }),
                  signal: abort.signal,
                }
              : { signal: abort.signal },
          );
          setHeavyJob(null);
          docxOk++;
          await refresh();
        } catch (err) {
          setHeavyJob(null);
          if (isAbortError(err)) throw err;
          docxErrors.push(`${file.name}：${err instanceof Error ? err.message : "导入失败"}`);
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    } catch (err) {
      if (!isAbortError(err)) throw err;
    } finally {
      setImportProgress(null);
      setHeavyJob(null);
      setBusy(false);
      if (importAbortRef.current === abort) importAbortRef.current = null;
    }

    if (abort.signal.aborted) return;
    if (docxErrors.length > 0) {
      const head = docxErrors.slice(0, 8);
      const more = docxErrors.length > 8 ? `\n… 共 ${docxErrors.length} 条失败` : "";
      toast.info(`批量导入完成：成功 ${docxOk}，失败 ${docxErrors.length}。`);
    }
  }

  async function handleDelete(id: string, title: string) {
    openConfirm({
      kind: "delete-book",
      title: "删除参考库",
      description: `删除参考库「${title}」？分块、索引与摘录会一并删除（不可撤销）。`,
      actionText: "确定删除",
      destructive: true,
      payload: { id },
    });
  }

  async function onHitClick(hit: ReferenceSearchHit) {
    const entry = items.find((x) => x.id === hit.refWorkId);
    if (!entry) return;
    await openReader(entry, hit.ordinal, {
      start: hit.highlightStart,
      end: hit.highlightEnd,
    });
  }

  async function saveSelectionAsExcerpt() {
    if (!activeRefId) return;
    const ch = loadedChunks.cur;
    if (!ch) return;
    const sel = window.getSelection();
    const t = sel?.toString() ?? "";
    if (!t.trim()) {
      toast.error("请先在阅读器中划选要保存的文字。");
      return;
    }
    const start = ch.content.indexOf(t);
    if (start < 0) {
      toast.error("无法定位选区，请缩短选区或避免跨段选择。");
      return;
    }
    const end = start + t.length;
    const note = window.prompt("摘录备注（可空）", "") ?? "";
    await addReferenceExcerpt({
      refWorkId: activeRefId,
      chunkId: ch.id,
      ordinal: ch.ordinal,
      startOffset: start,
      endOffset: end,
      text: t,
      note: note.trim(),
    });
    await loadExcerpts(activeRefId);
    sel?.removeAllRanges();
  }

  async function removeExcerpt(id: string) {
    openConfirm({
      kind: "delete-excerpt",
      title: "删除摘录",
      description: "删除这条摘录？（不可撤销）",
      actionText: "确定删除",
      destructive: true,
      payload: { id },
    });
  }

  const beginEditExcerpt = useCallback((ex: ReferenceExcerpt & { tagIds: string[] }) => {
    setEditingExcerptId(ex.id);
    setEditNote(ex.note);
    setEditTagIds([...ex.tagIds]);
    setEditLinkedWorkId(ex.linkedWorkId ?? "");
    setEditLinkedChapterId(ex.linkedChapterId ?? "");
  }, []);

  async function saveExcerptEdit() {
    if (!editingExcerptId) return;
    await updateReferenceExcerpt(editingExcerptId, {
      note: editNote.trim(),
      tagIds: editTagIds,
      linkedWorkId: editLinkedWorkId || null,
      linkedChapterId: editLinkedWorkId && editLinkedChapterId ? editLinkedChapterId : null,
    });
    if (activeRefId) await loadExcerpts(activeRefId);
    setEditingExcerptId(null);
    setAllTags(await listReferenceTags());
  }

  const currentChunk = loadedChunks.cur;
  const prevChunk = loadedChunks.prev;
  const nextChunk = loadedChunks.next;

  const visibleExcerpts = useMemo(() => {
    let list = excerpts;
    if (excerptTagFilterId) {
      list = list.filter((e) => e.tagIds.includes(excerptTagFilterId));
    }
    if (progressFilterEnabled && progressFilterWorkId) {
      list = list.filter((e) =>
        isLinkedChapterBeforeProgress(progressChapters, progressCursor, e.linkedChapterId ?? null),
      );
    }
    return list;
  }, [excerpts, excerptTagFilterId, progressFilterEnabled, progressFilterWorkId, progressChapters, progressCursor]);

  if (loading) {
    return (
      <div className={cn("page reference-page flex flex-col gap-4")}>
        <div className="flex flex-col items-center justify-center py-16">
          <Book className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("page reference-page reference-page--split flex flex-col gap-4")}>

      <header className="rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 px-6 py-3 shadow-sm transition-all duration-300">
        {/* 搜索与筛选工具栏 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 全文搜索框 */}
          <div className="relative w-[160px] min-w-[120px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reference-fulltext-search"
              type="search"
              placeholder="搜索全文…"
              value={searchQ}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQ(val);
                if (countNonPunctuation(val) > 10) {
                  setSearchDialogOpen(true);
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
              className="pl-9 bg-background/50 border-border/50"
              autoComplete="off"
            />
            {searchQ && (
              <button
                type="button"
                onClick={() => { setSearchQ(""); setSearchHits([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button type="button" size="sm" disabled={searchLoading} onClick={() => void runSearch()}>
            {searchLoading ? "…" : "搜索"}
          </Button>
          <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground" title={!activeRefId ? "先打开一本书" : "仅在当前打开的书中搜索"}>
            <input
              type="checkbox"
              checked={searchScopeRefId !== null}
              onChange={(e) => {
                if (e.target.checked) {
                  if (activeRefId) setSearchScopeRefId(activeRefId);
                } else setSearchScopeRefId(null);
              }}
              disabled={!activeRefId}
              className="h-3 w-3"
            />
            当前书
          </label>

          {/* 分类筛选 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {categoryFilter || "全部分类"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem
                onClick={() => setCategoryFilter("")}
                className={cn(!categoryFilter && "bg-primary/10 text-primary")}
              >
                全部分类
              </DropdownMenuItem>
              {categoryOptions.length > 0 && <DropdownMenuSeparator />}
              {categoryOptions.map((c) => (
                <DropdownMenuItem
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={cn(categoryFilter === c && "bg-primary/10 text-primary")}
                >
                  {c}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 检索模式切换 */}
          <div className="flex items-center rounded-lg border border-border/50 p-0.5" role="group" aria-label="检索模式">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2.5 text-xs rounded-md", refSearchMode === "strict" && "bg-primary/20 text-primary")}
              aria-pressed={refSearchMode === "strict"}
              title="多词须同时出现，且整段查询需字面命中"
              onClick={() => void switchRefSearchMode("strict")}
            >
              精确
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 px-2.5 text-xs rounded-md", refSearchMode === "hybrid" && "bg-primary/20 text-primary")}
              aria-pressed={refSearchMode === "hybrid"}
              title="多词任一命中即可参与排序；整句命中优先"
              onClick={() => void switchRefSearchMode("hybrid")}
            >
              扩展
            </Button>
          </div>

          {/* 排序 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SortAsc className="h-4 w-4" />
                {sortBy === "recent" ? "最近" : sortBy === "words" ? "字数" : "进度"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setSortBy("recent")}
                className={cn(sortBy === "recent" && "bg-primary/10 text-primary")}
              >
                <Clock className="mr-2 h-4 w-4" />
                最近更新
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("words")}
                className={cn(sortBy === "words" && "bg-primary/10 text-primary")}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                字数排序
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy("progress")}
                className={cn(sortBy === "progress" && "bg-primary/10 text-primary")}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                阅读进度
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 收藏筛选 */}
          <Button
            type="button"
            variant={favoriteScope === "favorites" ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setFavoriteScope(favoriteScope === "favorites" ? "all" : "favorites")}
          >
            <Star className={cn("h-4 w-4", favoriteScope === "favorites" && "fill-current")} />
            收藏
          </Button>

          {/* 藏经统计概览 */}
          {libraryTotals.count > 0 && (
            <div className="group relative">
              <div className="flex h-8 w-8 cursor-default items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
                <Book className="h-4 w-4" />
              </div>
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><Book className="h-3.5 w-3.5 text-primary" />{libraryTotals.count} 本</span>
                  <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-amber-500" />{Math.round(libraryTotals.chars / 10000)} 万字</span>
                  <span className="flex items-center gap-1.5"><Bookmark className="h-3.5 w-3.5 text-purple-500" />{totalExtracts} 提炼</span>
                  <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" />{favoriteIds.size} 收藏</span>
                </div>
              </div>
            </div>
          )}

          {/* 导入与导出 */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                void (async () => {
                  // 若已打开书，预取前 N 段用于 system 注入；未打开也允许进入（空态提示用户描述需求）
                  if (activeRefId) {
                    const db = getDB();
                    const chunks = await db.referenceChunks
                      .where("refWorkId")
                      .equals(activeRefId)
                      .sortBy("ordinal");
                    setAiChatBookChunks(chunks.slice(0, 4).map((c) => c.content));
                  } else {
                    setAiChatBookChunks([]);
                  }
                  setAiChatDialogOpen(true);
                })();
              }}
              title={activeRefId ? "打开 AI 聊天提炼" : "打开 AI 聊天（可不选书）"}
            >
              <Sparkles className="h-4 w-4" />
              AI
            </Button>
            {items.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={busy || exportSelection.size === 0}
                onClick={() => void runExportZip()}
              >
                <Download className="h-4 w-4" />
                导出{exportSelection.size > 0 ? ` (${exportSelection.size})` : ""}
              </Button>
            )}
            <Button type="button" size="sm" className="gap-2" disabled={busy} onClick={openPicker}>
              <Upload className="h-4 w-4" />
              {busy
                ? importProgress
                  ? `导入 ${importProgress.current}/${importProgress.total}…`
                  : "导入中…"
                : "导入"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="visually-hidden"
              onChange={(ev) => void handleFiles(ev)}
            />
          </div>

          {/* 视图切换 */}
          <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1" role="group" aria-label="书目视图">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              title="网格视图"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              title="列表视图"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <Link
            to="/library"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            title="返回作品库"
          >
            <Reply className="h-4 w-4" />
          </Link>
        </div>


      </header>

      {/* 主内容区（分栏布局） */}
      <div className="reference-page-layout">
        <main className="reference-main">



          {/* 搜索结果 */}
          {searchHits.length > 0 && (
            <div className="mb-4 rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium text-foreground">
                搜索结果 · {searchHits.length} 处
              </div>
              <ul className="space-y-2">
                {searchHits.map((h) => (
                  <li key={`${h.chunkId}-${h.ordinal}-${h.highlightStart}-${h.snippetMatch}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-black/5 dark:border-border/40 bg-slate-50 dark:bg-background/50 p-3 text-left transition-all duration-300 hover:border-primary/30 hover:bg-white dark:hover:bg-card/80 hover:shadow-sm"
                      onClick={() => void onHitClick(h)}
                    >
                      <span className="text-sm font-medium text-foreground">{h.refTitle}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {chapterLabelForHit(h.refWorkId, h.ordinal) ? `${chapterLabelForHit(h.refWorkId, h.ordinal)} · ` : ""}
                        段 {h.ordinal + 1} · {h.matchCount} 处命中
                      </span>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {h.snippetBefore}
                        <mark className="rounded bg-primary/20 px-0.5 text-primary">{h.snippetMatch}</mark>
                        {h.snippetAfter}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 书目区域 */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/10 dark:border-border/60 bg-white/50 dark:bg-transparent py-16 shadow-sm">
              <Book className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-muted-foreground">暂无参考书目</p>
              <p className="mt-1 text-sm text-muted-foreground/60">导入 .txt、.pdf 或 .docx 文件开始搭建参考书库</p>
              <Button type="button" className="mt-4 gap-2" onClick={openPicker}>
                <Upload className="h-4 w-4" />
                导入书籍
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12">
              <Book className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-muted-foreground">{filterEmptyHint}</p>
              <Button variant="link" className="mt-2" onClick={() => { setCategoryFilter(""); setFavoriteScope("all"); }}>
                清除筛选条件
              </Button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredItems.map((r) => {
                const hue = refCoverHue(r.id);
                const chCount = r.chapterHeadCount ?? 0;
                const isFav = favoriteIds.has(r.id);
                const isSelected = exportSelection.has(r.id);
                const readPos = loadReaderPos(r.id);
                const readPct =
                  r.chunkCount > 1 && readPos !== null
                    ? Math.round((readPos / (r.chunkCount - 1)) * 100)
                    : readPos !== null
                      ? 100
                      : 0;
                return (
                  <div
                    key={r.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/50 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-black/10 dark:hover:border-primary/30 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-primary/5"
                  >
                    {/* 书籍封面 */}
                    <div
                      className="relative aspect-[3/4] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                      style={{
                        background: `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${(hue + 42) % 360} 36% 26%))`,
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                        <div>
                          <div className="text-base font-semibold leading-tight text-white/90">{r.title}</div>
                          {r.sourceName && (
                            <div className="mt-1 max-w-[8rem] truncate text-[10px] text-white/50">{r.sourceName}</div>
                          )}
                        </div>
                      </div>

                      {/* 导出选中角标 */}
                      <label
                        className="absolute left-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-opacity"
                        title="选中以批量导出"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          className="sr-only"
                          onChange={(e) => {
                            e.stopPropagation();
                            setExportSelection((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className={cn("text-[10px] font-bold", isSelected ? "text-primary" : "text-white/50")}>
                          {isSelected ? "✓" : "○"}
                        </span>
                      </label>

                      {/* 收藏星 */}
                      <button
                        type="button"
                        className="absolute right-2 top-2 transition-colors"
                        title={isFav ? "取消收藏" : "加入收藏（仅本机）"}
                        onClick={(e) => toggleReferenceFavorite(r.id, e)}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            isFav ? "fill-amber-400 text-amber-400" : "text-white/40 hover:text-amber-300",
                          )}
                        />
                      </button>

                      {/* 阅读进度条 */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                        <div className="flex items-center justify-between text-[10px] text-white/70">
                          <span>阅读进度</span>
                          <span>{readPct}%</span>
                        </div>
                        <Progress value={readPct} className="mt-1 h-1 bg-white/20" />
                      </div>

                      {/* 悬浮操作层 */}
                      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 text-xs"
                          onClick={() => void openReader(r, 0, null)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          阅读
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setWorkbenchRefId(r.id);
                            setWorkbenchTab("overview");
                            setWorkbenchOpen(true);
                          }}
                        >
                          <Reply className="h-3.5 w-3.5" />
                          工作台
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 text-xs"
                          onClick={async () => { await openReader(r, 0, null); setExtractPanelOpen(true); }}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          提炼
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 text-xs"
                          onClick={() => void openPromptExtractFromEntry(r)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          提示词
                        </Button>
                      </div>
                    </div>

                    {/* 书目信息 */}
                    <div className="flex flex-col gap-1.5 p-3">
                      {(r.category ?? "").trim() && (
                        <Badge variant="secondary" className="w-fit h-5 bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
                          {(r.category ?? "").trim()}
                        </Badge>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{chCount > 0 ? `${chCount} 章` : `${r.chunkCount} 段`}</span>
                        {r.totalChars > 0 && <span>{Math.round(r.totalChars / 10000)} 万字</span>}
                      </div>
                      {(extractCountById[r.id] ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-purple-400">
                          <Bookmark className="h-3 w-3" />
                          <span>已提炼 {extractCountById[r.id]} 条</span>
                        </div>
                      )}
                      {/* 分类编辑 & 删除（悬浮显示） */}
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            const c = window.prompt("分类（可空）", (r.category ?? "").trim()) ?? "";
                            void (async () => {
                              await updateReferenceLibraryEntry(r.id, { category: c.trim() || undefined });
                              await refresh();
                            })();
                          }}
                        >
                          <Tag className="mr-0.5 h-3 w-3" />
                          分类
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(r.id, r.title)}
                        >
                          <Trash2 className="mr-0.5 h-3 w-3" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 列表视图 */
            <div className="space-y-2">
              {filteredItems.map((r) => {
                const hue = refCoverHue(r.id);
                const chCount = r.chapterHeadCount ?? 0;
                const isFav = favoriteIds.has(r.id);
                const isSelected = exportSelection.has(r.id);
                const readPos = loadReaderPos(r.id);
                const readPct =
                  r.chunkCount > 1 && readPos !== null
                    ? Math.round((readPos / (r.chunkCount - 1)) * 100)
                    : readPos !== null
                      ? 100
                      : 0;
                return (
                  <div
                    key={r.id}
                    className="group flex items-center gap-4 rounded-xl border border-black/5 dark:border-border/40 bg-white dark:bg-card/30 p-4 transition-all duration-300 shadow-sm hover:-translate-y-1 hover:border-black/10 dark:hover:border-primary/30 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-primary/5"
                  >
                    {/* 缩略封面 */}
                    <div
                      className="relative flex h-20 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                      style={{
                        background: `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${(hue + 42) % 360} 36% 26%))`,
                      }}
                      onClick={() => void openReader(r, 0, null)}
                    >
                      <span className="px-1 text-center text-sm font-medium leading-tight text-white/80">
                        {r.title.slice(0, 4)}
                      </span>
                      {isFav && (
                        <Star className="absolute right-1 top-1 h-3 w-3 fill-amber-400 text-amber-400" />
                      )}
                    </div>

                    {/* 书目内容 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="truncate font-medium text-foreground transition-colors hover:text-primary"
                          onClick={() => void openReader(r, 0, null)}
                        >
                          {r.title}
                        </button>
                        {(r.category ?? "").trim() && (
                          <Badge variant="secondary" className="h-5 shrink-0 bg-primary/10 px-1.5 text-[10px] font-normal text-primary">
                            {(r.category ?? "").trim()}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {r.sourceName && <span className="max-w-[14rem] truncate">{r.sourceName}</span>}
                        <span>{chCount > 0 ? `${chCount} 章` : `${r.chunkCount} 段`}</span>
                        {r.totalChars > 0 && <span>{r.totalChars.toLocaleString()} 字</span>}
                      </div>
                      {r.chunkCount > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">进度</span>
                          <Progress value={readPct} className="h-1.5 w-20" />
                          <span className="text-xs text-muted-foreground">{readPct}%</span>
                        </div>
                      )}
                      {(extractCountById[r.id] ?? 0) > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-purple-400">
                          <Bookmark className="h-3 w-3" />
                          <span>已提炼 {extractCountById[r.id]} 条</span>
                        </div>
                      )}
                      {/* 章节列表折叠 */}
                      {chCount > 0 && (
                        <details
                          className="mt-1"
                          onToggle={(e) => {
                            const el = e.currentTarget;
                            if (!el.open || refChapterHeadsById[r.id]) return;
                            void listReferenceChapterHeads(r.id).then((list) =>
                              setRefChapterHeadsById((prev) => ({ ...prev, [r.id]: list })),
                            );
                          }}
                        >
                          <summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">
                            章节列表（{chCount}）
                          </summary>
                          <ul className="ml-3 mt-1 space-y-0.5">
                            {(refChapterHeadsById[r.id] ?? []).map((h, idx) => (
                              <li key={h.id}>
                                <button
                                  type="button"
                                  className="text-left text-xs text-muted-foreground transition-colors hover:text-primary"
                                  onClick={() => void openReader(r, h.ordinal, null)}
                                >
                                  {idx + 1}. {h.title}
                                  <span className="ml-1 text-muted-foreground/50">· 段 {h.ordinal + 1}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    {/* 操作区（悬浮显示） */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <label
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent"
                        title="选中以批量导出"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          className="sr-only"
                          onChange={(e) => {
                            e.stopPropagation();
                            setExportSelection((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className={cn("text-sm font-bold", isSelected ? "text-primary" : "text-muted-foreground")}>
                          {isSelected ? "✓" : "○"}
                        </span>
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={isFav ? "取消收藏" : "加入收藏"}
                        onClick={(e) => toggleReferenceFavorite(r.id, e)}
                      >
                        <Star className={cn("h-4 w-4", isFav && "fill-amber-400 text-amber-400")} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="阅读"
                        onClick={() => void openReader(r, 0, null)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="提炼要点"
                        onClick={async () => { await openReader(r, 0, null); setExtractPanelOpen(true); }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void openPromptExtractFromEntry(r)}>
                            <Wand2 className="mr-2 h-4 w-4 text-primary" />
                            <span className="text-primary">提炼提示词</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              const c = window.prompt("分类（可空）", (r.category ?? "").trim()) ?? "";
                              void (async () => {
                                await updateReferenceLibraryEntry(r.id, { category: c.trim() || undefined });
                                await refresh();
                              })();
                            }}
                          >
                            <Tag className="mr-2 h-4 w-4" />
                            编辑分类
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => void handleDelete(r.id, r.title)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 摘录、标签与进度过滤（折叠面板） */}
          <details className="mt-4">
            <summary className="cursor-pointer rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-card/50 hover:text-foreground">
              摘录、标签与进度过滤
            </summary>
            <div className="mt-2 space-y-5 rounded-xl border border-border/40 bg-card/30 p-5 shadow-sm">
              {/* 摘录与进度 */}
              <section aria-labelledby="ref-panel-excerpt-filters">
                <h2 id="ref-panel-excerpt-filters" className="mb-3 text-sm font-medium text-foreground">摘录与进度</h2>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    摘录按标签筛选
                    <select
                      className="input reference-category-select ml-auto"
                      value={excerptTagFilterId}
                      onChange={(e) => setExcerptTagFilterId(e.target.value)}
                    >
                      <option value="">全部</option>
                      {allTags.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={progressFilterEnabled}
                      className="mt-0.5"
                      onChange={(e) => {
                        const v = e.target.checked;
                        setProgressFilterEnabled(v);
                        try { localStorage.setItem(LS_REF_PROGRESS_FILTER, v ? "1" : "0"); } catch { /* ignore */ }
                      }}
                    />
                    <span>摘录仅保留关联章节在<strong>写作进度前</strong>（与全书「仅进度前」一致）</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    进度参照作品
                    <select
                      className="input reference-category-select ml-auto"
                      value={progressFilterWorkId}
                      disabled={!progressFilterEnabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProgressFilterWorkId(v);
                        try { localStorage.setItem(LS_REF_PROGRESS_WORK, v); } catch { /* ignore */ }
                      }}
                    >
                      <option value="">选择作品</option>
                      {worksList.map((w) => (
                        <option key={w.id} value={w.id}>{w.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              {/* 摘录标签 */}
              <section aria-labelledby="ref-panel-tags">
                <h2 id="ref-panel-tags" className="mb-3 text-sm font-medium text-foreground">摘录标签</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      className="flex-1"
                      placeholder="新标签名称"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newTagName.trim()}
                      onClick={() => {
                        void (async () => {
                          try {
                            await createReferenceTag(newTagName);
                            setNewTagName("");
                            await refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "创建失败");
                          }
                        })();
                      }}
                    >
                      添加
                    </Button>
                  </div>
                  {allTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((t) => (
                        <div key={t.id} className="flex items-center gap-1 rounded-full border border-border/50 bg-primary/10 px-2.5 py-0.5">
                          <span className="text-xs text-primary">{t.name}</span>
                          <button
                            type="button"
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            onClick={() => {
                              openConfirm({
                                kind: "delete-tag",
                                title: "删除标签",
                                description: `删除标签「${t.name}」？摘录上的该标签会一并移除（不可撤销）。`,
                                actionText: "确定删除",
                                destructive: true,
                                payload: { id: t.id },
                              });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">暂无标签；添加后可在侧栏摘录上勾选。</p>
                  )}
                </div>
              </section>

              {/* 批量导出 */}
              {items.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-medium text-foreground">批量导出</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">全文导出为 ZIP（每部一个 .txt，不上传）</span>
                    <Button type="button" variant="outline" size="sm" disabled={busy || filteredItems.length === 0} onClick={selectAllFilteredForExport}>全选当前</Button>
                    <Button type="button" variant="outline" size="sm" disabled={busy || exportSelection.size === 0} onClick={clearExportSelection}>清空选择</Button>
                    <Button type="button" size="sm" disabled={busy || exportSelection.size === 0} onClick={() => void runExportZip()}>
                      <Download className="mr-1.5 h-4 w-4" />
                      导出 ZIP
                    </Button>
                    <span className="text-xs text-muted-foreground">已选 {exportSelection.size} 部</span>
                  </div>
                </section>
              )}
            </div>
          </details>

          {/* 参考库维护（折叠面板） */}
          <details className="mt-2">
            <summary className="cursor-pointer rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-card/50 hover:text-foreground">
              参考库维护
            </summary>
            <div className="mt-2 rounded-xl border border-border/40 bg-card/30 p-5 shadow-sm">
              <p className="mb-3 text-xs text-muted-foreground">
                以下仅影响<strong>参考库</strong>（导入原著与摘录索引），<strong>不会</strong>删除作品正文。升级 Schema 后若检索异常，可先试「重建索引」。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={maintainBusy || busy}
                  onClick={() => {
                    void (async () => {
                      setMaintainBusy(true);
                      setHeavyJob({ phase: "index", percent: 0, label: "准备重建…" });
                      try {
                        await rebuildAllReferenceSearchIndex((p) =>
                          setHeavyJob({ phase: "index", percent: p.percent, label: p.label }),
                        );
                      } finally {
                        setHeavyJob(null);
                        setMaintainBusy(false);
                        await refresh();
                      }
                    })();
                  }}
                >
                  重建参考库索引
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={maintainBusy || busy}
                  onClick={() => {
                    openConfirm({
                      kind: "clear-library",
                      title: "清空参考库",
                      description:
                        "将清空全部参考库（原著、索引、摘录），不影响作品与章节正文。此操作不可撤销，确定继续？",
                      actionText: "确定清空",
                      destructive: true,
                      payload: {},
                    });
                  }}
                >
                  清空参考库
                </Button>
              </div>
            </div>
          </details>

        </main>

        <aside className={`reference-reader-aside ${readerCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="reference-reader-collapse-toggle"
            title={readerCollapsed ? "展开阅读器" : "折叠阅读器"}
            aria-expanded={!readerCollapsed}
            onClick={() => setReaderCollapsed((c) => !c)}
          >
            {readerCollapsed ? "⟨" : "⟩"}
          </button>
          {!readerCollapsed && (
            <div className="reference-reader-inner card">
              {!activeRefId ? (
                <p className="muted small reference-reader-placeholder">
                  从左侧打开一本书，或点击搜索结果，在此阅读原文上下文。
                </p>
              ) : activeChunkCount > 0 && !currentChunk ? (
                <p className="muted small">正文分块加载中…</p>
              ) : !currentChunk ? (
                <p className="muted small">当前段无内容</p>
              ) : (
                <>
                  <div className="reference-reader-toolbar">
                    <h2 className="reference-reader-title">{activeTitle}</h2>
                    <div className="reference-reader-nav">
                      {activeChapterHeads.length > 0 ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={currentChapterIndex <= 0}
                            onClick={() => {
                              const prev = activeChapterHeads[currentChapterIndex - 1];
                              if (!prev) return;
                              setFocusOrdinal(prev.ordinal);
                              setHighlight(null);
                            }}
                          >
                            上一章
                          </Button>
                          <label className="reference-chapter-picker">
                            <span className="visually-hidden">章节</span>
                            <select
                              value={currentChapterIndex >= 0 ? String(currentChapterIndex) : ""}
                              onChange={(e) => {
                                const ix = parseInt(e.target.value, 10);
                                const head = activeChapterHeads[ix];
                                if (!head) return;
                                setFocusOrdinal(head.ordinal);
                                setHighlight(null);
                              }}
                            >
                              {activeChapterHeads.map((h, i) => (
                                <option key={h.id} value={String(i)}>
                                  {i + 1}. {h.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={currentChapterIndex < 0 || currentChapterIndex >= activeChapterHeads.length - 1}
                            onClick={() => {
                              const next = activeChapterHeads[currentChapterIndex + 1];
                              if (!next) return;
                              setFocusOrdinal(next.ordinal);
                              setHighlight(null);
                            }}
                          >
                            下一章
                          </Button>
                        </>
                      ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={focusOrdinal <= 0}
                        onClick={() => {
                          setFocusOrdinal((o) => o - 1);
                          setHighlight(null);
                        }}
                      >
                        上一段
                      </Button>
                      )}
                      <span className="muted small">
                        {activeChapterHeads.length > 0
                          ? currentChapterTitle
                            ? `当前章：${currentChapterTitle}`
                            : ""
                          : ""}
                        {activeChapterHeads.length > 0 ? " · " : ""}
                        存储段 {focusOrdinal + 1} / {activeChunkCount}
                      </span>
                      {activeChapterHeads.length > 0 ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={focusOrdinal >= activeChunkCount - 1}
                        onClick={() => {
                          setFocusOrdinal((o) => o + 1);
                          setHighlight(null);
                        }}
                      >
                        下一段
                      </Button>
                      )}
                    </div>
                    <Button type="button" size="sm" onClick={() => void saveSelectionAsExcerpt()}>
                      保存划选为摘录
                    </Button>
                  </div>

                  {prevChunk ? (
                    <div className="reference-context reference-context--prev muted small">
                      <div className="reference-context-label">上一段末尾</div>
                      <pre className="reference-context-pre">
                        …{prevChunk.content.slice(-CONTEXT_TAIL)}
                      </pre>
                    </div>
                  ) : null}

                  <div
                    ref={chunkAnchorRef}
                    id={`ref-chunk-${focusOrdinal}`}
                    className="reference-chunk-body"
                  >
                    <div className="reference-chunk-label small muted">当前段</div>
                    <pre className="reference-chunk-pre">
                      {highlight && currentChunk
                        ? highlightChunkText(
                            currentChunk.content,
                            highlight.start,
                            highlight.end,
                          )
                        : currentChunk?.content}
                    </pre>
                  </div>

                  {nextChunk ? (
                    <div className="reference-context reference-context--next muted small">
                      <div className="reference-context-label">下一段开头</div>
                      <pre className="reference-context-pre">
                        {nextChunk.content.slice(0, CONTEXT_HEAD)}…
                      </pre>
                    </div>
                  ) : null}

                  {excerpts.length > 0 ? (
                    <div className="reference-excerpts">
                      <div className="reference-excerpts-title">本书摘录</div>
                      {excerpts.length > 0 && visibleExcerpts.length === 0 ? (
                        <p className="muted small">当前筛选下无摘录，请调整标签或进度过滤。</p>
                      ) : null}
                      <ul>
                        {visibleExcerpts.map((ex) => (
                          <li key={ex.id} className="reference-excerpt-item">
                            <blockquote className="reference-excerpt-quote">{ex.text}</blockquote>
                            {ex.note ? <p className="small muted">{ex.note}</p> : null}
                            <div className="reference-excerpt-chips">
                              {ex.tagIds.map((tid) => {
                                const tg = allTags.find((x) => x.id === tid);
                                return tg ? (
                                  <span key={tid} className="reference-excerpt-chip">
                                    {tg.name}
                                  </span>
                                ) : null;
                              })}
                              {ex.linkedChapterId ? (
                                <span className="reference-excerpt-chip reference-excerpt-chip--link">
                                  已关联创作章
                                </span>
                              ) : null}
                            </div>
                            <div className="reference-excerpt-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void jumpExcerptToReader(ex)}
                              >
                                跳转到原文
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void sendExcerptToWritingAsRef(ex)}
                              >
                                去写作引用
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => beginEditExcerpt(ex)}
                              >
                                编辑
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-primary hover:text-primary"
                                onClick={() => openPromptExtractFromExcerpt(ex)}
                              >
                                <Wand2 className="h-3.5 w-3.5" />
                                提炼为提示词
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void removeExcerpt(ex.id)}
                              >
                                删除
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {editingExcerptId ? (
                        <div className="reference-excerpt-edit-panel">
                          <div className="small muted">编辑摘录</div>
                          <label className="reference-excerpt-edit-label">
                            备注
                            <textarea
                              className="input reference-excerpt-note"
                              rows={2}
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                            />
                          </label>
                          <div className="reference-excerpt-edit-tags">
                            <span className="small muted">标签</span>
                            <div className="reference-excerpt-tag-checks">
                              {allTags.map((t) => (
                                <label key={t.id} className="reference-excerpt-tag-check">
                                  <input
                                    type="checkbox"
                                    checked={editTagIds.includes(t.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setEditTagIds((prev) => [...prev, t.id]);
                                      } else {
                                        setEditTagIds((prev) => prev.filter((id) => id !== t.id));
                                      }
                                    }}
                                  />{" "}
                                  {t.name}
                                </label>
                              ))}
                            </div>
                          </div>
                          <label className="reference-excerpt-edit-label">
                            关联原创作品（3.6 弱关联）
                            <select
                              className="input"
                              value={editLinkedWorkId}
                              onChange={(e) => {
                                setEditLinkedWorkId(e.target.value);
                                setEditLinkedChapterId("");
                              }}
                            >
                              <option value="">不关联</option>
                              {worksList.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="reference-excerpt-edit-label">
                            关联章节
                            <select
                              className="input"
                              value={editLinkedChapterId}
                              disabled={!editLinkedWorkId}
                              onChange={(e) => setEditLinkedChapterId(e.target.value)}
                            >
                              <option value="">选择章节</option>
                              {editChapters.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="reference-excerpt-edit-btns">
                            <Button type="button" size="sm" onClick={() => void saveExcerptEdit()}>
                              保存
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingExcerptId(null)}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ── 提炼要点面板 ──────────────────────────────────── */}
                  <div className="reference-extract-section">
                    <button
                      type="button"
                      className="reference-extract-toggle"
                      onClick={() => setExtractPanelOpen((v) => !v)}
                    >
                      <span style={{ marginRight: 6 }}>✦</span>
                      提炼要点
                      <span style={{ marginLeft: "auto", fontSize: 11 }}>
                        {extractPanelOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {extractPanelOpen && (
                      <div className="reference-extract-body">
                        {/* 提炼提示词入口 B */}
                        <div style={{ marginBottom: 10 }}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-primary border-primary/40 hover:bg-primary/5"
                            onClick={() => void openPromptExtractFromBook()}
                            disabled={!activeRefId}
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            提炼提示词（Beta）
                          </Button>
                        </div>
                        {/* 类型选择 */}
                        <div className="reference-extract-type-row">
                          {EXTRACT_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={cn(
                                "reference-extract-type-btn",
                                extractType === t && "active",
                              )}
                              onClick={() => setExtractType(t)}
                            >
                              {getExtractTypeLabel(t)}
                            </button>
                          ))}
                        </div>

                        {/* 触发按钮 */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          <Button
                            type="button"
                            size="sm"
                            disabled={extractLoading}
                            onClick={() => void handleStartExtract()}
                          >
                            {extractLoading ? "提炼中…" : `提炼「${getExtractTypeLabel(extractType)}」`}
                          </Button>
                          {extractLoading && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                extractAbortRef.current?.abort();
                              }}
                            >
                              停止
                            </Button>
                          )}
                        </div>

                        {/* 错误提示 */}
                        {extractError && (
                          <p className="muted small" style={{ color: "var(--destructive)", marginBottom: 8 }}>
                            ⚠ {extractError}
                          </p>
                        )}

                        {/* 流式输出预览 */}
                        {extractStreaming && (
                          <div className="reference-extract-preview">
                            <div className="reference-extract-preview-label muted small">提炼中（实时预览）…</div>
                            <pre className="reference-extract-preview-body">{extractStreaming}</pre>
                          </div>
                        )}

                        {/* 已保存的提炼结果 */}
                        {savedExtracts.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div className="muted small" style={{ marginBottom: 6 }}>已保存 {savedExtracts.length} 条提炼结果</div>

                            {/* 导入作品选择器 */}
                            <label className="reference-extract-import-row">
                              <span className="small muted">导入到作品：</span>
                              <select
                                className="input"
                                value={importWorkId}
                                onChange={(e) => setImportWorkId(e.target.value)}
                                style={{ flex: 1, fontSize: 12 }}
                              >
                                <option value="">选择作品…</option>
                                {worksList.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.title}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <ul className="reference-extract-list">
                              {savedExtracts.map((ex) => (
                                <li key={ex.id} className="reference-extract-item">
                                  <div className="reference-extract-item-header">
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: "1px 5px",
                                        borderRadius: 4,
                                        background: "var(--primary)",
                                        color: "var(--primary-foreground)",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {getExtractTypeLabel(ex.type)}
                                    </span>
                                    <span className="muted small" style={{ flex: 1 }}>
                                      {new Date(ex.createdAt).toLocaleDateString("zh-CN")}
                                    </span>
                                    {ex.importedBibleId && (
                                      <span className="small" style={{ color: "var(--primary)" }}>
                                        ✓ 已导入锦囊
                                      </span>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={importBusy[ex.id] || !!ex.importedBibleId}
                                      onClick={() => void handleImportExtract(ex)}
                                    >
                                      {importBusy[ex.id] ? "导入中…" : ex.importedBibleId ? "已导入" : "导入锦囊"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        openConfirm({
                                          kind: "delete-extract",
                                          title: "删除提炼结果",
                                          description: "删除此条提炼结果？（不可撤销）",
                                          actionText: "确定删除",
                                          destructive: true,
                                          payload: { id: ex.id },
                                        });
                                      }}
                                    >
                                      删除
                                    </Button>
                                  </div>
                                  {ex.type === "key_cards" ? (
                                    <div className="reference-extract-item-body" style={{ whiteSpace: "normal" }}>
                                      {(() => {
                                        const cards = parseReferenceKeyCardsFromExtractBody(ex.body);
                                        if (cards.length === 0) {
                                          return (
                                            <>
                                              <div className="muted small" style={{ marginBottom: 6 }}>
                                                未解析到卡片 JSON（你可以删除后重新提炼一次「结构化要点卡片」）。
                                              </div>
                                              <pre className="reference-extract-item-body">{ex.body}</pre>
                                            </>
                                          );
                                        }
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            {cards.slice(0, 24).map((c, idx) => (
                                              <div
                                                key={`${c.kind}:${c.title}:${idx}`}
                                                className="rounded-lg border border-border/50 bg-card/30 p-3"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs rounded-md border border-border/60 bg-background/60 px-2 py-0.5">
                                                    {c.kind}
                                                  </span>
                                                  <div className="text-sm font-medium text-foreground">{c.title}</div>
                                                  <div style={{ marginLeft: "auto" }}>
                                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                                      <Button type="button" size="sm" variant="outline" onClick={() => applyKeyCardToWenceRefs(c)}>
                                                        去问策引用
                                                      </Button>
                                                      <Button type="button" size="sm" variant="outline" onClick={() => void jumpKeyCardToWritingHit(c)}>
                                                        去写作定位
                                                      </Button>
                                                      <Button type="button" size="sm" variant="outline" onClick={() => void applyKeyCardToAiDraft(c)}>
                                                        写入草稿
                                                      </Button>
                                                      <Button type="button" size="sm" onClick={() => void applyKeyCardToWork(c)}>
                                                        应用到作品
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </div>
                                                {c.sourceHint ? (
                                                  <div className="muted small" style={{ marginTop: 4 }}>
                                                    线索：{c.sourceHint}
                                                  </div>
                                                ) : null}
                                                {c.tags?.length ? (
                                                  <div className="muted small" style={{ marginTop: 4 }}>
                                                    标签：{c.tags.join(" / ")}
                                                  </div>
                                                ) : null}
                                                {c.body ? (
                                                  <pre
                                                    className="reference-extract-item-body"
                                                    style={{ marginTop: 8, whiteSpace: "pre-wrap" }}
                                                  >
                                                    {c.body}
                                                  </pre>
                                                ) : null}
                                              </div>
                                            ))}
                                            {cards.length > 24 ? (
                                              <div className="muted small">仅展示前 24 张卡片（防止页面过长）。</div>
                                            ) : null}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  ) : (
                                    <pre className="reference-extract-item-body">{ex.body}</pre>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {heavyJob ? (
        <div className="reference-heavy-overlay" role="alertdialog" aria-busy="true" aria-live="polite">
          <div className="reference-heavy-card">
            <h3 className="reference-heavy-title">正在处理</h3>
            {heavyJob.fileName ? (
              <p className="reference-heavy-file muted small">{heavyJob.fileName}</p>
            ) : null}
            <p className="reference-heavy-label">{heavyJob.label ?? "…"}</p>
            <div className="reference-heavy-bar" role="progressbar" aria-valuenow={heavyJob.percent} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="reference-heavy-bar-fill"
                style={{ width: `${Math.min(100, heavyJob.percent)}%` }}
              />
            </div>
            <p className="reference-heavy-pct muted small">{heavyJob.percent}%</p>
          </div>
        </div>
      ) : null}

      {/* 书籍详情工作台（P2-1） */}
      <Dialog
        open={workbenchOpen}
        onOpenChange={(v) => {
          setWorkbenchOpen(v);
          if (!v) {
            setWorkbenchRefId(null);
            setWorkbenchEntry(null);
            setWorkbenchHeads([]);
            setWorkbenchExcerpts([]);
            setWorkbenchExtracts([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>书籍工作台{workbenchEntry ? `：${workbenchEntry.title}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={workbenchTab === "overview" ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkbenchTab("overview")}
              >
                概览
              </Button>
              <Button
                type="button"
                variant={workbenchTab === "excerpts" ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkbenchTab("excerpts")}
              >
                摘录（{workbenchExcerpts.length}）
              </Button>
              <Button
                type="button"
                variant={workbenchTab === "extracts" ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkbenchTab("extracts")}
              >
                提炼（{workbenchExtracts.length}）
              </Button>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!workbenchEntry}
                  onClick={() => {
                    if (!workbenchEntry) return;
                    void openReader(workbenchEntry, 0, null);
                    setWorkbenchOpen(false);
                  }}
                >
                  打开阅读器
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!workbenchEntry}
                  onClick={() => {
                    if (!workbenchEntry) return;
                    void openPromptExtractFromEntry(workbenchEntry);
                  }}
                >
                  提炼提示词
                </Button>
              </div>
            </div>

            {workbenchTab === "overview" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                  <div className="text-sm font-medium">书目信息</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <div>分段：{workbenchEntry?.chunkCount ?? "—"}</div>
                    <div>章节头：{workbenchEntry?.chapterHeadCount ?? "—"}</div>
                    <div>字数（估算）：{workbenchEntry?.totalChars ? `${Math.round(workbenchEntry.totalChars / 10000)} 万` : "—"}</div>
                    <div>分类：{(workbenchEntry?.category ?? "").trim() || "—"}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                  <div className="text-sm font-medium">跨模块入口</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to={importWorkId ? `/work/${importWorkId}/bible` : "#"} onClick={(e) => !importWorkId && e.preventDefault()}>
                      <Button type="button" size="sm" variant="outline" disabled={!importWorkId}>
                        进入锦囊（需选作品）
                      </Button>
                    </Link>
                    <Link to="/logic">
                      <Button type="button" size="sm" variant="outline">
                        去推演
                      </Button>
                    </Link>
                    <Link to="/luobi">
                      <Button type="button" size="sm" variant="outline">
                        去落笔
                      </Button>
                    </Link>
                    <Link to="/inspiration">
                      <Button type="button" size="sm" variant="outline">
                        去流光
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    提示：先在「提炼」里生成结构化卡片，再逐张"应用到作品"，可形成引用闭环。
                  </div>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-border/50 bg-card/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">章节导航</div>
                    <div className="text-xs text-muted-foreground">{workbenchHeads.length} 条</div>
                  </div>
                  {workbenchHeads.length === 0 ? (
                    <div className="mt-2 text-sm text-muted-foreground">未检测到章节标题行（仍可按段阅读）。</div>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {workbenchHeads.slice(0, 16).map((h) => (
                        <Button
                          key={h.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="justify-start"
                          onClick={() => {
                            if (!workbenchEntry) return;
                            void openReader(workbenchEntry, h.ordinal, null);
                            setWorkbenchOpen(false);
                          }}
                        >
                          {h.title}
                        </Button>
                      ))}
                      {workbenchHeads.length > 16 ? (
                        <div className="text-xs text-muted-foreground">仅展示前 16 个章节标题（可在阅读器侧栏查看完整列表）。</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {workbenchTab === "excerpts" ? (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/50 bg-card/20 p-3">
                {workbenchExcerpts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无摘录。</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {workbenchExcerpts.slice(0, 60).map((ex) => (
                      <div key={ex.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">
                            {new Date(ex.createdAt).toLocaleString("zh-CN")}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => void jumpExcerptToReader(ex)}>
                              定位
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => openPromptExtractFromExcerpt(ex)}>
                              提炼提示词
                            </Button>
                          </div>
                        </div>
                        <pre className="reference-extract-item-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                          {ex.text}
                        </pre>
                        {ex.note ? (
                          <div className="mt-2 text-xs text-muted-foreground">备注：{ex.note}</div>
                        ) : null}
                      </div>
                    ))}
                    {workbenchExcerpts.length > 60 ? (
                      <div className="text-xs text-muted-foreground">仅展示前 60 条摘录。</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {workbenchTab === "extracts" ? (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/50 bg-card/20 p-3">
                {workbenchExtracts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无提炼结果。</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {workbenchExtracts.slice(0, 30).map((ex) => (
                      <div key={ex.id} className="rounded-lg border border-border/50 bg-background/40 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs rounded-md border border-border/60 bg-background/60 px-2 py-0.5">
                            {getExtractTypeLabel(ex.type)}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {new Date(ex.createdAt).toLocaleString("zh-CN")}
                          </div>
                        </div>
                        {ex.type === "key_cards" ? (
                          <div className="mt-2 flex flex-col gap-2">
                            {parseReferenceKeyCardsFromExtractBody(ex.body).slice(0, 12).map((c, idx) => (
                              <div key={`${c.kind}:${c.title}:${idx}`} className="rounded-md border border-border/50 bg-card/20 p-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5">
                                    {c.kind}
                                  </span>
                                  <div className="text-sm font-medium">{c.title}</div>
                                  <div className="ml-auto">
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <Button type="button" size="sm" variant="outline" onClick={() => applyKeyCardToWenceRefs(c)}>
                                        去问策引用
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => void jumpKeyCardToWritingHit(c)}>
                                        去写作定位
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => void applyKeyCardToAiDraft(c)}>
                                        写入草稿
                                      </Button>
                                      <Button type="button" size="sm" onClick={() => void applyKeyCardToWork(c)}>
                                        应用到作品
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="text-xs text-muted-foreground">仅预览前 12 张卡片。</div>
                          </div>
                        ) : (
                          <pre className="reference-extract-item-body" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                            {ex.body}
                          </pre>
                        )}
                      </div>
                    ))}
                    {workbenchExtracts.length > 30 ? (
                      <div className="text-xs text-muted-foreground">仅展示前 30 条提炼结果。</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* 扩展搜索弹窗（输入超过10字自动弹出） */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>扩展搜索</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <textarea
              ref={searchDialogRef}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  setSearchDialogOpen(false);
                  void runSearch();
                }
              }}
              placeholder="输入更长的搜索关键词…"
              rows={4}
              className="w-full resize-none rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {countNonPunctuation(searchQ)} 字 · Enter 搜索，Shift+Enter 换行
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQ(""); setSearchHits([]); setSearchDialogOpen(false); }}
                >
                  清空
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={searchLoading || !searchQ.trim()}
                  onClick={() => { setSearchDialogOpen(false); void runSearch(); }}
                >
                  {searchLoading ? "搜索中…" : "搜索"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 提炼提示词弹窗 */}
      {promptExtractDialogOpen && promptExtractSource && (
        promptExtractSource.kind === "excerpt" ? (
          <PromptExtractDialog
            open={promptExtractDialogOpen}
            onClose={() => { setPromptExtractDialogOpen(false); setPromptExtractSource(null); }}
            bookTitle={promptExtractSource.bookTitle ?? activeTitle}
            source="excerpt"
            excerptText={promptExtractSource.excerptText}
            excerptNote={promptExtractSource.excerptNote}
            excerptId={promptExtractSource.excerptId}
          />
        ) : (
          <PromptExtractDialog
            open={promptExtractDialogOpen}
            onClose={() => { setPromptExtractDialogOpen(false); setPromptExtractSource(null); }}
            bookTitle={promptExtractSource.bookTitle ?? activeTitle}
            source="book"
            chunkTexts={promptExtractChunksRef.current}
            chunkCount={promptExtractSource.chunkCount}
          />
        )
      )}

      <ReferenceAiChatDialog
        open={aiChatDialogOpen}
        onClose={() => setAiChatDialogOpen(false)}
        bookTitle={activeTitle || undefined}
        bookChunks={aiChatBookChunks}
        refWorkId={activeRefId}
      />

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(o) => {
          if (confirmBusy) return;
          if (!o) {
            confirmResolveRef.current?.(false);
            confirmResolveRef.current = null;
            setConfirmState({ open: false });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.open ? confirmState.title : "确认操作"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState.open ? confirmState.description : "请确认是否继续。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={confirmBusy}
              onClick={() => {
                confirmResolveRef.current?.(false);
                confirmResolveRef.current = null;
              }}
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              className={
                confirmState.open && confirmState.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                void runConfirmAction();
              }}
            >
              {confirmState.open ? (confirmBusy ? "处理中…" : confirmState.actionText) : "确定"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(importProgress || heavyJob) ? (
        <div
          className="fixed inset-0 z-[var(--z-blocking-layer)] flex items-center justify-center bg-black/25 backdrop-blur-sm"
          role="alertdialog"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border/40 bg-background/90 p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="relative grid h-14 w-14 place-items-center">
                <Spinner className="size-14 text-primary" />
                <div className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-foreground">
                  {Math.round(
                    heavyJob
                      ? heavyJob.percent
                      : Math.min(100, (importProgress!.current / Math.max(1, importProgress!.total)) * 100),
                  )}
                  %
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-foreground">
                  {heavyJob ? "正在处理" : `正在导入 ${importProgress!.current} / ${importProgress!.total}`}
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  {heavyJob
                    ? (heavyJob.label ?? "…")
                    : (importProgress!.fileName ? importProgress!.fileName : "…")}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border/40 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">经书存于心，不留于云。</div>
              <div className="mt-1">（您的书籍仅在本地解析，不上传服务器）</div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  importAbortRef.current?.abort();
                }}
              >
                取消导入
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
