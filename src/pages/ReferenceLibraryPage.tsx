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
  addReferenceExcerpt,
  clearAllReferenceLibraryData,
  deleteReferenceExcerpt,
  deleteReferenceLibraryEntry,
  deleteReferenceTag,
  getWork,
  listChapters,
  listReferenceExcerptsWithTagIds,
  listReferenceChapterHeads,
  listReferenceExtracts,
  updateReferenceLibraryEntry,
} from "../db/repo";
import type {
  Chapter,
  ReferenceChapterHead,
  ReferenceExcerpt,
  ReferenceSearchHit,
} from "../db/types";
import {
  getExtractTypeLabel,
  EXTRACT_TYPES,
} from "../ai/reference-extract";

import { workPathSegmentForId } from "../util/work-url";

import {
  Book,
  Download,
  X,
  Wand2,
} from "lucide-react";
import { PromptExtractDialog } from "../components/PromptExtractDialog";
import { ReferenceAiChatDialog } from "../components/ReferenceAiChatDialog";

import { parseReferenceKeyCardsFromExtractBody, type ReferenceKeyCard } from "../util/reference-key-cards";
import { writeAiPanelDraft } from "../util/ai-panel-draft";
import { writeWenceRefsImport } from "../util/wence-refs-import";
import { writeEditorHitHandoff } from "../util/editor-hit-handoff";
import { writeEditorRefsImport } from "../util/editor-refs-import";
import { useReferenceSearchShengHuiHandoff } from "../hooks/useReferenceSearchShengHuiHandoff";
import { ReferenceSearchHitShengHuiRow } from "../components/reference/ReferenceSearchHitShengHuiRow";
import { useReferenceLibrary, loadReaderPos } from "./reference/hooks/useReferenceLibrary";
import { useReferenceImport } from "./reference/hooks/useReferenceImport";
import { useReferenceReader } from "./reference/hooks/useReferenceReader";
import { useReferenceSearch } from "./reference/hooks/useReferenceSearch";
import { useReferenceExtract } from "./reference/hooks/useReferenceExtract";
import { useExcerptEditForm } from "./reference/hooks/useExcerptEditForm";
import { useReferenceWorkbench } from "./reference/hooks/useReferenceWorkbench";
import { ReferenceToolbar } from "./reference/components/ReferenceToolbar";
import { ImportConfigDialog } from "./reference/components/ImportConfigDialog";
import { useImperativeDialog } from "../components/ImperativeDialog";
import { ReferenceLibraryList } from "./reference/components/ReferenceLibraryList";
import { ReferenceReaderPanel } from "./reference/components/ReferenceReaderPanel";

const LS_REF_PROGRESS_FILTER = "liubai-ref3_8-progress-filter";
const LS_REF_PROGRESS_WORK = "liubai-ref3_8-progress-work";


