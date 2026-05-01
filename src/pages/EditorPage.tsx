import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  addChapterSnapshot,
  addBibleCharacter,
  addBibleGlossaryTerm,
  deleteBibleCharacter,
  deleteBibleGlossaryTerm,
  searchWork,
  reorderBibleCharacters,
  updateBibleCharacter,
  updateBibleGlossaryTerm,
} from "../db/repo";
import type {
  BookSearchHit,
  Chapter,
  TuiyanPushedOutlineEntry,
  Volume,
  Work,
} from "../db/types";
import { exitDocumentFullscreen, requestDocumentFullscreen } from "../util/browser-fullscreen";
import { LAST_CHAPTER_SESSION_KEY_PREFIX } from "../util/last-chapter-session";
import { wordCount } from "../util/wordCount";
import { neighborSummaryPoolChaptersForWritingPanel } from "../util/neighbor-summary-pool";
import type { WritingSkillMode } from "../ai/assemble-context";
import { resolveOneClickAiProvider } from "../ai/last-used-provider";
import { loadAiSettings } from "../ai/storage";
import { BatchChapterSummaryModal } from "../components/BatchChapterSummaryModal";
import { ChapterSummaryEditorModal } from "../components/ChapterSummaryEditorModal";
import { createAutoSummaryQueue } from "../ai/chapter-summary-auto";
import type { EditorRefsImportItem } from "../util/editor-refs-import";
import type { CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";
import { useEditorZen } from "../components/EditorZenContext";
import { useImperativeDialog } from "../components/ImperativeDialog";
import { useRightRail, type RightRailTabId } from "../components/RightRailContext";
import { StudyLibraryDialog, type StudyLibraryTab } from "../components/study/StudyLibraryDialog";
import { useTopbar } from "../components/TopbarContext";
import { loadEditorTypography, type EditorPaperTint } from "../util/editor-typography";
import { useResolvedWorkFromRoute } from "../hooks/useResolvedWorkFromRoute";
import { useEditorOpenAiFromQuery } from "../hooks/useEditorOpenAiFromQuery";
import { useEditorChapterViewInserts } from "../hooks/useEditorChapterViewInserts";
import { useEditorRightRailMount } from "../hooks/useEditorRightRailMount";
import { useWorkAiContext } from "../hooks/useWorkAiContext";
import { HOTKEY_EVENT, matchHotkey, readZenToggleHotkey } from "../util/hotkey-config";
import { useEditorPersist, useAutoSave } from "../hooks/useEditorPersist";
import { useEditorShengHuiHandoffNavigation } from "../hooks/useEditorShengHuiHandoffNavigation";
import { useEditorMoreMenu } from "../hooks/useEditorMoreMenu";
import { useEditorBeforeUnloadGuard } from "../hooks/useEditorBeforeUnloadGuard";
import { useEditorDraftAutosave } from "../hooks/useEditorDraftAutosave";
import { useEditorPendingScroll } from "../hooks/useEditorPendingScroll";
import { useEditorChapterRefSync } from "../hooks/useEditorChapterRefSync";
import { useEditorChapterNote } from "../hooks/useEditorChapterNote";
import { useEditorInspirationList } from "../hooks/useEditorInspirationList";
import { useEditorAutoSummaryQueue } from "../hooks/useEditorAutoSummaryQueue";
import { useEditorChapterTitle } from "../hooks/useEditorChapterTitle";
import {
  useEditorPaperTintSync,
  useEditorAutoWidthPersist,
  useEditorChapterSortPersist,
  useEditorFocusReturnOnActive,
  useEditorFocusReturnOnZen,
  useEditorOutlineSelection,
  useEditorNeighborPoolSync,
} from "../hooks/useEditorMiscEffects";
import {
  useEditorPaperWidthDrag,
  useEditorSidebarWidthDrag,
} from "../hooks/useEditorWidthDrags";
import { useEditorChapterBibleSync } from "../hooks/useEditorChapterBibleSync";
import { useEditorChapterSummaryModal } from "../hooks/useEditorChapterSummaryModal";
import { useEditorWorkLoader } from "../hooks/useEditorWorkLoader";
import { useEditorPageKeyboard } from "../hooks/useEditorPageKeyboard";
import { useEditorChapterSwitch } from "../hooks/useEditorChapterSwitch";
import { useEditorChapterMutations } from "../hooks/useEditorChapterMutations";
import { useEditorExternalHandoffs } from "../hooks/useEditorExternalHandoffs";
import { EditorFindReplaceBar } from "../components/editor/EditorFindReplaceBar";
import { useEditorTopbarMount } from "../hooks/useEditorTopbarMount";
import { EditorChapterSidebar } from "../components/editor/EditorChapterSidebar";
import { EditorManuscriptFrame } from "../components/editor/EditorManuscriptFrame";
import { EditorChapterConstraintsDialog } from "../components/editor/EditorChapterConstraintsDialog";
import { useEditorExportActions } from "../hooks/useEditorExportActions";
import { useEditorFindReplace } from "../hooks/useEditorFindReplace";
import { useEditorSnapshotActions } from "../hooks/useEditorSnapshotActions";
import { useEditorSummarySave } from "../hooks/useEditorSummarySave";
import { ExportBookDialog } from "../components/ExportBookDialog";
import { ChapterSnapshotDialog } from "../components/ChapterSnapshotDialog";
import { BookSearchDialog } from "../components/BookSearchDialog";
import { PullOutlineDialog } from "../components/editor/PullOutlineDialog";
import { FullscreenLoader } from "../components/FullscreenLoader";
import { saveChapterOutlinePaste } from "../util/chapter-outline-paste-storage";
import {
  EDITOR_AUTO_MAX_CAP_PX,
  EDITOR_AUTO_WIDTH_KEY,
  EDITOR_DEFAULT_MAX_WIDTH_PX,
  EDITOR_WIDTH_KEY,
} from "../util/editor-layout-prefs";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const SIDEBAR_KEY = "liubai:editorSidebarCollapsed";
const CHAPTER_LIST_KEY = "liubai:chapterListCollapsed";
const CHAPTER_SORT_DIR_KEY_PREFIX = "liubai:chapterListSortDir:";

export function EditorPage() {
  const { resolvedWorkId, phase, routeParam } = useResolvedWorkFromRoute();
  const workId = phase === "ok" && resolvedWorkId ? resolvedWorkId : null;
  const location = useLocation();
  const navigate = useNavigate();
  const rightRail = useRightRail();
  /** EditorShell 里这些方法为 useState/useCallback，引用稳定；勿把 whole rightRail 放进 deps，否则 tabs 每变会换对象身份。 */
  const {
    setOpen: setRightRailOpen,
    setActiveTab: setRightRailActiveTab,
  } = rightRail;
  const { zenWrite, setZenWrite } = useEditorZen();
  const imperativeDialog = useImperativeDialog();

  useEffect(() => {
    if (phase === "notfound") {
      toast.error("未找到该作品，或书号/链接无效");
      navigate("/library", { replace: true });
    }
  }, [phase, navigate]);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    if (sp.get("zen") !== "1") return;
    setZenWrite(true);
    void requestDocumentFullscreen();
    sp.delete("zen");
    const q = sp.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: true });
  }, [location.search, location.pathname, navigate, setZenWrite]);

  // 沉浸模式可配置快捷键监听
  const zenWriteRef = useRef(zenWrite);
  useEffect(() => {
    zenWriteRef.current = zenWrite;
  }, [zenWrite]);
  useEffect(() => {
    let combo = readZenToggleHotkey();
    const isHandledByShell = (c: { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean; code: string }) =>
      c.alt && !c.shift && !c.ctrl && !c.meta && c.code === "KeyZ";
    const onHotkeyChanged = () => { combo = readZenToggleHotkey(); };
    window.addEventListener(HOTKEY_EVENT, onHotkeyChanged);
    const onKeyDown = (e: KeyboardEvent) => {
      if (matchHotkey(e, combo)) {
        // Alt+Z is already handled in EditorShell; skip here to avoid double-toggle.
        if (isHandledByShell(combo)) return;
        e.preventDefault();
        const next = !zenWriteRef.current;
        setZenWrite(next);
        if (next) void requestDocumentFullscreen();
        else void exitDocumentFullscreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener(HOTKEY_EVENT, onHotkeyChanged);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setZenWrite]);

  const topbar = useTopbar();
  const [paperTint, setPaperTint] = useState<EditorPaperTint>(() => loadEditorTypography().paperTint);
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEditorOpenAiFromQuery(workId, activeId, setRightRailOpen, setRightRailActiveTab);
  const [content, setContent] = useState("");
  const [liuguangReturnVisible, setLiuguangReturnVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaderExited, setLoaderExited] = useState(false);
  // loading 变 true（新作品加载）时复位，让全屏 loader 重新出现
  useEffect(() => { if (loading) setLoaderExited(false); }, [loading]);
  const handleLoaderExited = useCallback(() => setLoaderExited(true), []);
  const [incomingHit, setIncomingHit] = useState<{ title: string; hint?: string } | null>(null);
  const [incomingRefs, setIncomingRefs] = useState<EditorRefsImportItem[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [chapterListCollapsed, setChapterListCollapsed] = useState(() => {
    try {
      return localStorage.getItem(CHAPTER_LIST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() => {
    try {
      const n = Number(localStorage.getItem("liubai:sidebarWidthPx"));
      if (!Number.isFinite(n)) return 240;
      return Math.max(160, Math.min(480, Math.floor(n)));
    } catch {
      return 240;
    }
  });
  const sidebarDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"outline" | "chapter">("chapter");
  const [selectedOutlineEntryId, setSelectedOutlineEntryId] = useState<string | null>(null);
  const [chapterListSortDir, setChapterListSortDir] = useState<"asc" | "desc">(() => {
    try {
      const key = `${CHAPTER_SORT_DIR_KEY_PREFIX}${routeParam ?? ""}`;
      return localStorage.getItem(key) === "desc" ? "desc" : "asc";
    } catch {
      return "asc";
    }
  });
  const { moreOpen, setMoreOpen, moreWrapRef } = useEditorMoreMenu();
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  /** 跳转后自动高亮：存储 { query, isRegex, offset } */
  const pendingScrollRef = useRef<{ query: string; isRegex: boolean; offset: number } | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [pushedOutlines, setPushedOutlines] = useState<TuiyanPushedOutlineEntry[]>([]);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [chapterConstraintsOpen, setChapterConstraintsOpen] = useState(false);
  const [studyLibraryOpen, setStudyLibraryOpen] = useState(false);
  const [studyLibraryTab, setStudyLibraryTab] = useState<StudyLibraryTab>("characters");
  const {
    glossaryTerms,
    bibleCharacters,
    styleSampleSlices,
    aiPanelWorkStyle,
    updateWorkStyleFromPanel,
    workAiWritingVars,
    patchWorkAiWritingVars,
    workAiRagInjectDefaults,
    patchWorkAiRagInjectDefaults,
    syncNeighborSummaryIncludeByIds,
    refreshStudyLibrary,
  } = useWorkAiContext(workId);
  /** 锦囊「提示词」页跳转：一次性写入 AI 侧栏「额外要求」 */
  const [aiUserHintPrefill, setAiUserHintPrefill] = useState<string | null>(null);
  /** 与 AiPanel 同源：本次生成材料简报（正文工具栏 ▼ 悬停展示） */
  const [aiMaterialsBriefLines, setAiMaterialsBriefLines] = useState<string[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  /** 递增触发 AiPanel 一次「续写」自动 run（§11 步 17） */
  const [aiContinueRunTick, setAiContinueRunTick] = useState(0);
  const [aiLastContinueConsumedTick, setAiLastContinueConsumedTick] = useState(0);
  const onAiContinueRunConsumed = useCallback((tick: number) => {
    setAiLastContinueConsumedTick(tick);
  }, []);
  const [aiDrawRunTick, setAiDrawRunTick] = useState(0);
  const [aiLastDrawConsumedTick, setAiLastDrawConsumedTick] = useState(0);
  const onAiDrawRunConsumed = useCallback((tick: number) => {
    setAiLastDrawConsumedTick(tick);
  }, []);
  const onAiPrefillUserHintConsumed = useCallback(() => {
    setAiUserHintPrefill(null);
  }, []);
  const onAiMaterialsSummaryLinesChange = useCallback((lines: string[]) => {
    setAiMaterialsBriefLines(lines);
  }, []);

  /** AI 运行模式（续写/改写/…）：侧栏「设定」里切换，与 AI Tab 共用 */
  const [writingSkillMode, setWritingSkillMode] = useState<WritingSkillMode>("continue");

  /** P1-A：content 防抖版本，传给 setTabContent 副作用，避免每次击键都重新挂载面板 */
  const aiPanelContent = useDebouncedValue(content, 600);

  const onAiPanelClose = useCallback(() => {
    setAiOpen(false);
    setRightRailOpen(false);
  }, [setRightRailOpen]);
  const onSummaryJumpToChapter = useCallback((id: string) => void switchChapterRef.current(id), []);
  const onSummaryChapterPatch = useCallback((id: string, patch: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const [chapterListMutating, setChapterListMutating] = useState(false);
  const autoSummaryQueueRef = useRef<ReturnType<typeof createAutoSummaryQueue> | null>(null);
  const workTitleRef = useRef<string>("");
  const chapterTitleRef = useRef<Map<string, string>>(new Map());
  const [editorMaxWidthPx, setEditorMaxWidthPx] = useState(() => {
    try {
      const n = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
      if (!Number.isFinite(n)) return EDITOR_DEFAULT_MAX_WIDTH_PX;
      return Math.max(720, Math.min(EDITOR_AUTO_MAX_CAP_PX, Math.floor(n)));
    } catch {
      return EDITOR_DEFAULT_MAX_WIDTH_PX;
    }
  });
  const [editorAutoWidth, setEditorAutoWidth] = useState(() => {
    try {
      const v = localStorage.getItem(EDITOR_AUTO_WIDTH_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
      return true;
    } catch {
      return true;
    }
  });
  const widthDragRef = useRef<null | { startX: number; startW: number }>(null);
  const lastPersistedRef = useRef<Map<string, string>>(new Map());
  /** 与存储层 `updatedAt` 对齐，供步 25 正文保存乐观锁 */
  const chapterServerUpdatedAtRef = useRef<Map<string, number>>(new Map());
  const chapterOrderRef = useRef<Map<string, number>>(new Map());
  const {
    saveState,
    bgSaveIssue,
    setBgSaveIssue,
    persistInFlightRef,
    resolveSaveConflict,
    enqueueChapterPersist,
    runPersistChapter,
    persistContent,
  } = useEditorPersist({
    workId,
    lastPersistedRef,
    chapterServerUpdatedAtRef,
    chapterTitleRef,
    chapterOrderRef,
    workTitleRef,
    autoSummaryQueueRef,
    setChapters,
  });

  /** 供早于 `switchChapter` 声明的 effect / 侧栏 JSX 调用，避免 TDZ */
  const switchChapterRef = useRef<(id: string) => Promise<void>>(async () => {});
  const contentRef = useRef(content);
  const activeIdRef = useRef(activeId);
  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  /** 侧栏「插入/追加/替换」：章纲 Tab 时编辑器未挂载，需等切回章节正文再写入（见 useEditorChapterViewInserts） */
  const getSelectedText = useCallback(() => editorRef.current?.getSelectedText() ?? "", []);
  const { insertAtCursor, appendToEnd, replaceSelection, ensureChapterViewBeforeInsert } =
    useEditorChapterViewInserts(sidebarTab, setSidebarTab, activeId, editorRef);
  const onRefInsert = useCallback(
    (t: string) => {
      const ins = t.endsWith("\n") ? t : t + "\n\n";
      insertAtCursor(ins);
      setRightRailOpen(false);
    },
    [insertAtCursor, setRightRailOpen],
  );
  useEditorFocusReturnOnActive(activeId, editorRef);
  contentRef.current = content;
  activeIdRef.current = activeId;
  useEditorFocusReturnOnZen(zenWrite, editorRef);
  useEditorPaperTintSync(setPaperTint);
  useEditorAutoWidthPersist(editorAutoWidth);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );

  const { chapterBibleFields, setChapterBibleFields, cbStateRef } = useEditorChapterBibleSync({
    activeId,
    workId,
    activeIdRef,
  });
  const {
    summaryOpen,
    setSummaryOpen,
    summaryDraft,
    setSummaryDraft,
    summaryAiBusy,
    setSummaryAiBusy,
    summaryAiAbortRef,
    runChapterSummaryAi,
  } = useEditorChapterSummaryModal({
    activeChapter,
    work,
    content,
    chapterServerUpdatedAtRef,
    setChapters,
  });
  const { chapterNote, setChapterNote, noteOpen, setNoteOpen } = useEditorChapterNote(activeId);
  const { inspirationList } = useEditorInspirationList(workId, inspirationOpen);
  const { autoSummaryStatus } = useEditorAutoSummaryQueue({
    activeId,
    autoSummaryQueueRef,
    chapterServerUpdatedAtRef,
    chapterOrderRef,
    setChapters,
  });
  const {
    chapterTitleEditing,
    setChapterTitleEditing,
    chapterTitleDraft,
    setChapterTitleDraft,
    commitChapterTitle,
    saveChapterTitle,
  } = useEditorChapterTitle({
    activeChapter,
    chapterServerUpdatedAtRef,
    chapterTitleRef,
    setChapters,
  });

  const {
    findOpen, setFindOpen,
    findQ, setFindQ,
    replaceQ, setReplaceQ,
    findStep, findPositions,
    handleFindNext, handleReplaceFirst, handleReplaceAll,
  } = useEditorFindReplace({ content, setContent, editorRef, imperativeDialog });

  const {
    snapshotOpen, setSnapshotOpen,
    snapshotList,
    handleRestoreSnapshot, handleDeleteSnapshot, refreshSnapshotList,
  } = useEditorSnapshotActions({
    activeId, activeChapter, content, persistContent,
    chapterServerUpdatedAtRef, lastPersistedRef,
    setContent, setChapters, imperativeDialog,
  });

  const {
    batchSummaryOpen, setBatchSummaryOpen,
    saveSummary, onChapterSummarySaved,
  } = useEditorSummarySave({
    activeId,
    activeChapter,
    summaryDraft,
    chapterServerUpdatedAtRef,
    setChapters,
    setSummaryOpen,
    setSummaryDraft,
  });

  const selectedOutlineEntry = useMemo(
    () => pushedOutlines.find((e) => e.id === selectedOutlineEntryId) ?? null,
    [pushedOutlines, selectedOutlineEntryId],
  );

  useEditorOutlineSelection({
    sidebarTab,
    pushedOutlines,
    selectedOutlineEntryId,
    setSelectedOutlineEntryId,
  });

  const outlineMode = sidebarTab === "outline";
  const goShengHuiHandoff = useEditorShengHuiHandoffNavigation(navigate, workId, activeId, getSelectedText);
  const [pullOutlineDialogOpen, setPullOutlineDialogOpen] = useState(false);

  const openPullOutlineDialog = useCallback(() => {
    setPullOutlineDialogOpen(true);
  }, []);

  const handleConfirmPullOutline = useCallback(
    (entry: TuiyanPushedOutlineEntry) => {
      if (!workId) return;
      if (!activeChapter) {
        toast.error("请先在「章节正文」标签页打开一个章节，再拉取内容。");
        return;
      }
      const content = (entry.content ?? "").trim();
      if (!content) return;
      saveChapterOutlinePaste(workId, activeChapter.id, content);
    },
    [workId, activeChapter],
  );

  const neighborPoolForAiSettings = useMemo(
    () => neighborSummaryPoolChaptersForWritingPanel(chapters, activeChapter, workAiRagInjectDefaults.recentN),
    [chapters, activeChapter, workAiRagInjectDefaults.recentN],
  );

  const neighborPoolIds = useMemo(
    () => neighborPoolForAiSettings.map((c) => c.id),
    [neighborPoolForAiSettings],
  );
  useEditorNeighborPoolSync(neighborPoolIds, syncNeighborSummaryIncludeByIds);

  const editorPaperFrameStyle = useMemo(
    () =>
      editorAutoWidth
        ? {
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box" as const,
          }
        : {
            width: "100%",
            maxWidth: `${Math.min(editorMaxWidthPx, EDITOR_AUTO_MAX_CAP_PX)}px`,
            marginLeft: "auto",
            marginRight: "auto",
            boxSizing: "border-box" as const,
          },
    [editorAutoWidth, editorMaxWidthPx],
  );

  useEditorChapterSortPersist(workId, routeParam, chapterListSortDir);


  useEditorChapterRefSync({
    chapters,
    work,
    chapterServerUpdatedAtRef,
    chapterTitleRef,
    chapterOrderRef,
    workTitleRef,
  });

  const chapterWords = useMemo(() => wordCount(content), [content]);

  /** 3.6：摘录侧已关联当前章时，在侧栏展示入口 */
  const linkedExcerptsForChapter = useMemo(
    () =>
      activeId ? inspirationList.filter((ex) => ex.linkedChapterId === activeId) : [],
    [inspirationList, activeId],
  );

  /** §11 步 18：抽卡至少需正文或章节概要其一 */
  const canAiDrawCard = useMemo(() => {
    if (!activeChapter) return false;
    const hasBody = content.trim().length > 0;
    const hasSummary = (activeChapter.summary ?? "").trim().length > 0;
    return hasBody || hasSummary;
  }, [activeChapter, content]);

  useEditorRightRailMount({
    workId,
    work,
    activeChapter,
    chapters,
    aiPanelContent,
    chapterBibleFields,
    glossaryTerms,
    bibleCharacters,
    styleSampleSlices,
    aiPanelWorkStyle,
    updateWorkStyleFromPanel,
    workAiWritingVars,
    patchWorkAiWritingVars,
    workAiRagInjectDefaults,
    patchWorkAiRagInjectDefaults,
    linkedExcerptsForChapter,
    aiContinueRunTick,
    aiLastContinueConsumedTick,
    onAiContinueRunConsumed,
    aiDrawRunTick,
    aiLastDrawConsumedTick,
    onAiDrawRunConsumed,
    aiUserHintPrefill,
    onAiPrefillUserHintConsumed,
    onAiMaterialsSummaryLinesChange,
    writingSkillMode,
    setWritingSkillMode,
    autoSummaryStatus,
    onAiPanelClose,
    getSelectedText,
    insertAtCursor,
    appendToEnd,
    replaceSelection,
    ensureChapterViewBeforeInsert,
    onSummaryJumpToChapter,
    onSummaryChapterPatch,
    onRefInsert,
    openPullOutlineDialog,
    pushedOutlinesCount: pushedOutlines.length,
  });

  const { load } = useEditorWorkLoader({
    workId,
    imperativeDialog,
    lastPersistedRef,
    setWork,
    setChapters,
    setVolumes,
    setPushedOutlines,
    setActiveId,
    setContent,
    setLoading,
  });

  useEditorExternalHandoffs({
    workId,
    activeId,
    activeChapter,
    chapters,
    location,
    navigate,
    imperativeDialog,
    switchChapterRef,
    contentRef,
    pendingScrollRef,
    setAiUserHintPrefill,
    setRightRailActiveTab,
    setRightRailOpen,
    setIncomingHit,
    setIncomingRefs,
    setFindQ,
    setFindOpen,
    setLiuguangReturnVisible,
    insertAtCursor,
    appendToEnd,
  });

  useEditorPendingScroll({ activeId, content, editorRef, pendingScrollRef });

  useEffect(() => {
    if (!workId || !activeId) return;
    sessionStorage.setItem(LAST_CHAPTER_SESSION_KEY_PREFIX + workId, activeId);
  }, [workId, activeId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFindOpen(false);
        setMoreOpen(false);
        setBookSearchOpen(false);
        setSnapshotOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setters 引用稳定，无需放进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    setDragChapterId,
    handleNewChapterRef,
    handleNewChapter,
    handleNewVolume,
    handleRenameVolume,
    handleDeleteVolumeUi,
    handleMoveChapterToVolume,
    handleAttachOrphansToFirstVolume,
    handleDropChapter,
    handleRename,
    handleDeleteChapter,
    moveChapter,
    setProgressChapter,
  } = useEditorChapterMutations({
    workId,
    activeId,
    activeChapter,
    content,
    chapters,
    setChapters,
    volumes,
    setVolumes,
    setActiveId,
    setContent,
    setWork,
    setChapterListMutating,
    lastPersistedRef,
    chapterServerUpdatedAtRef,
    chapterTitleRef,
    chapterOrderRef,
    commitChapterTitle,
    enqueueChapterPersist,
    runPersistChapter,
    imperativeDialog,
    load,
  });

  function insertExcerptIntoEditor(text: string) {
    const ins = text.endsWith("\n") ? text : text + "\n\n";
    if (!activeChapter) return;
    insertAtCursor(ins);
  }

  async function copySelectionToClipboard() {
    const t = getSelectedText();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  }

  function duplicateSelectionAfterCaret() {
    const t = getSelectedText();
    if (!t) return;
    insertAtCursor(t);
  }

  useEditorDraftAutosave(workId, activeId, content);
  useEditorBeforeUnloadGuard({
    activeIdRef,
    contentRef,
    lastPersistedRef,
    persistInFlightRef,
  });

  function toggleSidebar() {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleChapterList() {
    setChapterListCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(CHAPTER_LIST_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const handleResolveSaveConflict = useCallback(async () => {
    await resolveSaveConflict(activeId, (c) => {
      if (c) setContent(c.content);
    });
  }, [activeId, resolveSaveConflict]);

  const switchChapter = useEditorChapterSwitch({
    activeId,
    workId,
    content,
    chapters,
    setActiveId,
    setContent,
    setChapters,
    setBgSaveIssue,
    lastPersistedRef,
    chapterTitleRef,
    cbStateRef,
    enqueueChapterPersist,
    runPersistChapter,
  });
  switchChapterRef.current = switchChapter;

  useAutoSave(content, activeId, persistContent);

  const {
    exportDialogOpen,
    setExportDialogOpen,
    exportFormat,
    exportChapterTxt,
    exportBookTxt,
    doExportBookTxt,
    exportChapterDocx,
    exportBookDocx,
    doExportBookDocx,
  } = useEditorExportActions({
    activeChapter,
    activeId,
    work,
    workId,
    content,
    persistContent,
  });

  const handleManualSnapshot = useCallback(async () => {
    if (!activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    refreshSnapshotList(activeId);
  }, [activeId, content, persistContent, refreshSnapshotList]);

  // 须在 handleManualSnapshot 之后：避免 TDZ（依赖数组在声明前求值）
  useEditorPageKeyboard({
    onNewChapter: () => void handleNewChapterRef.current(),
    toggleSidebar,
    toggleChapterList,
    toggleRightRailTab,
    handleManualSnapshot,
  });

  useEditorTopbarMount({
    topbar,
    work,
    workId,
    activeChapter,
    chapters,
    aiOpen,
    setAiOpen,
    canAiDrawCard,
    editorAutoWidth,
    setEditorAutoWidth,
    saveState,
    bgSaveIssue,
    setBgSaveIssue,
    rightRailOpen: rightRail.open,
    rightRailActiveTab: rightRail.activeTab,
    setRightRailActiveTab,
    setRightRailOpen,
    setAiContinueRunTick,
    setAiDrawRunTick,
    setStudyLibraryTab,
    setStudyLibraryOpen,
    navigate,
    handleManualSnapshot,
    handleResolveSaveConflict,
    switchChapter,
  });

  useEditorPaperWidthDrag({ widthDragRef, editorMaxWidthPx, setEditorMaxWidthPx });
  useEditorSidebarWidthDrag({ sidebarDragRef, sidebarWidthPx, setSidebarWidthPx });

  function openBookSearch() {
    setBookSearchOpen(true);
  }

  function closeBookSearch() {
    setBookSearchOpen(false);
  }

  function toggleRightRailTab(tab: RightRailTabId) {
    if (rightRail.open && rightRail.activeTab === tab) {
      setRightRailOpen(false);
      if (tab === "ai") setAiOpen(false);
      return;
    }
    setRightRailActiveTab(tab);
    setRightRailOpen(true);
    if (tab === "ai") setAiOpen(true);
  }

  async function jumpToSearchHit(hit: BookSearchHit, query: string, isRegex: boolean) {
    pendingScrollRef.current = {
      query,
      isRegex,
      offset: hit.firstMatchOffset ?? 0,
    };
    if (hit.chapterId === activeId) {
      closeBookSearch();
      const ps = pendingScrollRef.current;
      pendingScrollRef.current = null;
      requestAnimationFrame(() => {
        editorRef.current?.scrollToMatch(ps.query, ps.isRegex, ps.offset);
        editorRef.current?.highlight(ps.query, ps.isRegex);
      });
      return;
    }
    await switchChapter(hit.chapterId);
    closeBookSearch();
  }

  async function navigateToStudyMention(chapterId: string, query: string) {
    const q = query.trim();
    if (!q) return;
    const hitChapter = chapters.find((c) => c.id === chapterId);
    if (!hitChapter) {
      toast.error("目标章节不存在");
      return;
    }
    pendingScrollRef.current = {
      query: q,
      isRegex: false,
      offset: Math.max(0, (hitChapter.content ?? "").indexOf(q)),
    };
    setIncomingHit({
      title: q,
      hint: `书斋定位 · 第${hitChapter.order}章 ${hitChapter.title}`,
    });
    setFindQ(q);
    if (chapterId === activeId) {
      const ps = pendingScrollRef.current;
      pendingScrollRef.current = null;
      window.setTimeout(() => {
        if (!ps) return;
        editorRef.current?.scrollToMatch(ps.query, ps.isRegex, ps.offset);
        editorRef.current?.highlight(ps.query, ps.isRegex);
      }, 30);
      return;
    }
    await switchChapter(chapterId);
  }

  function openSummaryForChapter(chapterId: string) {
    if (activeId === chapterId) setSummaryOpen(true);
    else void switchChapter(chapterId).then(() => setSummaryOpen(true));
  }

  const isRouteLoading = phase === "loading";
  const isDataLoading = !!workId && loading;
  const isLoading = isRouteLoading || isDataLoading;

  // 根据阶段给目标进度：路由解析 → 35%；数据加载 → 85%；完成 → 100%
  const loaderTargetPct = isRouteLoading ? 35 : isDataLoading ? 85 : 100;

  // 阻断正文渲染：还在加载 OR exit 动画未跑完（loaderExited 由 FullscreenLoader 回调写入）
  // 这样保证 loader 能完整播放淡出，再切入内容
  const blockContent = isLoading || !loaderExited;

  if (blockContent) {
    // notfound 时 useEffect 已触发 navigate，此处只需维持 loader 直到跳转
    return (
      <FullscreenLoader
        targetPercent={loaderTargetPct}
        onExited={handleLoaderExited}
      />
    );
  }

  // 到达此处 workId 必然有效且 work 已加载，但保留防御性检查
  if (!work) {
    return (
      <div className="page editor-page flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-foreground">作品不存在。</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/library">返回作品库</Link>
        </Button>
      </div>
    );
  }

  const layoutSidebarCollapsed = sidebarCollapsed;

  return (
    <div className={"page editor-page theme-typora editor-page--xy-frame" + (zenWrite ? " editor-page--zen" : "")}>
      <EditorChapterConstraintsDialog
        open={chapterConstraintsOpen}
        onOpenChange={setChapterConstraintsOpen}
        chapterBibleFields={chapterBibleFields}
        setChapterBibleFields={setChapterBibleFields}
      />
      {workId ? (
        <StudyLibraryDialog
          open={studyLibraryOpen}
          onOpenChange={setStudyLibraryOpen}
          workId={workId}
          linkWork={work ?? null}
          workTitle={work?.title ?? ""}
          tab={studyLibraryTab}
          onTabChange={setStudyLibraryTab}
          chapters={chapters}
          activeChapterId={activeId}
          onNavigateToMention={navigateToStudyMention}
          characters={bibleCharacters}
          glossaryTerms={glossaryTerms}
          onRefresh={refreshStudyLibrary}
          addCharacter={addBibleCharacter}
          updateCharacter={updateBibleCharacter}
          deleteCharacter={deleteBibleCharacter}
          reorderCharacters={reorderBibleCharacters}
          addGlossaryTerm={addBibleGlossaryTerm}
          updateGlossaryTerm={updateBibleGlossaryTerm}
          deleteGlossaryTerm={deleteBibleGlossaryTerm}
        />
      ) : null}
      <header className="editor-toolbar-lite" hidden={zenWrite}>
        {sidebarCollapsed && (
          <button
            type="button"
            className="icon-btn group relative"
            title="展开章节"
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <span className="icon-btn__glyph" aria-hidden>⟩</span>
          </button>
        )}
        {liuguangReturnVisible ? (
          <Link
            to="/inspiration?restore=1"
            className="ml-3 inline-flex items-center rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            title="返回流光并恢复筛选状态"
          >
            返回流光
          </Link>
        ) : null}
        {incomingHit ? (
          <div className="ml-3 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-foreground/90">
            <span className="muted">定位来源：</span>
            <span className="font-medium">{incomingHit.title}</span>
            {incomingHit.hint ? <span className="muted">· {incomingHit.hint}</span> : null}
            <button
              type="button"
              className="ml-1 rounded px-1 text-muted-foreground hover:text-foreground"
              onClick={() => setIncomingHit(null)}
              title="关闭回显"
            >
              ×
            </button>
          </div>
        ) : null}
        {incomingRefs.length > 0 ? (
          <div className="ml-3 inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
            <span className="muted">引用材料：</span>
            <span className="muted">{incomingRefs.length} 条</span>
            <div className="flex items-center gap-1">
              {incomingRefs.slice(0, 2).map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/60 px-1.5 py-0.5">
                  <span className="max-w-[10rem] truncate" title={r.title}>{r.title}</span>
                  <button
                    type="button"
                    className="rounded px-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setIncomingRefs((prev) => prev.filter((x) => x.id !== r.id))}
                    title="移除该引用"
                  >
                    ×
                  </button>
                </span>
              ))}
              {incomingRefs.length > 2 ? <span className="muted">…</span> : null}
            </div>
            <button
              type="button"
              className="rounded px-1 text-muted-foreground hover:text-foreground"
              onClick={() => setIncomingRefs([])}
              title="清空回显"
            >
              清空
            </button>
          </div>
        ) : null}
      </header>

      {/* 旧工具条：按你的要求保留，但不再渲染（避免重复交互/点击冲突） */}
      <header className="editor-toolbar" style={{ display: "none" }} aria-hidden />

      <div 
        className={`editor-body ${layoutSidebarCollapsed ? "editor-body--sidebar-collapsed" : ""}`}
        style={{ "--sidebar-w": `${sidebarWidthPx}px` } as React.CSSProperties}
      >
        <EditorChapterSidebar
          collapsed={layoutSidebarCollapsed}
          widthPx={sidebarWidthPx}
          sidebarDragRef={sidebarDragRef}
          toggleSidebar={toggleSidebar}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          chapterListCollapsed={chapterListCollapsed}
          toggleChapterList={toggleChapterList}
          chapterListSortDir={chapterListSortDir}
          setChapterListSortDir={setChapterListSortDir}
          chapterListMutating={chapterListMutating}
          pushedOutlines={pushedOutlines}
          selectedOutlineEntryId={selectedOutlineEntryId}
          setSelectedOutlineEntryId={setSelectedOutlineEntryId}
          work={work}
          activeChapter={activeChapter}
          activeId={activeId}
          chapters={chapters}
          volumes={volumes}
          content={content}
          glossaryTerms={glossaryTerms}
          linkedExcerptsForChapter={linkedExcerptsForChapter}
          inspirationOpen={inspirationOpen}
          setInspirationOpen={setInspirationOpen}
          inspirationList={inspirationList}
          noteOpen={noteOpen}
          setNoteOpen={setNoteOpen}
          chapterNote={chapterNote}
          setChapterNote={setChapterNote}
          onNewChapter={() => void handleNewChapter()}
          onNewVolume={() => void handleNewVolume()}
          onRenameVolume={(id) => void handleRenameVolume(id)}
          onDeleteVolume={(id) => void handleDeleteVolumeUi(id)}
          onAttachOrphansToFirstVolume={() => void handleAttachOrphansToFirstVolume()}
          onDeleteChapter={(id) => void handleDeleteChapter(id)}
          onRenameChapter={(id) => void handleRename(id)}
          onMoveChapter={(id, dir) => void moveChapter(id, dir)}
          onMoveChapterToVolume={(id) => void handleMoveChapterToVolume(id)}
          onDropChapter={(id) => void handleDropChapter(id)}
          onSwitchChapter={(id) => void switchChapter(id)}
          onSetProgressChapter={(id) => void setProgressChapter(id)}
          onOpenSummaryForChapter={(id) => openSummaryForChapter(id)}
          onOpenChapterConstraints={() => setChapterConstraintsOpen(true)}
          onSetDragChapterId={setDragChapterId}
          onInsertExcerpt={insertExcerptIntoEditor}
        />

        <main className="editor-main">
          {findOpen && (
            <EditorFindReplaceBar
              findQ={findQ}
              setFindQ={setFindQ}
              replaceQ={replaceQ}
              setReplaceQ={setReplaceQ}
              findStep={findStep}
              findPositions={findPositions}
              onFindNext={handleFindNext}
              onReplaceFirst={handleReplaceFirst}
              onReplaceAll={handleReplaceAll}
              onClose={() => setFindOpen(false)}
            />
          )}
          <EditorManuscriptFrame
            editorPaperFrameStyle={editorPaperFrameStyle}
            paperTint={paperTint}
            activeChapter={activeChapter}
            workId={workId}
            activeId={activeId}
            outlineMode={outlineMode}
            selectedOutlineEntry={selectedOutlineEntry}
            pushedOutlines={pushedOutlines}
            chapterTitleEditing={chapterTitleEditing}
            setChapterTitleEditing={setChapterTitleEditing}
            chapterTitleDraft={chapterTitleDraft}
            setChapterTitleDraft={setChapterTitleDraft}
            saveChapterTitle={saveChapterTitle}
            editorAutoWidth={editorAutoWidth}
            editorMaxWidthPx={editorMaxWidthPx}
            setEditorMaxWidthPx={setEditorMaxWidthPx}
            setEditorAutoWidth={setEditorAutoWidth}
            widthDragRef={widthDragRef}
            content={content}
            setContent={setContent}
            chapterWords={chapterWords}
            editorRef={editorRef}
            getSelectedText={getSelectedText}
            goShengHuiHandoff={goShengHuiHandoff}
            copySelectionToClipboard={() => void copySelectionToClipboard()}
            duplicateSelectionAfterCaret={duplicateSelectionAfterCaret}
            findOpen={findOpen}
            setFindOpen={setFindOpen}
            bookSearchOpen={bookSearchOpen}
            openBookSearch={openBookSearch}
            closeBookSearch={closeBookSearch}
            setSnapshotOpen={setSnapshotOpen}
            handleManualSnapshot={() => void handleManualSnapshot()}
            rightRailOpen={rightRail.open}
            rightRailActiveTab={rightRail.activeTab}
            toggleRightRailTab={toggleRightRailTab}
            aiMaterialsBriefLines={aiMaterialsBriefLines}
            moreWrapRef={moreWrapRef}
            moreOpen={moreOpen}
            setMoreOpen={setMoreOpen}
            exportChapterTxt={() => void exportChapterTxt()}
            exportBookTxt={() => void exportBookTxt()}
            exportChapterDocx={() => void exportChapterDocx()}
            exportBookDocx={() => void exportBookDocx()}
            onNewChapter={() => void handleNewChapter()}
          />
        </main>

        {/* AI 面板已迁移到全局右侧栏（EditorShell / AppShell） */}
      </div>

      {summaryOpen && activeChapter && (
        <>
          <ChapterSummaryEditorModal
            open
            onCancelGenerate={() => {
              summaryAiAbortRef.current?.abort();
              setSummaryAiBusy(false);
            }}
            chapterTitle={activeChapter.title}
            summaryDraft={summaryDraft}
            onSummaryDraftChange={setSummaryDraft}
            summaryUpdatedAt={activeChapter.summaryUpdatedAt}
            summaryScopeFromOrder={activeChapter.summaryScopeFromOrder}
            summaryScopeToOrder={activeChapter.summaryScopeToOrder}
            summaryAiBusy={summaryAiBusy}
            onClose={() => {
              summaryAiAbortRef.current?.abort();
              setSummaryOpen(false);
            }}
            onRefreshFromSaved={() => setSummaryDraft(activeChapter.summary ?? "")}
            onSaveAndClose={() => void saveSummary(true)}
            onOneClickGenerate={() => {
              const base = loadAiSettings();
              const pid = resolveOneClickAiProvider(base.provider);
              void runChapterSummaryAi({
                providerOverride: pid,
                lengthHint200to500: true,
                rememberLast: pid,
              });
            }}
            onDefaultGenerate={() => {
              void runChapterSummaryAi({ lengthHint200to500: false });
            }}
            onOpenBatch={() => setBatchSummaryOpen(true)}
            onSaveDraft={() => void saveSummary(false)}
          />
          <BatchChapterSummaryModal
            open={batchSummaryOpen}
            onClose={() => setBatchSummaryOpen(false)}
            workTitle={work?.title ?? "未命名作品"}
            chapters={chapters}
            onNavigateToSummaryEditor={(chapterId, summary) => {
              setActiveId(chapterId);
              setSummaryDraft(summary);
              setBatchSummaryOpen(false);
              setSummaryOpen(true);
            }}
            onChapterSummarySaved={onChapterSummarySaved}
          />
        </>
      )}

      <BookSearchDialog
        open={bookSearchOpen}
        initialQuery={findQ}
        onSearch={async (q, scope, isRegex) => {
          if (activeId) await persistContent(activeId, content);
          return searchWork(workId!, q, scope, isRegex);
        }}
        onJumpToHit={(hit, q, isRegex) => void jumpToSearchHit(hit, q, isRegex)}
        onClose={closeBookSearch}
      />

      <ChapterSnapshotDialog
        open={snapshotOpen && !!activeChapter}
        chapterTitle={activeChapter?.title ?? ""}
        snapshots={snapshotList}
        currentContent={content}
        onManualSnapshot={() => void handleManualSnapshot()}
        onRestore={(s) => void handleRestoreSnapshot(s)}
        onDelete={(id) => void handleDeleteSnapshot(id)}
        onClose={() => setSnapshotOpen(false)}
      />

      {/* P2-C/E：导出选项弹窗 */}
      <ExportBookDialog
        open={exportDialogOpen && !!work}
        format={exportFormat}
        chapters={chapters}
        onExport={(opts) => {
          if (exportFormat === "txt") void doExportBookTxt(opts);
          else void doExportBookDocx(opts);
        }}
        onClose={() => setExportDialogOpen(false)}
      />

      <PullOutlineDialog
        open={pullOutlineDialogOpen}
        onOpenChange={setPullOutlineDialogOpen}
        entries={pushedOutlines}
        initialSelectedId={selectedOutlineEntryId}
        onConfirm={handleConfirmPullOutline}
        hasActiveChapter={!!activeChapter}
      />
    </div>
  );
}