/** 统计非标点符号字符数 */
function countNonPunctuation(s: string): number {
  return s.replace(/[\s\p{P}\p{S}]/gu, "").length;
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

export function ReferenceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { prompt } = useImperativeDialog();
  const [busy, setBusy] = useState(false);

  const {
    items,
    filteredItems,
    loading,
    categoryFilter,
    setCategoryFilter,
    favoriteIds,
    favoriteScope,
    setFavoriteScope,
    exportSelection,
    setExportSelection,
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    worksList,
    refreshLibrary,
    
    
    categoryOptions,
    libraryTotals,
    toggleReferenceFavorite,
    selectAllFilteredForExport,
    clearExportSelection,
    runExportZip,
    filterEmptyHint,
  } = useReferenceLibrary(setBusy);

  const chunkAnchorRef = useRef<HTMLDivElement | null>(null);

  const {
    activeRefId,
    activeTitle,
    activeChunkCount,
    loadedChunks,
    focusOrdinal,
    setFocusOrdinal,
    highlight,
    setHighlight,
    activeChapterHeads,
    currentChapterIndex,
    currentChapterTitle,
    openReader,
    closeReader,
  } = useReferenceReader({ 
    chunkAnchorRef,
    onOpen: async (entry) => {
      setReaderCollapsed(false);
      await loadExcerpts(entry.id);
    }
  });

  const {
    importProgress,
    heavyJob,
    setHeavyJob,
    pendingImportFiles,
    importAbortRef,
    fileRef,
    openPicker,
    handleFiles,
    cancelImport,
    confirmImport,
  } = useReferenceImport({
    refreshLibrary,
    openReader,
    confirmOnce,
    setBusy,
  });

  const [maintainBusy, setMaintainBusy] = useState(false);

  const {
    searchQ,
    setSearchQ,
    searchHits,
    setSearchHits,
    searchLoading,
    refSearchMode,
    searchScopeRefId,
    setSearchScopeRefId,
    searchDialogOpen,
    setSearchDialogOpen,
    searchDialogRef,
    runSearch,
    switchRefSearchMode,
    chapterLabelForHit,
    rebuildIndex,
  } = useReferenceSearch({
    activeRefId,
    setBusy,
    setMaintainBusy,
    setHeavyJob,
    refreshLibrary,
  });



  const [readerCollapsed, setReaderCollapsed] = useState(false);
  const [excerpts, setExcerpts] = useState<Array<ReferenceExcerpt & { tagIds: string[] }>>([]);

  const [excerptTagFilterId, setExcerptTagFilterId] = useState<string>("");
  const [progressFilterEnabled, setProgressFilterEnabled] = useState(loadProgressFilterEnabled);
  const [progressFilterWorkId, setProgressFilterWorkId] = useState(loadProgressFilterWorkId);
  const [progressChapters, setProgressChapters] = useState<Chapter[]>([]);
  const [progressCursor, setProgressCursor] = useState<string | null>(null);
  const refWorkPathSeg = useCallback(
    (internalId: string) => workPathSegmentForId(worksList, internalId),
    [worksList],
  );
  /** 书目 id → 检测到的章节标题行（展开时懒加载） */
  const [refChapterHeadsById, setRefChapterHeadsById] = useState<Record<string, ReferenceChapterHead[]>>({});


  const [extractCountById, setExtractCountById] = useState<Record<string, number>>({});
  const totalExtracts = useMemo(() => Object.values(extractCountById).reduce((a, b) => a + b, 0), [extractCountById]);

  // ── 提炼要点（P1-03）状态 ──────────────────────────────────────────────
  // ── 提炼提示词 Dialog 状态 ──────────────────────────────────────────────────
  const [importWorkId, setImportWorkId] = useState<string>("");
  const [importBusy, setImportBusy] = useState<Record<string, boolean>>({});

  const {
    extractPanelOpen,
    setExtractPanelOpen,
    extractType,
    setExtractType,
    extractStreaming,
    extractLoading,
    extractError,
    savedExtracts,
    setSavedExtracts,
    extractAbortRef,
    promptExtractDialogOpen,
    setPromptExtractDialogOpen,
    promptExtractSource,
    setPromptExtractSource,
    promptExtractChunksRef,
    aiChatDialogOpen,
    setAiChatDialogOpen,
    aiChatBookChunks,
    handleStartExtract,
    handleImportExtract,
    applyKeyCardToWork,
    formatKeyCardText,
    openPromptExtractFromExcerpt,
    openPromptExtractFromBook,
    openPromptExtractFromEntry,
    openAiChat,
    deleteExtract,
  } = useReferenceExtract({
    activeRefId,
    activeTitle,
    importWorkId,
    navigate,
    refWorkPathSeg,
    setImportBusy,
  });



  // ── 书籍详情工作台（P2-1） ───────────────────────────────────────────────
  const {
    workbenchOpen,
    workbenchEntry,
    workbenchHeads,
    workbenchExcerpts,
    workbenchExtracts,
    workbenchTab,
    setWorkbenchTab,
    openWorkbench,
    closeWorkbench,
  } = useReferenceWorkbench({ items });

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
            closeReader();
            setExcerpts([]);
            setHighlight(null);
          }
          if (searchScopeRefId === id) setSearchScopeRefId(null);
          await refreshLibrary();
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
          await refreshLibrary();
          await refreshTags();
          if (activeRefId) await loadExcerpts(activeRefId);
          break;
        }
        case "clear-library": {
          setMaintainBusy(true);
          try {
            await clearAllReferenceLibraryData();
            closeReader();
            setExcerpts([]);
            setSearchHits([]);
            await refreshLibrary();
          } finally {
            setMaintainBusy(false);
          }
          break;
        }
        case "delete-extract": {
          const id = String(confirmState.payload.id ?? "");
          if (!id) break;
          await deleteExtract(id);
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


  // 加载每本书的提炼条目数





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

  const {
    editingExcerptId,
    setEditingExcerptId,
    editNote,
    setEditNote,
    editTagIds,
    setEditTagIds,
    editLinkedWorkId,
    setEditLinkedWorkId,
    editLinkedChapterId,
    setEditLinkedChapterId,
    editChapters,
    allTags,
    newTagName,
    setNewTagName,
    beginEditExcerpt,
    saveExcerptEdit,
    cancelEditExcerpt,
    handleCreateTag,
    refreshTags,
  } = useExcerptEditForm({ activeRefId, loadExcerpts });

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
      navigate(`/work/${refWorkPathSeg(wid)}?chapter=${encodeURIComponent(chapterId)}`);
    },
    [formatKeyCardText, importWorkId, navigate, progressCursor, refWorkPathSeg],
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
      navigate(`/work/${refWorkPathSeg(wid)}?hit=1&chapter=${encodeURIComponent(chapterId)}`);
    },
    [activeTitle, importWorkId, navigate, progressCursor, refWorkPathSeg],
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
      navigate(`/work/${refWorkPathSeg(wid)}?refsImport=1&chapter=${encodeURIComponent(chapterId)}`);
    },
    [activeTitle, importWorkId, navigate, progressCursor, refWorkPathSeg],
  );

  // ── 打开「提炼提示词」Dialog ───────────────────────────────────────────────



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

  const openSearchHitInShengHui = useReferenceSearchShengHuiHandoff(navigate, importWorkId, progressCursor);

  async function saveSelectionAsExcerpt() {
    if (!activeRefId) return;
    const ch = loadedChunks.curr;
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
    const note = await prompt("摘录备注（可空）", "");
    if (note === null) return;
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



  const currentChunk = loadedChunks.curr;
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

      <ReferenceToolbar
        searchQ={searchQ}
        setSearchQ={setSearchQ}
        runSearch={runSearch}
        searchLoading={searchLoading}
        setSearchHits={setSearchHits}
        setSearchDialogOpen={setSearchDialogOpen}
        searchScopeRefId={searchScopeRefId}
        setSearchScopeRefId={setSearchScopeRefId}
        refSearchMode={refSearchMode}
        switchRefSearchMode={switchRefSearchMode}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categoryOptions={categoryOptions}
        sortBy={sortBy}
        setSortBy={setSortBy}
        favoriteScope={favoriteScope}
        setFavoriteScope={setFavoriteScope}
        libraryTotals={libraryTotals}
        totalExtracts={totalExtracts}
        favoriteIds={favoriteIds}
        activeRefId={activeRefId}
        activeTitle={activeTitle}
        items={items}
        openAiChat={openAiChat}
        busy={busy}
        exportSelection={exportSelection}
        runExportZip={runExportZip}
        openPicker={openPicker}
        importProgress={importProgress}
        fileRef={fileRef}
        handleFiles={handleFiles}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

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
                    <ReferenceSearchHitShengHuiRow
                      hit={h}
                      chapterLabel={chapterLabelForHit(h.refWorkId, h.ordinal) ?? ""}
                      shengHuiDisabled={!importWorkId}
                      onOpenInReader={() => void onHitClick(h)}
                      onShengHui={() => void openSearchHitInShengHui(h)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ReferenceLibraryList
            items={items}
            filteredItems={filteredItems}
            viewMode={viewMode as "grid" | "list"}
            favoriteIds={favoriteIds}
            exportSelection={exportSelection}
            extractCountById={extractCountById}
            refChapterHeadsById={refChapterHeadsById}
            filterEmptyHint={filterEmptyHint}
            openPicker={openPicker}
            setCategoryFilter={setCategoryFilter}
            setFavoriteScope={setFavoriteScope}
            refCoverHue={refCoverHue}
            loadReaderPos={loadReaderPos}
            toggleReferenceFavorite={toggleReferenceFavorite}
            setExportSelection={setExportSelection}
            openReader={openReader}
            openWorkbench={openWorkbench}
            setExtractPanelOpen={setExtractPanelOpen}
            openPromptExtractFromEntry={openPromptExtractFromEntry}
            prompt={prompt}
            updateReferenceLibraryEntry={updateReferenceLibraryEntry}
            refreshLibrary={refreshLibrary}
            handleDelete={handleDelete}
            listReferenceChapterHeads={listReferenceChapterHeads}
            setRefChapterHeadsById={setRefChapterHeadsById}
          />

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
                            await handleCreateTag();
                            await refreshLibrary();
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
                  onClick={rebuildIndex}
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
                <ReferenceReaderPanel
                  activeRefId={activeRefId}
                  activeTitle={activeTitle}
                  activeChunkCount={activeChunkCount}
                  activeChapterHeads={activeChapterHeads}
                  currentChunk={currentChunk}
                  prevChunk={prevChunk}
                  nextChunk={nextChunk}
                  focusOrdinal={focusOrdinal}
                  setFocusOrdinal={setFocusOrdinal}
                  currentChapterIndex={currentChapterIndex}
                  currentChapterTitle={currentChapterTitle}
                  highlight={highlight}
                  setHighlight={setHighlight}
                  saveSelectionAsExcerpt={saveSelectionAsExcerpt}
                  chunkAnchorRef={chunkAnchorRef}
                />

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
                              onClick={cancelEditExcerpt}
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
          if (!v) closeWorkbench();
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
                    closeWorkbench();
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
                    <Link to={importWorkId ? `/work/${refWorkPathSeg(importWorkId)}/bible` : "#"} onClick={(e) => !importWorkId && e.preventDefault()}>
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
                            closeWorkbench();
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
              <div className="mt-1">（您的书籍仅存于本地，不上传服务器）</div>
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

      <ImportConfigDialog
        pendingImportFiles={pendingImportFiles}
        onConfirm={confirmImport}
        onCancel={cancelImport}
      />
    </div>
  );
}
