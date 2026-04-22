import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../components/ui/hover-card";
import { cn } from "../lib/utils";
import {
  addChapterSnapshot,
  createChapter,
  createVolume,
  deleteChapter,
  deleteChapterSnapshot,
  deleteVolume,
  getChapterBible,
  getWorkStyleCard,
  getWork,
  listAllReferenceExcerpts,
  listBibleCharacters,
  listBibleGlossaryTerms,
  addBibleCharacter,
  addBibleGlossaryTerm,
  deleteBibleCharacter,
  deleteBibleGlossaryTerm,
  listWritingStyleSamples,
  listChapterSnapshots,
  listChapters,
  listVolumes,
  upsertWorkStyleCard,
  upsertChapterBible,
  reorderChapters,
  searchWork,
  isChapterSaveConflictError,
  updateChapter,
  updateVolume,
  updateWork,
  reorderBibleCharacters,
  updateBibleCharacter,
  updateBibleGlossaryTerm,
} from "../db/repo";
import type {
  BibleCharacter,
  BibleGlossaryTerm,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterSnapshot,
  ReferenceExcerpt,
  Volume,
  Work,
  WritingStyleSample,
} from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import {
  buildBookDocx,
  buildBookTxt,
  buildChapterDocx,
  buildChapterTxt,
  type ExportBookOptions,
} from "../storage/export-txt-docx";
import { exitDocumentFullscreen, requestDocumentFullscreen } from "../util/browser-fullscreen";
import { aiPanelDraftStorageKey } from "../util/ai-panel-draft";
import { addDailyWordsFromDelta } from "../util/dailyWords";
import { clearDraft, readDraft, writeDraftDebounced } from "../util/draftRecovery";
import { LAST_CHAPTER_SESSION_KEY_PREFIX } from "../util/last-chapter-session";
import { readLineEndingMode } from "../util/lineEnding";
import { replaceAllLiteral } from "../util/text-replace";
import { wordCount } from "../util/wordCount";
import {
  defaultWorkAiWritingVars,
  loadWorkAiWritingVars,
  persistWorkAiWritingVars,
} from "../util/work-ai-vars-storage";
import {
  defaultWorkAiRagInjectDefaults,
  loadWorkAiRagInjectDefaults,
  persistWorkAiRagInjectDefaults,
} from "../util/work-ai-rag-inject-defaults-storage";
import { neighborSummaryPoolChaptersForWritingPanel } from "../util/neighbor-summary-pool";
import { referenceReaderHref } from "../util/readUtf8TextFile";
import { isFirstAiGateCancelledError } from "../ai/client";
import type { WritingSkillMode } from "../ai/assemble-context";
import { generateChapterSummaryWithRetry } from "../ai/chapter-summary-generate";
import { rememberLastUsedAiProvider, resolveOneClickAiProvider } from "../ai/last-used-provider";
import { loadAiSettings } from "../ai/storage";
import { BatchChapterSummaryModal } from "../components/BatchChapterSummaryModal";
import { ChapterSummaryEditorModal } from "../components/ChapterSummaryEditorModal";
import { createAutoSummaryQueue } from "../ai/chapter-summary-auto";
import type { AutoSummaryStatus } from "../ai/chapter-summary-auto";
import { clearInspirationTransferHandoff, readInspirationTransferHandoff } from "../util/inspiration-transfer-handoff";
import { clearEditorHitHandoff, readEditorHitHandoff } from "../util/editor-hit-handoff";
import { clearEditorRefsImport, readEditorRefsImport, type EditorRefsImportItem } from "../util/editor-refs-import";
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";
import { AiPanel } from "../components/AiPanel";
import { useEditorZen } from "../components/EditorZenContext";
import { useRightRail, type RightRailTabId } from "../components/RightRailContext";
import { KnowledgeBaseRightPanel, RefRightPanel } from "../components/RightRailPanels";
import { WritingSettingsRightPanel } from "../components/WritingSettingsRightPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { StudyLibraryDialog, type StudyLibraryTab } from "../components/study/StudyLibraryDialog";
import type {
  AiPanelWorkRagInjectDefaultsPatch,
  AiPanelWorkStylePatch,
  AiPanelWorkWritingVarsPatch,
} from "../components/ai-panel/types";
import { useTopbar } from "../components/TopbarContext";
import { EDITOR_TYPOGRAPHY_EVENT, loadEditorTypography, type EditorPaperTint } from "../util/editor-typography";
import { HOTKEY_EVENT, matchHotkey, readZenToggleHotkey } from "../util/hotkey-config";
import { loadChapterNote, saveChapterNote, hasChapterNote } from "../util/chapter-notes-storage";

const SIDEBAR_KEY = "liubai:editorSidebarCollapsed";
const CHAPTER_LIST_KEY = "liubai:chapterListCollapsed";
const CHAPTER_SORT_DIR_KEY_PREFIX = "liubai:chapterListSortDir:";
const EDITOR_WIDTH_KEY = "liubai:editorMaxWidthPx";
const EDITOR_AUTO_WIDTH_KEY = "liubai:editorAutoWidth";
/** 与星月类沉浸式写作对齐：默认用「自适应宽」，避免中间一条窄纸 */
const EDITOR_DEFAULT_MAX_WIDTH_PX = 1200;
const EDITOR_AUTO_MAX_CAP_PX = 1600;

/** P1-A：防抖 hook，用于降低高频 state 变化（如正文 content）对 setTabContent 等副作用的触发频率 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [dv, setDv] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDv(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export function EditorPage() {
  const { workId } = useParams<{ workId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const rightRail = useRightRail();
  /** EditorShell 里这些方法为 useState/useCallback，引用稳定；勿把 whole rightRail 放进 deps，否则 tabs 每变会换对象身份 → setTabContent  effect 死循环 */
  const {
    setOpen: setRightRailOpen,
    setTabContent: setRightRailTabContent,
    setTabEnabled: setRightRailTabEnabled,
    setActiveTab: setRightRailActiveTab,
  } = rightRail;
  const { zenWrite, setZenWrite } = useEditorZen();

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
  zenWriteRef.current = zenWrite;
  useEffect(() => {
    let combo = readZenToggleHotkey();
    const onHotkeyChanged = () => { combo = readZenToggleHotkey(); };
    window.addEventListener(HOTKEY_EVENT, onHotkeyChanged);
    const onKeyDown = (e: KeyboardEvent) => {
      if (matchHotkey(e, combo)) {
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
  const [content, setContent] = useState("");
  const [liuguangReturnVisible, setLiuguangReturnVisible] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  /** 离章后台保存失败（不阻塞当前章顶栏「保存冲突」语义） */
  const [bgSaveIssue, setBgSaveIssue] = useState<null | { chapterId: string; title: string; kind: "conflict" | "error" }>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [findQ, setFindQ] = useState("");
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
  const [chapterListSortDir, setChapterListSortDir] = useState<"asc" | "desc">(() => {
    try {
      const key = `${CHAPTER_SORT_DIR_KEY_PREFIX}${workId ?? ""}`;
      return localStorage.getItem(key) === "desc" ? "desc" : "asc";
    } catch {
      return "asc";
    }
  });
  const [findOpen, setFindOpen] = useState(false);
  const [replaceQ, setReplaceQ] = useState("");
  /** P0-A：当前正在查看的匹配位置（0-based） */
  const [findStep, setFindStep] = useState(0);
  /** P1-F：本章笔记内容 */
  const [chapterNote, setChapterNote] = useState("");
  /** P1-F：笔记区是否展开 */
  const [noteOpen, setNoteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [bookSearchQ, setBookSearchQ] = useState("");
  const [bookSearchLoading, setBookSearchLoading] = useState(false);
  /** null 表示尚未执行过本次会话的搜索 */
  const [bookSearchHits, setBookSearchHits] = useState<BookSearchHit[] | null>(null);
  const [bookSearchRegex, setBookSearchRegex] = useState(false);
  /** 跳转后自动高亮：存储 { query, isRegex, offset } */
  const pendingScrollRef = useRef<{ query: string; isRegex: boolean; offset: number } | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotList, setSnapshotList] = useState<ChapterSnapshot[]>([]);
  /** P2-B：当前展开对比的快照 ID */
  const [diffSnapshotId, setDiffSnapshotId] = useState<string | null>(null);
  /** P2-C/E：导出选项弹窗 */
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportForeword, setExportForeword] = useState("");
  const [exportAfterword, setExportAfterword] = useState("");
  /** "all" | "range" */
  const [exportRangeMode, setExportRangeMode] = useState<"all" | "range">("all");
  const [exportFromOrder, setExportFromOrder] = useState(0);
  const [exportToOrder, setExportToOrder] = useState(0);
  /** "txt" | "docx"：触发导出弹窗时记录格式 */
  const [exportFormat, setExportFormat] = useState<"txt" | "docx">("txt");
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [bookSearchScope, setBookSearchScope] = useState<BookSearchScope>("full");
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [inspirationList, setInspirationList] = useState<
    Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
  >([]);
  /** P1-A：章节 bible 五字段合并为一个对象 state，减少独立 setState 数 */
  const [chapterBibleFields, setChapterBibleFields] = useState({
    goalText: "",
    forbidText: "",
    povText: "",
    sceneStance: "",
    /** §11 步 21：本章人物状态备忘 */
    characterStateText: "",
  });
  const [chapterConstraintsOpen, setChapterConstraintsOpen] = useState(false);
  const [studyLibraryOpen, setStudyLibraryOpen] = useState(false);
  const [studyLibraryTab, setStudyLibraryTab] = useState<StudyLibraryTab>("characters");
  const [stylePov, setStylePov] = useState("");
  const [styleTone, setStyleTone] = useState("");
  const [styleBanned, setStyleBanned] = useState("");
  const [styleAnchor, setStyleAnchor] = useState("");
  const [styleExtra, setStyleExtra] = useState("");
  const [styleSentenceRhythm, setStyleSentenceRhythm] = useState<string | undefined>(undefined);
  const [stylePunctuationStyle, setStylePunctuationStyle] = useState<string | undefined>(undefined);
  const [styleDialogueDensity, setStyleDialogueDensity] = useState<"low" | "medium" | "high" | undefined>(undefined);
  const [styleEmotionStyle, setStyleEmotionStyle] = useState<"cold" | "neutral" | "warm" | undefined>(undefined);
  const [styleNarrativeDistance, setStyleNarrativeDistance] = useState<"omniscient" | "limited" | "deep_pov" | undefined>(undefined);
  const [glossaryTerms, setGlossaryTerms] = useState<BibleGlossaryTerm[]>([]);
  const [bibleCharacters, setBibleCharacters] = useState<BibleCharacter[]>([]);
  const [writingStyleSamples, setWritingStyleSamples] = useState<WritingStyleSample[]>([]);
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

  /** P1-A：稳定的 AiPanel / 右侧栏回调引用，防止 setTabContent 副作用因函数引用变化而重触发 */
  const insertAtCursor = useCallback((t: string) => editorRef.current?.insertTextAtCursor(t), []);
  const appendToEnd = useCallback((t: string) => editorRef.current?.appendTextToEnd(t), []);
  const onAiPanelClose = useCallback(() => {
    setAiOpen(false);
    setRightRailOpen(false);
  }, [setRightRailOpen]);
  const onSummaryJumpToChapter = useCallback((id: string) => void switchChapterRef.current(id), []);
  const onSummaryChapterPatch = useCallback((id: string, patch: Partial<Chapter>) => {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const onRefInsert = useCallback((t: string) => {
    const ins = t.endsWith("\n") ? t : t + "\n\n";
    editorRef.current?.insertTextAtCursor(ins);
    setRightRailOpen(false);
  }, [setRightRailOpen]);

  const updateWorkStyleFromPanel = useCallback(
    (patch: AiPanelWorkStylePatch) => {
      if (!workId) return;
      if (patch.pov !== undefined) setStylePov(patch.pov);
      if (patch.tone !== undefined) setStyleTone(patch.tone);
      if (patch.bannedPhrases !== undefined) setStyleBanned(patch.bannedPhrases);
      if (patch.styleAnchor !== undefined) setStyleAnchor(patch.styleAnchor);
      if (patch.extraRules !== undefined) setStyleExtra(patch.extraRules);
      if (patch.sentenceRhythm !== undefined) setStyleSentenceRhythm(patch.sentenceRhythm);
      if (patch.punctuationStyle !== undefined) setStylePunctuationStyle(patch.punctuationStyle);
      if (patch.dialogueDensity !== undefined) setStyleDialogueDensity(patch.dialogueDensity);
      if (patch.emotionStyle !== undefined) setStyleEmotionStyle(patch.emotionStyle);
      if (patch.narrativeDistance !== undefined) setStyleNarrativeDistance(patch.narrativeDistance);
      void upsertWorkStyleCard(workId, patch);
    },
    [workId],
  );

  const aiPanelWorkStyle = useMemo(
    () => ({
      pov: stylePov,
      tone: styleTone,
      bannedPhrases: styleBanned,
      styleAnchor: styleAnchor,
      extraRules: styleExtra,
      sentenceRhythm: styleSentenceRhythm,
      punctuationStyle: stylePunctuationStyle,
      dialogueDensity: styleDialogueDensity,
      emotionStyle: styleEmotionStyle,
      narrativeDistance: styleNarrativeDistance,
    }),
    [
      stylePov,
      styleTone,
      styleBanned,
      styleAnchor,
      styleExtra,
      styleSentenceRhythm,
      stylePunctuationStyle,
      styleDialogueDensity,
      styleEmotionStyle,
      styleNarrativeDistance,
    ],
  );

  const [workAiWritingVars, setWorkAiWritingVars] = useState(() =>
    workId ? loadWorkAiWritingVars(workId) : defaultWorkAiWritingVars(),
  );

  useEffect(() => {
    if (!workId) return;
    setWorkAiWritingVars(loadWorkAiWritingVars(workId));
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    const t = window.setTimeout(() => persistWorkAiWritingVars(workId, workAiWritingVars), 400);
    return () => clearTimeout(t);
  }, [workId, workAiWritingVars]);

  const patchWorkAiWritingVars = useCallback((patch: AiPanelWorkWritingVarsPatch) => {
    setWorkAiWritingVars((prev) => ({ ...prev, ...patch }));
  }, []);

  const [workAiRagInjectDefaults, setWorkAiRagInjectDefaults] = useState(() =>
    workId ? loadWorkAiRagInjectDefaults(workId) : defaultWorkAiRagInjectDefaults(),
  );

  useEffect(() => {
    if (!workId) return;
    setWorkAiRagInjectDefaults(loadWorkAiRagInjectDefaults(workId));
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    const t = window.setTimeout(() => persistWorkAiRagInjectDefaults(workId, workAiRagInjectDefaults), 400);
    return () => clearTimeout(t);
  }, [workId, workAiRagInjectDefaults]);

  const patchWorkAiRagInjectDefaults = useCallback((patch: AiPanelWorkRagInjectDefaultsPatch) => {
    setWorkAiRagInjectDefaults((prev) => ({ ...prev, ...patch }));
  }, []);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [batchSummaryOpen, setBatchSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [summaryAiBusy, setSummaryAiBusy] = useState(false);
  const summaryAiAbortRef = useRef<AbortController | null>(null);

  const [chapterTitleEditing, setChapterTitleEditing] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [chapterListMutating, setChapterListMutating] = useState(false);
  const [autoSummaryStatus, setAutoSummaryStatus] = useState<AutoSummaryStatus>({ kind: "idle" });
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
  const cbStateRef = useRef({ goal: "", forbid: "", pov: "", scene: "", characterState: "" });
  const cbSkipSaveRef = useRef(true);
  const cbReadyForChapterRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<Map<string, string>>(new Map());
  /** 与存储层 `updatedAt` 对齐，供步 25 正文保存乐观锁 */
  const chapterServerUpdatedAtRef = useRef<Map<string, number>>(new Map());
  const chapterOrderRef = useRef<Map<string, number>>(new Map());
  const persistInFlightRef = useRef(false);
  /** 章节正文写入串行队列，避免离章后台保存与防抖保存交错导致乱序 */
  const persistQueueRef = useRef(Promise.resolve());
  /** 供早于 `switchChapter` 声明的 effect / 侧栏 JSX 调用，避免 TDZ */
  const switchChapterRef = useRef<(id: string) => Promise<void>>(async () => {});
  const contentRef = useRef(content);
  const activeIdRef = useRef(activeId);
  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  /** 章切换后把焦点还给正文（§E.2.3）；全屏/模态打开时不抢焦点 */
  useEffect(() => {
    if (!activeId) return;
    const t = window.requestAnimationFrame(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest?.(".modal-overlay")) return;
      editorRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(t);
  }, [activeId]);
  contentRef.current = content;
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!zenWrite) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => editorRef.current?.focus());
    });
    return () => cancelAnimationFrame(id);
  }, [zenWrite]);

  useEffect(() => {
    const sync = () => setPaperTint(loadEditorTypography().paperTint);
    window.addEventListener(EDITOR_TYPOGRAPHY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EDITOR_TYPOGRAPHY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_AUTO_WIDTH_KEY, editorAutoWidth ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [editorAutoWidth]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );

  const neighborPoolForAiSettings = useMemo(
    () => neighborSummaryPoolChaptersForWritingPanel(chapters, activeChapter, workAiRagInjectDefaults.recentN),
    [chapters, activeChapter, workAiRagInjectDefaults.recentN],
  );

  useEffect(() => {
    const ids = new Set(neighborPoolForAiSettings.map((c) => c.id));
    setWorkAiRagInjectDefaults((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of ids) {
        next[id] = prev.neighborSummaryIncludeById[id] !== false;
      }
      return { ...prev, neighborSummaryIncludeById: next };
    });
  }, [neighborPoolForAiSettings]);

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

  useEffect(() => {
    try {
      const key = `${CHAPTER_SORT_DIR_KEY_PREFIX}${workId ?? ""}`;
      localStorage.setItem(key, chapterListSortDir);
    } catch {
      /* ignore */
    }
  }, [chapterListSortDir, workId]);

  const chapterOrderCmp = useCallback(
    (a: Chapter, b: Chapter) => (chapterListSortDir === "asc" ? a.order - b.order : b.order - a.order),
    [chapterListSortDir],
  );

  /** 卷的 id 与章节里存的 volumeId 不一致时，章节不会出现在任何卷下（合并/导入/删卷遗留）；须单独展示并允许并入首卷 */
  const volumeIdSet = useMemo(() => new Set(volumes.map((v) => v.id)), [volumes]);
  const orphanChapters = useMemo(
    () => [...chapters].filter((c) => !volumeIdSet.has(c.volumeId)).sort(chapterOrderCmp),
    [chapters, volumeIdSet, chapterOrderCmp],
  );

  /** P1-B：扁平化章节列表（卷头行 + 章节行），供虚拟滚动使用 */
  type FlatItem =
    | { kind: "vol-head"; volId: string; title: string; canDelete: boolean }
    | { kind: "chapter"; chapter: typeof chapters[0] }
    | { kind: "orphan-head"; count: number }
    | { kind: "orphan-chapter"; chapter: typeof chapters[0] };

  const flatChapterItems = useMemo((): FlatItem[] => {
    const items: FlatItem[] = [];
    for (const vol of volumes) {
      items.push({ kind: "vol-head", volId: vol.id, title: vol.title, canDelete: volumes.length > 1 });
      const volChaps = chapters.filter((c) => c.volumeId === vol.id).sort(chapterOrderCmp);
      for (const c of volChaps) items.push({ kind: "chapter", chapter: c });
    }
    if (orphanChapters.length > 0) {
      items.push({ kind: "orphan-head", count: orphanChapters.length });
      for (const c of orphanChapters) items.push({ kind: "orphan-chapter", chapter: c });
    }
    return items;
  }, [volumes, chapters, orphanChapters, chapterOrderCmp]);

  const useVirtualChapterList = chapters.length >= 100;
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: flatChapterItems.length,
    getScrollElement: () => virtualListRef.current,
    estimateSize: (i) => {
      const item = flatChapterItems[i];
      if (!item) return 40;
      if (item.kind === "vol-head" || item.kind === "orphan-head") return 32;
      const c = (item as { chapter: typeof chapters[0] }).chapter;
      return c.id === activeId ? 130 : 46;
    },
    overscan: 5,
    enabled: useVirtualChapterList,
  });

  useEffect(() => {
    for (const c of chapters) {
      chapterServerUpdatedAtRef.current.set(c.id, c.updatedAt);
      chapterTitleRef.current.set(c.id, c.title);
      chapterOrderRef.current.set(c.id, c.order);
    }
  }, [chapters]);

  useEffect(() => {
    workTitleRef.current = work?.title ?? "";
  }, [work?.title]);

  useEffect(() => {
    const q = createAutoSummaryQueue();
    autoSummaryQueueRef.current = q;
    const off = q.subscribe((s) => {
      setAutoSummaryStatus(s);
      if (s.kind === "ok") {
        chapterServerUpdatedAtRef.current.set(s.chapterId, s.at);
        chapterOrderRef.current.set(s.chapterId, chapterOrderRef.current.get(s.chapterId) ?? 0);
        setChapters((prev) =>
          prev.map((c) =>
            c.id === s.chapterId
              ? {
                  ...c,
                  summary: s.summary,
                  summaryUpdatedAt: s.at,
                  summaryScopeFromOrder: c.summaryScopeFromOrder ?? c.order,
                  summaryScopeToOrder: c.summaryScopeToOrder ?? c.order,
                  updatedAt: s.at,
                }
              : c,
          ),
        );
      }
    });
    return () => {
      off();
      q.cancel();
      autoSummaryQueueRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 切章时取消后台概要生成，避免"上一章概要写回"带来的扰动感
    autoSummaryQueueRef.current?.cancel();
    setAutoSummaryStatus({ kind: "idle" });
  }, [activeId]);

  useEffect(() => {
    setChapterTitleEditing(false);
    setChapterTitleDraft(activeChapter?.title ?? "");
  }, [activeChapter?.id, activeChapter?.title]);

  const saveChapterTitle = useCallback(async () => {
    if (!activeChapter) return;
    const next = chapterTitleDraft.trim();
    if (!next || next === activeChapter.title) {
      setChapterTitleEditing(false);
      setChapterTitleDraft(activeChapter.title);
      return;
    }
    try {
      const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
      const t = Date.now();
      await updateChapter(
        activeChapter.id,
        { title: next },
        exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
      );
      chapterServerUpdatedAtRef.current.set(activeChapter.id, t);
      chapterTitleRef.current.set(activeChapter.id, next);
      setChapters((prev) =>
        prev.map((c) => (c.id === activeChapter.id ? { ...c, title: next, updatedAt: t } : c)),
      );
      setChapterTitleEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节标题保存失败");
      setChapterTitleDraft(activeChapter.title);
      setChapterTitleEditing(false);
    }
  }, [activeChapter, chapterTitleDraft]);

  useEffect(() => {
    if (!summaryOpen || !activeChapter) return;
    setSummaryDraft(activeChapter.summary ?? "");
  }, [summaryOpen, activeChapter]);

  const runChapterSummaryAi = useCallback(
    async (opts: {
      providerOverride?: import("../ai/types").AiProviderId;
      lengthHint200to500?: boolean;
      rememberLast?: import("../ai/types").AiProviderId;
    }) => {
      if (!activeChapter || !work) return;
      summaryAiAbortRef.current?.abort();
      const ac = new AbortController();
      summaryAiAbortRef.current = ac;
      setSummaryAiBusy(true);
      try {
        const base = loadAiSettings();
        const text = await generateChapterSummaryWithRetry({
          workTitle: work.title || "未命名作品",
          chapterTitle: activeChapter.title,
          chapterContent: content,
          settings: base,
          providerOverride: opts.providerOverride,
          lengthHint200to500: opts.lengthHint200to500,
          signal: ac.signal,
        });
        setSummaryDraft(text);
        const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
        const t = Date.now();
        await updateChapter(
          activeChapter.id,
          {
            summary: text,
            summaryUpdatedAt: t,
            summaryScopeFromOrder: activeChapter.order,
            summaryScopeToOrder: activeChapter.order,
          },
          exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
        );
        setChapters((prev) =>
          prev.map((c) =>
            c.id === activeChapter.id
              ? {
                  ...c,
                  summary: text,
                  summaryUpdatedAt: t,
                  summaryScopeFromOrder: activeChapter.order,
                  summaryScopeToOrder: activeChapter.order,
                  updatedAt: t,
                }
              : c,
          ),
        );
        if (opts.rememberLast) rememberLastUsedAiProvider(opts.rememberLast);
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "生成失败");
      } finally {
        setSummaryAiBusy(false);
        summaryAiAbortRef.current = null;
      }
    },
    [activeChapter, content, work],
  );

  const chapterWords = useMemo(() => wordCount(content), [content]);

  /** 3.6：摘录侧已关联当前章时，在侧栏展示入口 */
  const linkedExcerptsForChapter = useMemo(
    () =>
      activeId ? inspirationList.filter((ex) => ex.linkedChapterId === activeId) : [],
    [inspirationList, activeId],
  );

  const styleSampleSlices = useMemo(
    () => writingStyleSamples.map((s) => ({ title: s.title, body: s.body })),
    [writingStyleSamples],
  );

  useEffect(() => {
    const st = location.state as { applyUserHint?: string } | null | undefined;
    const h = st?.applyUserHint;
    if (typeof h !== "string" || !h.trim()) return;
    setAiUserHintPrefill(h);
    setRightRailActiveTab("ai");
    setRightRailOpen(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: {} },
    );
    // setActiveTab / setOpen 来自 context；仅依赖路由即可
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rightRail API 引用不稳定时避免重复 replace
  }, [location.key, location.pathname, location.search, location.hash, navigate]);

  /** §11 步 18：抽卡至少需正文或章节概要其一 */
  const canAiDrawCard = useMemo(() => {
    if (!activeChapter) return false;
    const hasBody = content.trim().length > 0;
    const hasSummary = (activeChapter.summary ?? "").trim().length > 0;
    return hasBody || hasSummary;
  }, [activeChapter, content]);

  // Mount AI 等面板到写作壳右侧栏（仅 EditorShell）
  useEffect(() => {
    if (!workId || !work) return;
    setRightRailTabEnabled("ai", true);
    setRightRailTabContent(
      "ai",
      <AiPanel
        hideHeader
        onClose={onAiPanelClose}
        continueRunTick={aiContinueRunTick}
        lastContinueConsumedTick={aiLastContinueConsumedTick}
        onContinueRunConsumed={onAiContinueRunConsumed}
        drawRunTick={aiDrawRunTick}
        lastDrawConsumedTick={aiLastDrawConsumedTick}
        onDrawRunConsumed={onAiDrawRunConsumed}
        prefillUserHint={aiUserHintPrefill}
        onPrefillUserHintConsumed={onAiPrefillUserHintConsumed}
        onMaterialsSummaryLinesChange={onAiMaterialsSummaryLinesChange}
        writingSkillMode={writingSkillMode}
        onWritingSkillModeChange={setWritingSkillMode}
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapters={chapters}
        chapterContent={aiPanelContent}
        chapterBible={chapterBibleFields}
        glossaryTerms={glossaryTerms}
        bibleCharacters={bibleCharacters}
        styleSampleSlices={styleSampleSlices}
        workStyle={aiPanelWorkStyle}
        onUpdateWorkStyle={updateWorkStyleFromPanel}
        workWritingVars={workAiWritingVars}
        onWorkWritingVarsChange={patchWorkAiWritingVars}
        workRagInjectDefaults={workAiRagInjectDefaults}
        onWorkRagInjectDefaultsChange={patchWorkAiRagInjectDefaults}
        linkedExcerptsForChapter={linkedExcerptsForChapter}
        getSelectedText={getSelectedText}
        insertAtCursor={insertAtCursor}
        appendToEnd={appendToEnd}
        replaceSelection={replaceSelection}
      />,
    );
    setRightRailTabEnabled("summary", true);
    setRightRailTabContent(
      "summary",
      <KnowledgeBaseRightPanel
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapterEditorContent={aiPanelContent}
        chapters={chapters}
        autoSummaryStatus={autoSummaryStatus}
        onJumpToChapter={onSummaryJumpToChapter}
        onChapterPatch={onSummaryChapterPatch}
      />,
    );
    setRightRailTabEnabled("bible", true);
    setRightRailTabContent(
      "bible",
      <WritingSettingsRightPanel
        workId={workId}
        work={work}
        chapters={chapters}
        chapter={activeChapter}
        workStyle={aiPanelWorkStyle}
        onUpdateWorkStyle={updateWorkStyleFromPanel}
        workWritingVars={workAiWritingVars}
        onWorkWritingVarsChange={patchWorkAiWritingVars}
        workRagInjectDefaults={workAiRagInjectDefaults}
        onWorkRagInjectDefaultsChange={patchWorkAiRagInjectDefaults}
        writingSkillMode={writingSkillMode}
        onWritingSkillModeChange={setWritingSkillMode}
      />,
    );
    setRightRailTabEnabled("ref", true);
    setRightRailTabContent(
      "ref",
      <RefRightPanel
        linked={linkedExcerptsForChapter}
        onInsert={onRefInsert}
      />,
    );
    return () => {
      setRightRailTabContent("ai", null);
      setRightRailTabContent("summary", null);
      setRightRailTabContent("bible", null);
      setRightRailTabContent("ref", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
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
    onAiPanelClose,
    insertAtCursor,
    appendToEnd,
    onSummaryJumpToChapter,
    onSummaryChapterPatch,
    onRefInsert,
  ]);

  const glossaryHits = useMemo(() => {
    if (!content || glossaryTerms.length === 0) return [];
    const sorted = [...glossaryTerms].sort((a, b) => b.term.length - a.term.length);
    const seen = new Set<string>();
    const out: BibleGlossaryTerm[] = [];
    for (const t of sorted) {
      if (!t.term.trim()) continue;
      if (content.includes(t.term) && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [content, glossaryTerms]);

  useEffect(() => {
    cbStateRef.current = {
      goal: chapterBibleFields.goalText,
      forbid: chapterBibleFields.forbidText,
      pov: chapterBibleFields.povText,
      scene: chapterBibleFields.sceneStance,
      characterState: chapterBibleFields.characterStateText,
    };
  }, [chapterBibleFields]);

  useEffect(() => {
    if (!workId) return;
    void listBibleGlossaryTerms(workId).then(setGlossaryTerms);
  }, [workId]);

  const refreshStudyLibrary = useCallback(async () => {
    if (!workId) return;
    const [chars, gloss] = await Promise.all([listBibleCharacters(workId), listBibleGlossaryTerms(workId)]);
    setBibleCharacters(chars);
    setGlossaryTerms(gloss);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    void listBibleCharacters(workId).then(setBibleCharacters);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    void listWritingStyleSamples(workId).then(setWritingStyleSamples);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    void getWorkStyleCard(workId).then((row) => {
      setStylePov(row?.pov ?? "");
      setStyleTone(row?.tone ?? "");
      setStyleBanned(row?.bannedPhrases ?? "");
      setStyleAnchor(row?.styleAnchor ?? "");
      setStyleExtra(row?.extraRules ?? "");
      setStyleSentenceRhythm(row?.sentenceRhythm);
      setStylePunctuationStyle(row?.punctuationStyle);
      setStyleDialogueDensity(row?.dialogueDensity);
      setStyleEmotionStyle(row?.emotionStyle);
      setStyleNarrativeDistance(row?.narrativeDistance);
    });
  }, [workId]);

  useEffect(() => {
    if (!activeId || !workId) return;
    cbSkipSaveRef.current = true;
    cbReadyForChapterRef.current = null;
    void getChapterBible(activeId).then((row) => {
      if (activeIdRef.current !== activeId) return;
      setChapterBibleFields({
        goalText: row?.goalText ?? "",
        forbidText: row?.forbidText ?? "",
        povText: row?.povText ?? "",
        sceneStance: row?.sceneStance ?? "",
        characterStateText: row?.characterStateText ?? "",
      });
      cbReadyForChapterRef.current = activeId;
      window.setTimeout(() => {
        if (activeIdRef.current === activeId) cbSkipSaveRef.current = false;
      }, 0);
    });
  }, [activeId, workId]);

  useEffect(() => {
    if (!activeId || !workId) return;
    if (cbSkipSaveRef.current) return;
    if (cbReadyForChapterRef.current !== activeId) return;
    const t = window.setTimeout(() => {
      void upsertChapterBible({
        chapterId: activeId,
        workId,
        goalText: chapterBibleFields.goalText,
        forbidText: chapterBibleFields.forbidText,
        povText: chapterBibleFields.povText,
        sceneStance: chapterBibleFields.sceneStance,
        characterStateText: chapterBibleFields.characterStateText,
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [chapterBibleFields, activeId, workId]);

  const load = useCallback(async () => {
    if (!workId) return;
    setLoading(true);
    const w = await getWork(workId);
    if (!w) {
      setWork(null);
      setChapters([]);
      setActiveId(null);
      setContent("");
      setLoading(false);
      return;
    }
    setWork(w);
    const list = await listChapters(workId);
    setChapters(list);
    const vols = await listVolumes(workId);
    setVolumes(vols);
    lastPersistedRef.current.clear();
    for (const c of list) {
      lastPersistedRef.current.set(c.id, c.content);
    }
    const stored = sessionStorage.getItem(LAST_CHAPTER_SESSION_KEY_PREFIX + workId);
    const pick =
      (stored && list.some((c) => c.id === stored) && stored) ||
      list[0]?.id ||
      null;
    setActiveId(pick);
    const first = list.find((c) => c.id === pick);
    const initial = first?.content ?? "";
    setContent(initial);
    if (workId && pick && first) {
      const dr = readDraft(workId, pick);
      if (dr && dr.savedAt > first.updatedAt && dr.content !== initial) {
        if (window.confirm("检测到未同步的本地草稿（如异常关闭前）。是否用草稿覆盖当前正文？")) {
          setContent(dr.content);
          lastPersistedRef.current.set(pick, first.content);
        } else {
          clearDraft(workId, pick);
        }
      }
    }
    setLoading(false);
  }, [workId]);

  /* 挂载时从 IndexedDB 拉取作品与章节 */
  useEffect(() => {
    void load();
  }, [load]);

  // 兼容概要总览页的 deep link：/work/:id?chapter=xxx
  useEffect(() => {
    if (!workId) return;
    try {
      const u = new URL(window.location.href);
      const c = u.searchParams.get("chapter");
      if (c && chapters.some((x) => x.id === c)) {
        void switchChapterRef.current(c);
        u.searchParams.delete("chapter");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // P0-3：跨模块引用材料导入（一次性消费，写作页可见可移除）
  useEffect(() => {
    if (!workId || !chapters.length) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("refsImport") === "1";
      if (should) {
        u.searchParams.delete("refsImport");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;
    const payload = readEditorRefsImport();
    clearEditorRefsImport();
    if (!payload) return;
    if (payload.workId !== workId) return;
    if (!chapters.some((c) => c.id === payload.chapterId)) return;
    setIncomingRefs(payload.items.slice(0, 8));
    void switchChapterRef.current(payload.chapterId);
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ref");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // P0-3：跨模块定位到命中片段（一次性消费）
  useEffect(() => {
    if (!workId || !chapters.length) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("hit") === "1";
      if (should) {
        u.searchParams.delete("hit");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;
    const payload = readEditorHitHandoff();
    clearEditorHitHandoff();
    if (!payload) return;
    if (payload.workId !== workId) return;
    if (!payload.query.trim()) return;
    const exists = chapters.some((c) => c.id === payload.chapterId);
    if (!exists) return;

    setIncomingHit({ title: payload.source.title, hint: payload.source.hint });
    pendingScrollRef.current = {
      query: payload.query,
      isRegex: payload.isRegex ?? false,
      offset: payload.offset ?? 0,
    };
    void switchChapterRef.current(payload.chapterId);
    setFindQ(payload.query);
    setFindOpen(true);
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  // 全书搜索跳转后自动高亮定位（P0-E：同时写入持久装饰高亮）
  useEffect(() => {
    const ps = pendingScrollRef.current;
    if (!ps || !activeId || !content) return;
    pendingScrollRef.current = null;
    // setTimeout 给 CM 多一点时间稳定文档，避免内容更新 effect 与 scrollToMatch 竞争
    const t = window.setTimeout(() => {
      editorRef.current?.scrollToMatch(ps.query, ps.isRegex, ps.offset);
      editorRef.current?.highlight(ps.query, ps.isRegex);
    }, 60);
    return () => window.clearTimeout(t);
  }, [activeId, content]);

  // 切换章节时清除上一章的搜索高亮
  useEffect(() => {
    editorRef.current?.clearHighlight();
  }, [activeId]);

  // 步 38：流光转入"光标位插入"handoff（跳转到写作页后执行）
  useEffect(() => {
    if (!workId || !activeId) return;
    let should = false;
    try {
      const u = new URL(window.location.href);
      should = u.searchParams.get("liuguangInsert") === "1";
      if (should) {
        u.searchParams.delete("liuguangInsert");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      should = false;
    }
    if (!should) return;

    const payload = readInspirationTransferHandoff();
    if (!payload || payload.workId !== workId || payload.chapterId !== activeId || payload.mode !== "insertCursor") {
      return;
    }
    // 等编辑器挂载后插入
    const text = payload.text;
    clearInspirationTransferHandoff();
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    const tryInsert = (n: number) => {
      if (n <= 0) return;
      const ok = !!editorRef.current;
      if (ok) {
        // 冲突提示：若正文已包含该段（或高度相似片段），提示用户避免重复插入
        const cur = contentRef.current ?? "";
        const needle = text.trim().slice(0, 80);
        if (needle && cur.includes(needle)) {
          if (!window.confirm("检测到正文中可能已存在相同片段，仍要在光标处插入吗？")) return;
        }
        editorRef.current?.insertTextAtCursor(text);
        setLiuguangReturnVisible(true);
        return;
      }
      window.setTimeout(() => tryInsert(n - 1), 60);
    };
    tryInsert(12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, activeId]);

  // 流光转入：章末追加 / 写入侧栏草稿（与 insertCursor 类似，由 query param 触发一次）
  useEffect(() => {
    if (!workId || !activeId) return;
    let mode: "appendEnd" | "mergeAiDraft" | null = null;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("liuguangAppend") === "1") {
        mode = "appendEnd";
        u.searchParams.delete("liuguangAppend");
        window.history.replaceState({}, "", u.toString());
      } else if (u.searchParams.get("liuguangDraft") === "1") {
        mode = "mergeAiDraft";
        u.searchParams.delete("liuguangDraft");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      mode = null;
    }
    if (!mode) return;

    const payload = readInspirationTransferHandoff();
    if (!payload || payload.workId !== workId || payload.chapterId !== activeId || payload.mode !== mode) return;
    clearInspirationTransferHandoff();
    if (mode === "appendEnd") {
      const text = payload.text;
      const cur = contentRef.current ?? "";
      const needle = text.trim().slice(0, 80);
      if (needle && cur.includes(needle)) {
        if (!window.confirm("检测到正文中可能已存在相同片段，仍要追加到章末吗？")) return;
      }
      const tryAppend = (n: number) => {
        if (n <= 0) return;
        if (editorRef.current) {
          editorRef.current.appendTextToEnd(text);
          setLiuguangReturnVisible(true);
          return;
        }
        window.setTimeout(() => tryAppend(n - 1), 60);
      };
      tryAppend(12);
      return;
    }

    // mergeAiDraft: 写入 AiPanel 草稿（在右侧栏可编辑后再插入）
    const draftText = payload.text;
    queueMicrotask(() => {
      setRightRailOpen(true);
      setRightRailActiveTab("ai");
    });
    const tryDraft = (n: number) => {
      if (n <= 0) return;
      if (activeChapter && workId) {
        // AiPanel 自己从 sessionStorage 读；这里直接走它的草稿 key 约定
        const key = aiPanelDraftStorageKey(workId, activeChapter.id);
        try {
          const prev = sessionStorage.getItem(key) ?? "";
          const needle = draftText.trim().slice(0, 80);
          if (needle && prev.includes(needle)) {
            if (!window.confirm("检测到 AI 侧栏草稿里可能已存在相同片段，仍要合并写入吗？")) return;
          }
          const merged = prev.trim().length ? `${prev.trim()}\n\n${draftText.trim()}\n` : `${draftText.trim()}\n`;
          sessionStorage.setItem(key, merged);
        } catch {
          /* ignore */
        }
        setLiuguangReturnVisible(true);
        return;
      }
      window.setTimeout(() => tryDraft(n - 1), 60);
    };
    tryDraft(12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, activeId, activeChapter]);

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
        setBookSearchHits(null);
        setSnapshotOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // P1-E：编辑器快捷键补全 — 用 ref 持有最新 handleNewChapter 避免 effect 闭包过期
  const handleNewChapterRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!snapshotOpen || !activeId) return;
    void listChapterSnapshots(activeId).then(setSnapshotList);
  }, [snapshotOpen, activeId]);

  // P1-F：章节切换时加载对应笔记
  useEffect(() => {
    if (!activeId) { setChapterNote(""); return; }
    setChapterNote(loadChapterNote(activeId));
  }, [activeId]);

  // P1-F：笔记 debounce 保存
  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => saveChapterNote(activeId, chapterNote), 500);
    return () => window.clearTimeout(t);
  }, [activeId, chapterNote]);

  useEffect(() => {
    if (!workId) return;
    void listAllReferenceExcerpts().then(setInspirationList);
  }, [workId]);

  useEffect(() => {
    if (!inspirationOpen || !workId) return;
    void listAllReferenceExcerpts().then(setInspirationList);
  }, [inspirationOpen, workId]);

  function insertExcerptIntoEditor(text: string) {
    const ins = text.endsWith("\n") ? text : text + "\n\n";
    if (!activeChapter) return;
    editorRef.current?.insertTextAtCursor(ins);
  }

  function getSelectedText() {
    return editorRef.current?.getSelectedText() ?? "";
  }

  function replaceSelection(text: string) {
    editorRef.current?.replaceSelection(text);
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
    editorRef.current?.insertTextAtCursor(t);
  }

  useEffect(() => {
    if (!workId || !activeId) return;
    const t = window.setTimeout(() => {
      writeDraftDebounced(workId, activeId, content);
    }, 450);
    return () => window.clearTimeout(t);
  }, [content, workId, activeId]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const id = activeIdRef.current;
      if (!id) return;
      const persisted = lastPersistedRef.current.get(id) ?? "";
      const cur = contentRef.current;
      if (cur !== persisted || persistInFlightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

  // Close "more" menu on outside click / ESC
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!moreOpen) return;
      const el = moreWrapRef.current;
      if (!el) return;
      const t = e.target as Node | null;
      if (t && el.contains(t)) return;
      setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (!moreOpen) return;
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const resolveSaveConflict = useCallback(async () => {
    if (!workId || !activeId) return;
    setSaveState("saving");
    try {
      const list = await listChapters(workId);
      setChapters(list);
      const c = list.find((x) => x.id === activeId);
      if (c) {
        setContent(c.content);
        lastPersistedRef.current.set(c.id, c.content);
        clearDraft(workId, c.id);
      }
      setSaveState("saved");
      setBgSaveIssue((cur) => (cur?.chapterId === activeId ? null : cur));
    } catch {
      setSaveState("error");
    }
  }, [workId, activeId]);

  const enqueueChapterPersist = useCallback((task: () => Promise<void>) => {
    const p = persistQueueRef.current.then(task);
    persistQueueRef.current = p.catch(() => {});
    return p;
  }, []);

  const runPersistChapter = useCallback(
    async (chapterId: string, text: string, mode: "active" | "silent"): Promise<boolean> => {
      if (!workId) return false;
      persistInFlightRef.current = true;
      const showUi = mode === "active";
      if (showUi) setSaveState("saving");
      let ok = false;
      try {
        const prev = lastPersistedRef.current.get(chapterId) ?? "";
        addDailyWordsFromDelta(prev, text);
        const expected = chapterServerUpdatedAtRef.current.get(chapterId);
        await updateChapter(
          chapterId,
          { content: text },
          expected !== undefined ? { expectedUpdatedAt: expected } : undefined,
        );
        lastPersistedRef.current.set(chapterId, text);
        clearDraft(workId, chapterId);
        const t = Date.now();
        chapterServerUpdatedAtRef.current.set(chapterId, t);
        setChapters((prevCh) =>
          prevCh.map((c) =>
            c.id === chapterId ? { ...c, content: text, updatedAt: t, wordCountCache: wordCount(text) } : c,
          ),
        );
        const chapterTitle = chapterTitleRef.current.get(chapterId) ?? "未命名章节";
        const chapterOrder = chapterOrderRef.current.get(chapterId) ?? 0;
        const workTitle = workTitleRef.current.trim();
        if (workTitle) {
          autoSummaryQueueRef.current?.enqueue({
            workId,
            workTitle,
            chapterId,
            chapterTitle,
            chapterOrder,
            chapterContent: text,
            expectedUpdatedAt: t,
          });
        }
        if (showUi) {
          setSaveState("saved");
        }
        setBgSaveIssue((cur) => (cur?.chapterId === chapterId ? null : cur));
        ok = true;
      } catch (e) {
        if (showUi) {
          if (isChapterSaveConflictError(e)) setSaveState("conflict");
          else setSaveState("error");
        } else {
          const title = chapterTitleRef.current.get(chapterId) ?? "未命名章节";
          setBgSaveIssue({
            chapterId,
            title,
            kind: isChapterSaveConflictError(e) ? "conflict" : "error",
          });
        }
      } finally {
        persistInFlightRef.current = false;
      }
      return ok;
    },
    [workId],
  );

  const persistContent = useCallback(
    async (chapterId: string, text: string) => {
      return enqueueChapterPersist(() => runPersistChapter(chapterId, text, "active"));
    },
    [enqueueChapterPersist, runPersistChapter],
  );

  const switchChapter = useCallback(
    async (nextId: string) => {
      if (activeId && activeId !== nextId) {
        const leaveId = activeId;
        const leaveText = content;
        const wid = workId;
        const bible = { ...cbStateRef.current };
        const ch = chapters.find((c) => c.id === nextId);
        const nextBody = ch?.content ?? "";
        setChapters((prev) =>
          prev.map((c) =>
            c.id === leaveId ? { ...c, content: leaveText, wordCountCache: wordCount(leaveText) } : c,
          ),
        );
        setActiveId(nextId);
        setContent(nextBody);
        lastPersistedRef.current.set(nextId, nextBody);
        const titleForErr = chapterTitleRef.current.get(leaveId) ?? "未命名章节";
        void enqueueChapterPersist(async () => {
          const ok = await runPersistChapter(leaveId, leaveText, "silent");
          if (!ok) return;
          try {
            await addChapterSnapshot(leaveId, leaveText);
          } catch {
            setBgSaveIssue({ chapterId: leaveId, title: titleForErr, kind: "error" });
            return;
          }
          if (wid) {
            try {
              await upsertChapterBible({
                chapterId: leaveId,
                workId: wid,
                goalText: bible.goal,
                forbidText: bible.forbid,
                povText: bible.pov,
                sceneStance: bible.scene,
                characterStateText: bible.characterState,
              });
            } catch {
              setBgSaveIssue({ chapterId: leaveId, title: titleForErr, kind: "error" });
            }
          }
        });
        return;
      }
      const chNext = chapters.find((c) => c.id === nextId);
      setActiveId(nextId);
      const nextBodyOnly = chNext?.content ?? "";
      setContent(nextBodyOnly);
      lastPersistedRef.current.set(nextId, nextBodyOnly);
    },
    [activeId, chapters, content, enqueueChapterPersist, runPersistChapter, workId],
  );
  switchChapterRef.current = switchChapter;

  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => {
      void persistContent(activeId, content);
    }, 700);
    return () => window.clearTimeout(t);
  }, [content, activeId, persistContent]);

  const handleManualSnapshot = useCallback(async () => {
    if (!activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    if (snapshotOpen) void listChapterSnapshots(activeId).then(setSnapshotList);
  }, [activeId, content, persistContent, snapshotOpen]);

  // 须在 handleManualSnapshot 之后：避免 TDZ（依赖数组在声明前求值）
  useEffect(() => {
    function onEditorHotkey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      if (ctrl && shift && e.key === "N") {
        e.preventDefault();
        void handleNewChapterRef.current();
        return;
      }
      if (isEditable) return;

      if (ctrl && shift && e.key === "[") {
        e.preventDefault();
        toggleChapterList();
        return;
      }
      if (ctrl && shift && e.key === "]") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (alt && e.key === "s") {
        e.preventDefault();
        void handleManualSnapshot();
        return;
      }
      if (alt && e.key === "1") {
        e.preventDefault();
        toggleRightRailTab("ai");
        return;
      }
      if (alt && e.key === "2") {
        e.preventDefault();
        toggleRightRailTab("summary");
        return;
      }
      if (alt && e.key === "3") {
        e.preventDefault();
        toggleRightRailTab("bible");
        return;
      }
      if (alt && e.key === "4") {
        e.preventDefault();
        toggleRightRailTab("ref");
        return;
      }
    }
    window.addEventListener("keydown", onEditorHotkey);
    return () => window.removeEventListener("keydown", onEditorHotkey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleManualSnapshot]);

  useEffect(() => {
    function onSaveShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleManualSnapshot();
      }
    }
    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, [handleManualSnapshot]);

  // Inject write tools into global topbar
  useEffect(() => {
    if (!work) {
      topbar.setTitleNode(null);
      return;
    }
    topbar.setTitleNode(
      <span className="editor-xy-work-title" title={work.title}>
        {work.title}
      </span>,
    );
    topbar.setCenterNode(
      <div className="editor-xy-center-stack">
        <div className="editor-xy-pills-scroller">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            onClick={() => void handleManualSnapshot()}
          >
            保存
          </Button>
          <Button
            type="button"
            variant={aiOpen ? "default" : "outline"}
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            onClick={() => {
              setAiOpen((v) => {
                const next = !v;
                setRightRailActiveTab("ai");
                setRightRailOpen(next);
                return next;
              });
            }}
          >
            AI写作
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            title="打开 AI 侧栏并以续写模式生成；结果在侧栏草稿框，确认后再插入正文"
            onClick={() => {
              setAiOpen(true);
              setRightRailActiveTab("ai");
              setRightRailOpen(true);
              setAiContinueRunTick((n) => n + 1);
            }}
          >
            AI续写
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!canAiDrawCard}
            title="打开 AI 侧栏并以抽卡模式生成"
            onClick={() => {
              setAiOpen(true);
              setRightRailActiveTab("ai");
              setRightRailOpen(true);
              setAiDrawRunTick((n) => n + 1);
            }}
          >
            抽卡
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            title="章节概要"
            onClick={() => {
              if (!activeChapter) return;
              setSummaryOpen(true);
            }}
          >
            章纲
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="editor-xy-pill"
                disabled={!activeChapter}
                title="书斋：整书人物 / 词条资产库"
              >
                书斋
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              <DropdownMenuItem
                disabled={!activeChapter}
                onClick={() => {
                  if (!activeChapter) return;
                  setStudyLibraryTab("characters");
                  setStudyLibraryOpen(true);
                }}
              >
                人物库
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!activeChapter}
                onClick={() => {
                  if (!activeChapter) return;
                  setStudyLibraryTab("terms");
                  setStudyLibraryOpen(true);
                }}
              >
                词条库
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={workId ? `/work/${workId}/bible` : "#"} onClick={(e) => !workId && e.preventDefault()}>
                  打开锦囊页
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            onClick={() => setEditorAutoWidth((v) => !v)}
          >
            {editorAutoWidth ? "宽度：自适应" : "宽度：自定义"}
          </Button>
        </div>
        {saveState === "saving" || saveState === "error" || saveState === "conflict" || bgSaveIssue ? (
          <div className="editor-xy-stats-line">
            {saveState === "saving" || saveState === "error" || saveState === "conflict" ? (
              <span className={`save-pill save-${saveState}`} title="保存状态">
                {saveState === "saving" && "保存中"}
                {saveState === "error" && "保存失败"}
                {saveState === "conflict" && (
                  <>
                    保存冲突
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="save-conflict-reload"
                      onClick={() => void resolveSaveConflict()}
                    >
                      重新载入本章
                    </Button>
                  </>
                )}
              </span>
            ) : null}
            {bgSaveIssue ? (
              <span className="editor-xy-bg-save-issue" title="离开该章时后台写入未成功；可打开该章后重试同步">
                「{bgSaveIssue.title}」{bgSaveIssue.kind === "conflict" ? "离章保存冲突" : "离章保存失败"}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="editor-xy-bg-save-issue__btn"
                  onClick={() => void switchChapter(bgSaveIssue.chapterId)}
                >
                  打开该章
                </Button>
                <button type="button" className="editor-xy-bg-save-issue__dismiss" onClick={() => setBgSaveIssue(null)}>
                  忽略
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>,
    );
    topbar.setActionsNode(null);
    return () => {
      topbar.setTitleNode(null);
      topbar.setCenterNode(null);
      topbar.setActionsNode(null);
    };
  }, [
    topbar,
    work,
    workId,
    saveState,
    activeChapter,
    aiOpen,
    canAiDrawCard,
    editorAutoWidth,
    rightRail.open,
    rightRail.activeTab,
    setRightRailActiveTab,
    setRightRailOpen,
    resolveSaveConflict,
    handleManualSnapshot,
    bgSaveIssue,
    switchChapter,
  ]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!widthDragRef.current) return;
      const dx = e.clientX - widthDragRef.current.startX;
      const next = Math.max(720, Math.min(EDITOR_AUTO_MAX_CAP_PX, Math.floor(widthDragRef.current.startW + dx)));
      setEditorMaxWidthPx(next);
    }
    function onUp() {
      if (!widthDragRef.current) return;
      widthDragRef.current = null;
      try {
        localStorage.setItem(EDITOR_WIDTH_KEY, String(editorMaxWidthPx));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editorMaxWidthPx]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!sidebarDragRef.current) return;
      const dx = e.clientX - sidebarDragRef.current.startX;
      const next = Math.max(160, Math.min(480, Math.floor(sidebarDragRef.current.startW + dx)));
      setSidebarWidthPx(next);
    }
    function onUp() {
      if (!sidebarDragRef.current) return;
      sidebarDragRef.current = null;
      try {
        localStorage.setItem("liubai:sidebarWidthPx", String(sidebarWidthPx));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidthPx]);

  async function handleRestoreSnapshot(snap: ChapterSnapshot) {
    if (!activeChapter || snap.chapterId !== activeChapter.id) return;
    if (!window.confirm("用此历史版本覆盖当前正文？")) return;
    await persistContent(activeChapter.id, content);
    await addChapterSnapshot(activeChapter.id, content);
    setContent(snap.content);
    const wc = wordCount(snap.content);
    const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
    await updateChapter(
      activeChapter.id,
      { content: snap.content },
      exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
    );
    lastPersistedRef.current.set(activeChapter.id, snap.content);
    setChapters((prev) =>
      prev.map((c) =>
        c.id === activeChapter.id
          ? { ...c, content: snap.content, updatedAt: Date.now(), wordCountCache: wc }
          : c,
      ),
    );
    void listChapterSnapshots(activeChapter.id).then(setSnapshotList);
    setSnapshotOpen(false);
  }

  async function handleDeleteSnapshot(id: string) {
    await deleteChapterSnapshot(id);
    if (activeId) void listChapterSnapshots(activeId).then(setSnapshotList);
  }

  function handleFindNext() {
    if (findPositions.length === 0) return;
    const next = (findStep + 1) % findPositions.length;
    setFindStep(next);
    editorRef.current?.scrollToMatch(findQ, false, findPositions[next]);
  }

  function handleReplaceFirst() {
    if (!findQ) {
      toast.info("请先输入查找内容。");
      return;
    }
    if (findPositions.length === 0) {
      toast.info("未找到匹配内容。");
      return;
    }
    const pos = findPositions[findStep % findPositions.length];
    setContent((prev) => prev.slice(0, pos) + replaceQ + prev.slice(pos + findQ.length));
    setFindStep(0);
  }

  function handleReplaceAll() {
    if (!findQ) {
      toast.info("请先输入查找内容。");
      return;
    }
    const count = findPositions.length;
    if (count === 0) {
      toast.info("未找到匹配内容。");
      return;
    }
    if (!window.confirm(`将本章中全部「${findQ}」替换为「${replaceQ}」？`)) return;
    setContent((prev) => replaceAllLiteral(prev, findQ, replaceQ));
    setFindStep(0);
    toast.success(`已替换 ${count} 处`);
  }

  async function runBookSearch() {
    if (!workId) return;
    const q = bookSearchQ.trim();
    if (!q) {
      setBookSearchHits([]);
      return;
    }
    setBookSearchLoading(true);
    try {
      if (activeId) await persistContent(activeId, content);
      const hits = await searchWork(workId, q, bookSearchScope, bookSearchRegex);
      setBookSearchHits(hits);
    } finally {
      setBookSearchLoading(false);
    }
  }

  function openBookSearch() {
    setBookSearchQ(findQ);
    setBookSearchHits(null);
    setBookSearchOpen(true);
  }

  function closeBookSearch() {
    setBookSearchOpen(false);
    setBookSearchHits(null);
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

  async function jumpToSearchHit(hit: BookSearchHit) {
    // Store pending scroll before switching so the effect can apply it
    pendingScrollRef.current = {
      query: bookSearchQ.trim(),
      isRegex: bookSearchRegex,
      offset: hit.firstMatchOffset ?? 0,
    };
    if (hit.chapterId === activeId) {
      closeBookSearch();
      // Same chapter: apply immediately
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
    // Effect below will fire once content settles
  }

  async function handleNewChapter() {
    if (!workId) return;
    try {
      if (activeId) {
        // 不阻塞“新建”体验；离章保存放后台队列，失败用右上角提示处理即可
        void enqueueChapterPersist(() => runPersistChapter(activeId, content, "silent"));
      }
      setChapterListMutating(true);
      let vid = activeChapter?.volumeId ?? volumes[0]?.id;
      if (!vid) {
        const v = await createVolume(workId, "第一卷");
        vid = v.id;
        setVolumes((prev) => [...prev, v].sort((a, b) => a.order - b.order));
      }
      const ch = await createChapter(workId, undefined, vid);
      chapterServerUpdatedAtRef.current.set(ch.id, ch.updatedAt);
      chapterTitleRef.current.set(ch.id, ch.title);
      chapterOrderRef.current.set(ch.id, ch.order);
      setChapters((prev) => [...prev, ch].sort((a, b) => a.order - b.order));
      setActiveId(ch.id);
      setContent("");
      lastPersistedRef.current.set(ch.id, "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建新章失败");
    } finally {
      setChapterListMutating(false);
    }
  }
  // 保持 ref 同步，确保快捷键 effect 拿到最新闭包
  handleNewChapterRef.current = handleNewChapter;

  async function handleNewVolume() {
    if (!workId) return;
    const t = window.prompt("新卷标题", "新卷");
    if (t === null) return;
    try {
      setChapterListMutating(true);
      const v = await createVolume(workId, t.trim() || "新卷");
      setVolumes((prev) => [...prev, v].sort((a, b) => a.order - b.order));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新建卷失败");
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleRenameVolume(volId: string) {
    const vol = volumes.find((v) => v.id === volId);
    const t = window.prompt("卷名", vol?.title ?? "");
    if (t === null) return;
    if (!vol) return;
    const nextTitle = t.trim() || vol.title;
    if (nextTitle === vol.title) return;
    const prevVolumes = volumes;
    try {
      setChapterListMutating(true);
      setVolumes((prev) => prev.map((v) => (v.id === volId ? { ...v, title: nextTitle } : v)));
      await updateVolume(volId, { title: nextTitle });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名卷失败");
      setVolumes(prevVolumes);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleDeleteVolumeUi(volId: string) {
    try {
      setChapterListMutating(true);
      await deleteVolume(volId);
      setVolumes((prev) => prev.filter((v) => v.id !== volId).sort((a, b) => a.order - b.order));
      // 章节归属已由存储层迁移到其它卷；这里不强行全量刷新，避免全屏 loading
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "无法删除该卷");
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleMoveChapterToVolume(chapterId: string) {
    if (volumes.length < 2) return;
    const lines = volumes.map((v, i) => `${i + 1}. ${v.title}`).join("\n");
    const n = window.prompt(`移到哪一卷？\n${lines}`, "1");
    if (n === null) return;
    const idx = Number.parseInt(n, 10) - 1;
    if (idx < 0 || idx >= volumes.length) return;
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const nextVid = volumes[idx].id;
    if (ch.volumeId === nextVid) return;
    const prevChapters = chapters;
    try {
      setChapterListMutating(true);
      // 本地先改卷归属（不全量 load）
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, volumeId: nextVid } : c)));
      const exp = chapterServerUpdatedAtRef.current.get(chapterId) ?? ch.updatedAt;
      const tNow = Date.now();
      await updateChapter(
        chapterId,
        { volumeId: nextVid },
        exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
      );
      chapterServerUpdatedAtRef.current.set(chapterId, tNow);
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, updatedAt: tNow } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动章节失败");
      setChapters(prevChapters);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleAttachOrphansToFirstVolume() {
    if (!workId || volumes.length === 0 || orphanChapters.length === 0) return;
    const firstVol = volumes[0]!;
    const ok = window.confirm(
      `将 ${orphanChapters.length} 个未匹配到当前卷的章节并入「${firstVol.title}」？`,
    );
    if (!ok) return;
    for (const c of orphanChapters) {
      const exp = c.updatedAt;
      await updateChapter(
        c.id,
        { volumeId: firstVol.id },
        exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
      );
    }
    await load();
  }

  async function handleDropChapter(targetId: string) {
    if (!workId || !dragChapterId || dragChapterId === targetId) {
      setDragChapterId(null);
      return;
    }
    const prev = chapters;
    const from = chapters.findIndex((c) => c.id === dragChapterId);
    const to = chapters.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) {
      setDragChapterId(null);
      return;
    }
    const ids = chapters.map((c) => c.id);
    const [removed] = ids.splice(from, 1);
    ids.splice(to, 0, removed);
    try {
      setChapterListMutating(true);
      // 本地先重排（不全量 load）
      const byId = new Map(prev.map((c) => [c.id, c] as const));
      const next = ids
        .map((id, i) => {
          const c = byId.get(id);
          return c ? { ...c, order: i } : null;
        })
        .filter(Boolean) as typeof prev;
      setChapters(next);
      for (const c of next) chapterOrderRef.current.set(c.id, c.order);
      setDragChapterId(null);
      await reorderChapters(workId, ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节排序失败");
      setChapters(prev);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleRename(id: string) {
    const ch = chapters.find((c) => c.id === id);
    const t = window.prompt("章节标题", ch?.title ?? "");
    if (t === null) return;
    if (!ch) return;
    const nextTitle = t.trim() || ch.title;
    if (nextTitle === ch.title) return;
    const prevChapters = chapters;
    try {
      setChapterListMutating(true);
      // 本地先改标题（不全量 load）
      setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)));
      chapterTitleRef.current.set(id, nextTitle);
      const exp = chapterServerUpdatedAtRef.current.get(id) ?? ch.updatedAt;
      const tNow = Date.now();
      await updateChapter(id, { title: nextTitle }, exp !== undefined ? { expectedUpdatedAt: exp } : undefined);
      chapterServerUpdatedAtRef.current.set(id, tNow);
      setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, updatedAt: tNow } : c)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
      setChapters(prevChapters);
      chapterTitleRef.current.set(id, ch.title);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function handleDeleteChapter(id: string) {
    if (!window.confirm("删除本章？（可先从设置导出备份）")) return;
    if (!workId) return;
    const prevChapters = chapters;
    const wasActive = activeId === id;
    try {
      setChapterListMutating(true);
      // 先本地移除，避免“全屏加载中…”
      const nextList = prevChapters.filter((c) => c.id !== id).sort((a, b) => a.order - b.order);
      setChapters(nextList);
      if (wasActive) {
        const delIdx = prevChapters.sort((a, b) => a.order - b.order).findIndex((c) => c.id === id);
        const pick = nextList[Math.min(Math.max(delIdx, 0), Math.max(0, nextList.length - 1))] ?? nextList[nextList.length - 1] ?? null;
        setActiveId(pick?.id ?? null);
        setContent(pick?.content ?? "");
        if (pick) lastPersistedRef.current.set(pick.id, pick.content);
      }
      await deleteChapter(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除章节失败");
      // 回滚到删除前状态
      setChapters(prevChapters);
      if (wasActive) {
        const back = prevChapters.find((c) => c.id === id) ?? prevChapters[0] ?? null;
        setActiveId(back?.id ?? null);
        setContent(back?.content ?? "");
        if (back) lastPersistedRef.current.set(back.id, back.content);
      }
    } finally {
      setChapterListMutating(false);
    }
  }

  async function moveChapter(id: string, dir: -1 | 1) {
    if (!workId) return;
    const idx = chapters.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= chapters.length) return;
    const prev = chapters;
    const ids = chapters.map((c) => c.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t;
    try {
      setChapterListMutating(true);
      const byId = new Map(prev.map((c) => [c.id, c] as const));
      const next = ids
        .map((cid, i) => {
          const c = byId.get(cid);
          return c ? { ...c, order: i } : null;
        })
        .filter(Boolean) as typeof prev;
      setChapters(next);
      for (const c of next) chapterOrderRef.current.set(c.id, c.order);
      await reorderChapters(workId, ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "章节排序失败");
      setChapters(prev);
    } finally {
      setChapterListMutating(false);
    }
  }

  async function setProgressChapter(id: string) {
    if (!workId) return;
    await updateWork(workId, { progressCursor: id });
    const w = await getWork(workId);
    if (w) setWork(w);
  }

  async function exportChapterTxt() {
    if (!activeChapter || !activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    const blob = buildChapterTxt(activeChapter.title, content, readLineEndingMode());
    downloadBlob(blob, `${safeFilename(activeChapter.title)}.txt`);
  }

  async function exportBookTxt() {
    if (!work || !workId || !activeId) return;
    // 先让用户配置导出选项
    const minO = chapters.length ? Math.min(...chapters.map((c) => c.order)) : 0;
    const maxO = chapters.length ? Math.max(...chapters.map((c) => c.order)) : 0;
    setExportFromOrder(minO);
    setExportToOrder(maxO);
    setExportFormat("txt");
    setExportDialogOpen(true);
  }

  async function doExportBookTxt(opts: ExportBookOptions) {
    if (!work || !workId || !activeId) return;
    await persistContent(activeId, content);
    const list = await listChapters(workId);
    for (const c of list) await addChapterSnapshot(c.id, c.content);
    const merged = list.map((c) => ({ title: c.title, content: c.content, order: c.order }));
    const blob = buildBookTxt(work.title, merged, readLineEndingMode(), opts);
    downloadBlob(blob, `${safeFilename(work.title)}.txt`);
  }

  async function exportChapterDocx() {
    if (!activeChapter || !activeId) return;
    try {
      await persistContent(activeId, content);
      await addChapterSnapshot(activeId, content);
      const blob = await buildChapterDocx(activeChapter.title, content);
      downloadBlob(blob, `${safeFilename(activeChapter.title)}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  async function exportBookDocx() {
    if (!work || !workId || !activeId) return;
    const minO = chapters.length ? Math.min(...chapters.map((c) => c.order)) : 0;
    const maxO = chapters.length ? Math.max(...chapters.map((c) => c.order)) : 0;
    setExportFromOrder(minO);
    setExportToOrder(maxO);
    setExportFormat("docx");
    setExportDialogOpen(true);
  }

  async function doExportBookDocx(opts: ExportBookOptions) {
    if (!work || !workId || !activeId) return;
    try {
      await persistContent(activeId, content);
      const list = await listChapters(workId);
      for (const c of list) await addChapterSnapshot(c.id, c.content);
      const merged = list.map((c) => ({ title: c.title, content: c.content, order: c.order }));
      const blob = await buildBookDocx(work.title, merged, opts);
      downloadBlob(blob, `${safeFilename(work.title)}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  /** P0-A：章内所有匹配位置（字面量），findQ 为空时为空数组 */
  const findPositions = useMemo<number[]>(() => {
    if (!findQ) return [];
    const positions: number[] = [];
    let i = 0;
    while (i <= content.length - findQ.length) {
      const idx = content.indexOf(findQ, i);
      if (idx < 0) break;
      positions.push(idx);
      i = idx + findQ.length;
    }
    return positions;
  }, [content, findQ]);

  /** findQ 变化时重置步进到第一个匹配 */
  useEffect(() => {
    setFindStep(0);
  }, [findQ]);

  function openSummaryForChapter(chapterId: string) {
    if (activeId === chapterId) setSummaryOpen(true);
    else void switchChapter(chapterId).then(() => setSummaryOpen(true));
  }

  function renderChapterSidebarItem(c: Chapter) {
    const i = chapters.findIndex((x) => x.id === c.id);
    const wc = c.wordCountCache ?? wordCount(c.content);
    const isCurrent = c.id === activeId;
    return (
      <li
        key={c.id}
        className={cn("chapter-card", isCurrent ? "chapter-card--expanded active" : "chapter-card--compact")}
        draggable
        onDragStart={() => setDragChapterId(c.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleDropChapter(c.id);
        }}
      >
        {isCurrent ? (
          <>
            <div className="chapter-card__head">
              <button type="button" className="chapter-card__title" onClick={() => void switchChapter(c.id)}>
                {c.title}
              </button>
              <button
                type="button"
                className={cn("chapter-card__bookmark", work?.progressCursor === c.id && "on")}
                title={work?.progressCursor === c.id ? "已标为写作进度" : "标为写作进度"}
                aria-pressed={work?.progressCursor === c.id}
                onClick={() => void setProgressChapter(c.id)}
              >
                🔖
              </button>
            </div>
            <div className="chapter-card__meta">
              <span>{wc.toLocaleString()} 字</span>
              <span className="chapter-card__date">
                更新{" "}
                {new Date(c.updatedAt).toLocaleString(undefined, {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="chapter-card__btns">
              <button type="button" className="chapter-card__btn chapter-card__btn--blue" onClick={() => openSummaryForChapter(c.id)}>
                概要
              </button>
              <button
                type="button"
                className="chapter-card__btn"
                onClick={() => setChapterConstraintsOpen(true)}
                title="可选：本章约束（不用可不填）"
              >
                约束
              </button>
              <button
                type="button"
                className="chapter-card__btn chapter-card__btn--red"
                onClick={() => void handleDeleteChapter(c.id)}
              >
                删除
              </button>
            </div>
            <div className="chapter-card__tools">
              <button type="button" title="上移" disabled={i === 0} onClick={() => void moveChapter(c.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                title="下移"
                disabled={i === chapters.length - 1}
                onClick={() => void moveChapter(c.id, 1)}
              >
                ↓
              </button>
              <button type="button" title="重命名" onClick={() => void handleRename(c.id)}>
                ✎
              </button>
              {volumes.length > 1 ? (
                <button type="button" title="移到其他卷" onClick={() => void handleMoveChapterToVolume(c.id)}>
                  卷
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="chapter-card__compact-row">
            <button type="button" className="chapter-card__title chapter-card__title--row" onClick={() => void switchChapter(c.id)}>
              {c.title}
              {hasChapterNote(c.id) && <span className="chapter-note-dot chapter-note-dot--inline" aria-label="有笔记" />}
            </button>
            <span className="chapter-card__wc">{wc.toLocaleString()} 字</span>
            <button
              type="button"
              className={cn("chapter-card__bookmark chapter-card__bookmark--compact", work?.progressCursor === c.id && "on")}
              title={work?.progressCursor === c.id ? "已标为写作进度" : "标为写作进度"}
              aria-pressed={work?.progressCursor === c.id}
              onClick={(e) => {
                e.stopPropagation();
                void setProgressChapter(c.id);
              }}
            >
              🔖
            </button>
          </div>
        )}
      </li>
    );
  }

  if (!workId) {
    return <p className="muted">无效地址</p>;
  }

  if (loading) {
    return (
      <div className="page editor-page flex min-h-[40vh] flex-col items-center justify-center px-4 py-16">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

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
      <Dialog open={chapterConstraintsOpen} onOpenChange={setChapterConstraintsOpen}>
        <DialogContent
          overlayClassName="work-form-modal-overlay"
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            "z-[var(--z-modal-app-content)] max-h-[min(92vh,920px)] w-full max-w-[min(720px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
          )}
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
            <DialogTitle className="text-left text-lg font-semibold">本章约束（可选）</DialogTitle>
            <button type="button" className="icon-btn" title="关闭" onClick={() => setChapterConstraintsOpen(false)}>
              ×
            </button>
          </DialogHeader>
          <div className="p-4 sm:p-5" style={{ overflow: "auto" }}>
            <p className="muted small" style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.55 }}>
              这块是“护栏/检查清单”，不想填就留空；你也可以直接把这些写进右侧「细纲/剧情」。
            </p>
            <div className="sidebar-chapter-bible" style={{ padding: 0, border: "none" }}>
              <label className="sidebar-bible-field">
                <span>本章目标</span>
                <textarea
                  value={chapterBibleFields.goalText}
                  onChange={(e) => setChapterBibleFields((p) => ({ ...p, goalText: e.target.value }))}
                  rows={2}
                  placeholder="这一章要达成什么（节拍/信息点/情绪目标）"
                />
              </label>
              <label className="sidebar-bible-field">
                <span>禁止出现</span>
                <textarea
                  value={chapterBibleFields.forbidText}
                  onChange={(e) => setChapterBibleFields((p) => ({ ...p, forbidText: e.target.value }))}
                  rows={2}
                  placeholder="明确不要写什么（禁词/禁设定/禁走向）"
                />
              </label>
              <label className="sidebar-bible-field">
                <span>视角 / 口吻</span>
                <textarea
                  value={chapterBibleFields.povText}
                  onChange={(e) => setChapterBibleFields((p) => ({ ...p, povText: e.target.value }))}
                  rows={2}
                  placeholder="第一/第三人称、叙述风格、语气"
                />
              </label>
              <label className="sidebar-bible-field">
                <span>场景状态</span>
                <textarea
                  value={chapterBibleFields.sceneStance}
                  onChange={(e) => setChapterBibleFields((p) => ({ ...p, sceneStance: e.target.value }))}
                  rows={2}
                  placeholder="地点/时间/天气/站位/持物/出口等"
                />
              </label>
              <label className="sidebar-bible-field">
                <span>本章人物状态</span>
                <textarea
                  value={chapterBibleFields.characterStateText}
                  onChange={(e) => setChapterBibleFields((p) => ({ ...p, characterStateText: e.target.value }))}
                  rows={3}
                  placeholder="人物伤势/情绪/关系变化/任务进度等（会注入 AI 上下文）"
                />
              </label>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {workId ? (
        <StudyLibraryDialog
          open={studyLibraryOpen}
          onOpenChange={setStudyLibraryOpen}
          workId={workId}
          tab={studyLibraryTab}
          onTabChange={setStudyLibraryTab}
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
        <aside
          className="chapter-sidebar chapter-sidebar--stack relative"
          aria-hidden={layoutSidebarCollapsed}
          onWheelCapture={(e) => {
            // Prevent wheel scrolling from chaining into the editor/body.
            e.stopPropagation();
          }}
        >
          {/* Resize Handle / Collapse Toggle */}
          <div 
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20 group z-10 flex items-center justify-center transition-colors -mr-1"
            onMouseDown={(e) => {
              e.preventDefault();
              sidebarDragRef.current = { startX: e.clientX, startW: sidebarWidthPx };
            }}
          >
            <div className="w-0.5 h-full bg-border/40 group-hover:bg-blue-500 transition-colors" />
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-8 flex items-center justify-center rounded-sm bg-background border border-border bg-card shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
              title="收起章节栏"
              onClick={(e) => {
                e.stopPropagation();
                toggleSidebar();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          </div>

          <div className="chapter-sidebar__header">
            <div className="sidebar-project-xy border-b border-border/40 pb-0 shrink-0">
              <div className="flex w-full px-2 pt-2 -mb-px">
                <button
                  type="button"
                  className={`flex-1 text-center pb-2 text-sm font-medium border-b-2 transition-colors ${sidebarTab === "outline" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setSidebarTab("outline")}
                >
                  章纲
                </button>
                <button
                  type="button"
                  className={`flex-1 text-center pb-2 text-sm font-medium border-b-2 transition-colors ${sidebarTab === "chapter" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setSidebarTab("chapter")}
                >
                  章节正文
                </button>
              </div>
            </div>
            {sidebarTab === "chapter" ? (
              <div className="sidebar-head sidebar-section-head mt-3 px-[2px]">
                <span>章节</span>
                <div className="sidebar-head-btns">
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    title={chapterListCollapsed ? "展开章节列表" : "折叠章节列表"}
                    onClick={toggleChapterList}
                  >
                    {chapterListCollapsed ? "▸" : "▾"}
                  </button>
                  <button
                    type="button"
                    className="sidebar-section-toggle"
                    title={chapterListSortDir === "asc" ? "切换为倒序（从尾到头）" : "切换为正序（从头到尾）"}
                    onClick={() => setChapterListSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  >
                    ⇅
                  </button>
                  <button type="button" className="btn small" onClick={() => void handleNewVolume()}>
                    + 卷
                  </button>
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={chapterListMutating}
                    onClick={() => void handleNewChapter()}
                  >
                    + 新章
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="chapter-sidebar__body">
          {sidebarTab === "outline" ? (
            <div className="p-3 text-sm text-foreground">
              {chapters.map(c => c.outlineDraft ? (
                <div key={c.id} className="mb-4">
                  <div className="font-medium text-foreground mb-1 sticky top-0 z-10 py-1 border-b border-border/20 chapter-sidebar__outline-sticky-title">{c.title}</div>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">{c.outlineDraft}</pre>
                </div>
              ) : null)}
              {chapters.filter(c => c.outlineDraft).length === 0 && (
                <p className="text-muted-foreground text-center py-6">暂无已推送的章纲。</p>
              )}
            </div>
          ) : (
            <>
          {work.progressCursor && (
            <p className="progress-hint small">
              进度截至：{chapters.find((c) => c.id === work.progressCursor)?.title ?? "（章节已删）"}
            </p>
          )}
          {!chapterListCollapsed ? (
            <>
              {useVirtualChapterList ? (
                /* P1-B：虚拟滚动（≥100章） */
                <div
                  ref={virtualListRef}
                  className="chapter-virtual-scroll"
                  style={{ overflowY: "auto", flex: 1 }}
                >
                  <ul
                    className="chapter-list"
                    style={{ height: virtualizer.getTotalSize(), position: "relative", margin: 0, padding: 0 }}
                  >
                    {virtualizer.getVirtualItems().map((vItem) => {
                      const item = flatChapterItems[vItem.index];
                      if (!item) return null;
                      return (
                        <li
                          key={vItem.key}
                          data-index={vItem.index}
                          ref={virtualizer.measureElement}
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vItem.start}px)` }}
                        >
                          {item.kind === "vol-head" && (
                            <div className="volume-row">
                              <span className="volume-title">{item.title}</span>
                              <div className="volume-actions">
                                <button type="button" title="重命名卷" onClick={() => void handleRenameVolume(item.volId)}>✎</button>
                                {item.canDelete && (
                                  <button type="button" title="删卷" onClick={() => void handleDeleteVolumeUi(item.volId)}>×</button>
                                )}
                              </div>
                            </div>
                          )}
                          {(item.kind === "chapter" || item.kind === "orphan-chapter") && renderChapterSidebarItem(item.chapter)}
                          {item.kind === "orphan-head" && (
                            <div className="volume-row">
                              <span className="volume-title">未匹配章节 · {item.count}</span>
                              {volumes.length > 0 && (
                                <button type="button" className="btn small primary" onClick={() => void handleAttachOrphansToFirstVolume()}>并入首卷</button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                /* 正常渲染（<100章） */
                <>
                  {volumes.map((vol) => (
                    <div key={vol.id} className="volume-block">
                      <div className="volume-row">
                        <span className="volume-title">{vol.title}</span>
                        <div className="volume-actions">
                          <button type="button" title="重命名卷" onClick={() => void handleRenameVolume(vol.id)}>✎</button>
                          {volumes.length > 1 ? (
                            <button type="button" title="删卷（章并入其他卷）" onClick={() => void handleDeleteVolumeUi(vol.id)}>×</button>
                          ) : null}
                        </div>
                      </div>
                      <ul className="chapter-list">
                        {chapters
                          .filter((c) => c.volumeId === vol.id)
                          .sort(chapterOrderCmp)
                          .map((c) => renderChapterSidebarItem(c))}
                      </ul>
                    </div>
                  ))}
                  {orphanChapters.length > 0 ? (
                    <div className="volume-block volume-block--orphans">
                      <div className="volume-row">
                        <span className="volume-title">未匹配到当前卷的章节 · {orphanChapters.length}</span>
                        <div className="volume-actions">
                          {volumes.length > 0 ? (
                            <button type="button" className="btn small primary" title={`并入「${volumes[0]?.title ?? "第一卷"}」`} onClick={() => void handleAttachOrphansToFirstVolume()}>
                              并入首卷
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="muted small" style={{ margin: "0 0 0.4rem" }}>
                        常见于合并备份、导入或删卷后遗留；点「并入首卷」或单章「卷」按钮即可修复。
                      </p>
                      <ul className="chapter-list">{[...orphanChapters].sort(chapterOrderCmp).map((c) => renderChapterSidebarItem(c))}</ul>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <p className="muted small" style={{ margin: "0.25rem 0 0.5rem" }}>
              章节列表已折叠。
            </p>
          )}
          {chapters.length === 0 && (
            <p className="muted small">暂无章节，点「新章」。</p>
          )}
          {glossaryHits.length > 0 && (
            <div className="sidebar-glossary-hits">
              <div className="sidebar-glossary-hits-title">术语命中</div>
              <ul className="sidebar-glossary-hits-list">
                {glossaryHits.map((t) => (
                  <li key={t.id}>
                    <span className="sidebar-glossary-term">{t.term}</span>
                    <span className="muted small">
                      {t.category === "dead" ? "已死" : t.category === "name" ? "人名" : "术语"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {linkedExcerptsForChapter.length > 0 && (
            <div className="sidebar-linked-ref">
              <div className="sidebar-linked-ref-title">本章关联参考</div>
              <ul className="sidebar-linked-ref-list">
                {linkedExcerptsForChapter.map((ex) => (
                  <li key={ex.id}>
                    <Link className="sidebar-linked-ref-link" to={referenceReaderHref(ex)}>
                      {ex.refTitle}
                    </Link>
                    <span className="muted small sidebar-linked-ref-preview">
                      {ex.text.length > 36 ? `${ex.text.slice(0, 36)}…` : ex.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="sidebar-inspiration">
            <button
              type="button"
              className="sidebar-inspiration-toggle"
              onClick={() => setInspirationOpen((o) => !o)}
              aria-expanded={inspirationOpen}
            >
              灵感便签（参考摘录）{inspirationOpen ? "▼" : "▶"}
            </button>
            {inspirationOpen ? (
              inspirationList.length === 0 ? (
                <p className="muted small sidebar-inspiration-empty">
                  暂无摘录。在「参考库」阅读器中划选保存后，可在此插入正文。
                </p>
              ) : (
                <ul className="sidebar-inspiration-list">
                  {inspirationList.map((ex) => (
                    <li key={ex.id} className="sidebar-inspiration-item">
                      <div className="sidebar-inspiration-meta muted small">
                        {ex.refTitle}
                        {ex.tagIds.length > 0 ? ` · 标签 ${ex.tagIds.length}` : ""}
                      </div>
                      <blockquote className="sidebar-inspiration-quote">{ex.text}</blockquote>
                      {ex.note ? <p className="small muted">{ex.note}</p> : null}
                      <div className="sidebar-inspiration-actions">
                        <Link className="btn ghost small" to={referenceReaderHref(ex)}>
                          在参考库打开
                        </Link>
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={!activeChapter}
                          onClick={() => insertExcerptIntoEditor(ex.text)}
                        >
                          插入正文
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
          </>
          )}
          {/* P1-F：本章笔记区 */}
          {sidebarTab === "chapter" && activeChapter && (
            <div className="chapter-note-section">
              <button
                type="button"
                className="chapter-note-toggle"
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
              >
                {noteOpen ? "▾" : "▸"} 本章笔记
                {!noteOpen && hasChapterNote(activeChapter.id) && (
                  <span className="chapter-note-dot" aria-label="有笔记" />
                )}
              </button>
              {noteOpen && (
                <textarea
                  className="chapter-note-textarea"
                  value={chapterNote}
                  onChange={(e) => setChapterNote(e.target.value)}
                  placeholder="随手记录本章思路、待改处、伏笔…（自动保存）"
                  rows={5}
                  aria-label="本章笔记"
                />
              )}
            </div>
          )}
          </div>
        </aside>

        <main className="editor-main">
          {findOpen && (
            <div className="find-bar find-bar--extended">
              <label className="find-label">查找</label>
              <input
                type="search"
                placeholder="章内文字（Enter 跳下一处）"
                value={findQ}
                onChange={(e) => setFindQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFindNext(); } }}
                autoFocus
              />
              <label className="find-label">替换为</label>
              <input
                type="text"
                placeholder="可为空"
                value={replaceQ}
                onChange={(e) => setReplaceQ(e.target.value)}
              />
              {findQ ? (
                <span className="find-count">
                  {findPositions.length > 0
                    ? `${findStep + 1}/${findPositions.length}`
                    : "0"}{" "}处
                </span>
              ) : null}
              <button type="button" className="btn small" onClick={handleReplaceFirst}>
                替换当前
              </button>
              <button type="button" className="btn small" onClick={handleReplaceAll}>
                全部替换
              </button>
              <button type="button" className="find-close" onClick={() => setFindOpen(false)}>
                关闭
              </button>
            </div>
          )}
          <div className="editor-scroll">
            <div className="editor-scroll-inner">
            <div className="editor-xy-paper-stack" style={editorPaperFrameStyle}>
            <div className="editor-xy-inline-toolbar" aria-label="正文快捷工具">
              <div className="editor-xy-inline-toolbar__left">
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="撤销"
                  disabled={!activeChapter}
                  onClick={() => editorRef.current?.undo()}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="重做"
                  disabled={!activeChapter}
                  onClick={() => editorRef.current?.redo()}
                >
                  ↷
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="复制选区"
                  disabled={!activeChapter}
                  onClick={() => void copySelectionToClipboard()}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="在光标后重复插入选区"
                  disabled={!activeChapter}
                  onClick={() => duplicateSelectionAfterCaret()}
                >
                  ⎘
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="全选"
                  disabled={!activeChapter}
                  onClick={() => editorRef.current?.selectAll()}
                >
                  ▣
                </button>
                <button
                  type="button"
                  className={cn("icon-btn editor-xy-inline-icon", findOpen && "is-on")}
                  title="查找 / 替换"
                  disabled={!activeChapter}
                  onClick={() => setFindOpen((v) => !v)}
                >
                  ⌕
                </button>
                <button
                  type="button"
                  className={cn("icon-btn editor-xy-inline-icon", bookSearchOpen && "is-on")}
                  title="全书搜索"
                  disabled={!activeChapter}
                  onClick={() => (bookSearchOpen ? closeBookSearch() : openBookSearch())}
                >
                  ⌁
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="章节历史"
                  disabled={!activeChapter}
                  onClick={() => setSnapshotOpen(true)}
                >
                  ⧗
                </button>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="保存章节快照"
                  disabled={!activeChapter}
                  onClick={() => void handleManualSnapshot()}
                >
                  ⧈
                </button>
                <button
                  type="button"
                  className={cn(
                    "icon-btn editor-xy-inline-icon",
                    rightRail.open && rightRail.activeTab === "ref" && "is-on",
                  )}
                  title="参考"
                  disabled={!activeChapter}
                  onClick={() => toggleRightRailTab("ref")}
                >
                  ⌗
                </button>
                <HoverCard openDelay={90} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      className="icon-btn editor-xy-inline-icon editor-xy-inline-icon--materials"
                      title="本次生成 · 使用材料（简版）"
                      disabled={!activeChapter}
                      aria-label="本次生成材料简报"
                    >
                      ▼
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className={cn(
                      "w-[min(420px,calc(100vw-2rem))] max-h-[min(70vh,480px)] overflow-y-auto border-border/60 bg-[var(--surface)] p-3 text-left text-[0.8125rem] leading-snug text-muted-foreground shadow-lg",
                    )}
                  >
                    <p className="mb-2 mt-0 font-medium text-foreground">本次生成 · 使用材料（简版）</p>
                    {aiMaterialsBriefLines.length === 0 ? (
                      <p className="m-0 text-muted-foreground">等待右侧 AI 面板同步…</p>
                    ) : (
                      <ul className="m-0 list-disc space-y-1.5 pl-4 marker:text-muted-foreground">
                        {aiMaterialsBriefLines.map((line, i) => (
                          <li key={i} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </HoverCardContent>
                </HoverCard>
                <button
                  type="button"
                  className={cn(
                    "icon-btn editor-xy-inline-icon",
                    rightRail.open && rightRail.activeTab === "ai" && "is-on",
                  )}
                  title="AI 侧栏"
                  disabled={!activeChapter}
                  onClick={() => toggleRightRailTab("ai")}
                >
                  ✦
                </button>
              </div>
              <div className="editor-xy-inline-toolbar__right">
                <div className="toolbar-more-wrap" ref={moreWrapRef}>
                  <button
                    type="button"
                    className="icon-btn editor-xy-inline-icon"
                    title="更多"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((v) => !v)}
                  >
                    ···
                  </button>
                  {moreOpen ? (
                    <div className="toolbar-more-menu" role="menu">
                      <div className="toolbar-menu-label">纯文本</div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          exportChapterTxt();
                        }}
                      >
                        导出本章 .txt
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          void exportBookTxt();
                        }}
                      >
                        导出全书 .txt
                      </button>
                      <div className="toolbar-menu-label">Word</div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          void exportChapterDocx();
                        }}
                      >
                        导出本章 .docx
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          void exportBookDocx();
                        }}
                      >
                        导出全书 .docx
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              className="editor-paper card"
              role="region"
              aria-label="正文纸面"
              data-paper-tint={paperTint}
            >
              {activeChapter ? (
                <div className="editor-chapter-title" aria-label="当前章节标题">
                  {chapterTitleEditing ? (
                    <input
                      className="editor-chapter-title-text"
                      value={chapterTitleDraft}
                      autoFocus
                      onChange={(e) => setChapterTitleDraft(e.target.value)}
                      onBlur={() => void saveChapterTitle()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveChapterTitle();
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setChapterTitleDraft(activeChapter.title);
                          setChapterTitleEditing(false);
                        }
                      }}
                      aria-label="编辑章节标题"
                    />
                  ) : (
                    <button
                      type="button"
                      className="editor-chapter-title-text"
                      title="点击改标题"
                      onClick={() => {
                        setChapterTitleDraft(activeChapter.title);
                        setChapterTitleEditing(true);
                      }}
                      style={{ cursor: "text", background: "transparent", border: "none", padding: 0 }}
                    >
                      {activeChapter.title}
                    </button>
                  )}
                  {!editorAutoWidth ? (
                    <span className="editor-chapter-title-tools">
                      <button
                        type="button"
                        className="editor-width-reset"
                        title="恢复默认宽度（铺满中间栏）"
                        onClick={() => {
                          setEditorMaxWidthPx(EDITOR_DEFAULT_MAX_WIDTH_PX);
                          setEditorAutoWidth(true);
                          try {
                            localStorage.setItem(EDITOR_WIDTH_KEY, String(EDITOR_DEFAULT_MAX_WIDTH_PX));
                            localStorage.setItem(EDITOR_AUTO_WIDTH_KEY, "1");
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        默认
                      </button>
                      <span
                        className="editor-width-handle"
                        title="拖动调整正文宽度"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          widthDragRef.current = { startX: e.clientX, startW: editorMaxWidthPx };
                        }}
                      >
                        ↔
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {activeChapter ? (
                <CodeMirrorEditor
                  key={activeChapter.id}
                  ref={editorRef}
                  className="editor-textarea cm6-editor"
                  value={content}
                  onChange={setContent}
                  ariaLabel="正文编辑器"
                  placeholderText="请输入章节内容"
                />
              ) : (
                <div className="editor-xy-empty">
                  <div className="editor-xy-empty__card">
                    <p className="editor-xy-empty__title">请选择或新建章节</p>
                    <p className="editor-xy-empty__hint">在左侧目录中选一章，或使用下方按钮新建。</p>
                    <Button type="button" className="editor-xy-empty__cta" onClick={() => void handleNewChapter()}>
                      + 新建章节
                    </Button>
                  </div>
                </div>
              )}
              {activeChapter ? (
                <div className="editor-xy-wc-corner" title="本章字数">
                  {chapterWords.toLocaleString()}
                </div>
              ) : null}
            </div>
            </div>
            </div>
          </div>
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
            onSaveAndClose={() => {
              void (async () => {
                try {
                  const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
                  const t = Date.now();
                  await updateChapter(
                    activeChapter.id,
                    {
                      summary: summaryDraft,
                      summaryUpdatedAt: t,
                      summaryScopeFromOrder: activeChapter.summaryScopeFromOrder ?? activeChapter.order,
                      summaryScopeToOrder: activeChapter.summaryScopeToOrder ?? activeChapter.order,
                    },
                    exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
                  );
                  setChapters((prev) =>
                    prev.map((c) =>
                      c.id === activeChapter.id
                        ? {
                            ...c,
                            summary: summaryDraft,
                            summaryUpdatedAt: t,
                            summaryScopeFromOrder: c.summaryScopeFromOrder ?? c.order,
                            summaryScopeToOrder: c.summaryScopeToOrder ?? c.order,
                            updatedAt: t,
                          }
                        : c,
                    ),
                  );
                  setSummaryOpen(false);
                } catch (e) {
                  if (isChapterSaveConflictError(e)) {
                    toast.error("概要保存冲突：请关闭弹窗后「重新载入本章」再试。");
                  }
                }
              })();
            }}
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
            onSaveDraft={() => {
              void (async () => {
                try {
                  const exp = chapterServerUpdatedAtRef.current.get(activeChapter.id);
                  const t = Date.now();
                  await updateChapter(
                    activeChapter.id,
                    {
                      summary: summaryDraft,
                      summaryUpdatedAt: t,
                      summaryScopeFromOrder: activeChapter.summaryScopeFromOrder ?? activeChapter.order,
                      summaryScopeToOrder: activeChapter.summaryScopeToOrder ?? activeChapter.order,
                    },
                    exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
                  );
                  setChapters((prev) =>
                    prev.map((c) =>
                      c.id === activeChapter.id
                        ? {
                            ...c,
                            summary: summaryDraft,
                            summaryUpdatedAt: t,
                            summaryScopeFromOrder: c.summaryScopeFromOrder ?? c.order,
                            summaryScopeToOrder: c.summaryScopeToOrder ?? c.order,
                            updatedAt: t,
                          }
                        : c,
                    ),
                  );
                } catch (e) {
                  if (isChapterSaveConflictError(e)) {
                    toast.error("概要保存冲突：请关闭弹窗后「重新载入本章」再试。");
                  }
                }
              })();
            }}
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
            onChapterSummarySaved={async (chapterId, summary, summaryUpdatedAt, order) => {
              const exp = chapterServerUpdatedAtRef.current.get(chapterId);
              await updateChapter(
                chapterId,
                {
                  summary,
                  summaryUpdatedAt,
                  summaryScopeFromOrder: order,
                  summaryScopeToOrder: order,
                },
                exp !== undefined ? { expectedUpdatedAt: exp } : undefined,
              );
              setChapters((prev) =>
                prev.map((c) =>
                  c.id === chapterId
                    ? {
                        ...c,
                        summary,
                        summaryUpdatedAt,
                        summaryScopeFromOrder: order,
                        summaryScopeToOrder: order,
                        updatedAt: summaryUpdatedAt,
                      }
                    : c,
                ),
              );
              if (activeId === chapterId) {
                setSummaryDraft(summary);
              }
            }}
          />
        </>
      )}

      {bookSearchOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => closeBookSearch()}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="book-search-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="book-search-title">全书搜索</h3>
            <p className="small muted">点击结果可跳转并高亮定位。搜索前自动保存当前章。</p>
            <div className="modal-row modal-row--wrap book-search-scope">
              <label className="radio-label">
                <input
                  type="radio"
                  name="bookSearchScope"
                  checked={bookSearchScope === "full"}
                  onChange={() => setBookSearchScope("full")}
                />
                全书
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="bookSearchScope"
                  checked={bookSearchScope === "beforeProgress"}
                  onChange={() => setBookSearchScope("beforeProgress")}
                />
                仅进度前
              </label>
              <label className="radio-label" title="将搜索词作为正则表达式解析">
                <input
                  type="checkbox"
                  checked={bookSearchRegex}
                  onChange={(e) => {
                    setBookSearchRegex(e.target.checked);
                    setBookSearchHits(null);
                  }}
                />
                正则
              </label>
            </div>
            <div className="modal-row">
              <input
                type="search"
                className="modal-input"
                placeholder={bookSearchRegex ? "正则表达式，如 他[^，]*说" : "关键词"}
                value={bookSearchQ}
                onChange={(e) => { setBookSearchQ(e.target.value); setBookSearchHits(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runBookSearch();
                }}
              />
              <button type="button" className="btn primary small" onClick={() => void runBookSearch()}>
                搜索
              </button>
            </div>
            {bookSearchLoading ? (
              <p className="muted small">搜索中…</p>
            ) : bookSearchHits === null ? null : bookSearchHits.length === 0 && bookSearchQ.trim() ? (
              <p className="muted small">无匹配。</p>
            ) : (
              <ul className="book-search-list">
                {bookSearchHits.map((h) => (
                  <li key={h.chapterId}>
                    <button
                      type="button"
                      className="book-search-hit"
                      onClick={() => void jumpToSearchHit(h)}
                    >
                      <span className="book-search-hit-title">{h.chapterTitle}</span>
                      <span className="book-search-hit-meta">{h.matchCount} 处</span>
                      {(h.contexts ?? [h.preview]).map((ctx, i) => (
                        <span key={i} className="book-search-hit-preview">{ctx}</span>
                      ))}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-footer">
              <button type="button" className="btn ghost small" onClick={() => closeBookSearch()}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {snapshotOpen && activeChapter && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSnapshotOpen(false)}
        >
          <div
            className="modal-card modal-card--wide"
            role="dialog"
            aria-labelledby="snap-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="snap-title">章节历史 · {activeChapter.title}</h3>
            <p className="small muted">
              切换章节、手动保存（⌘S）、导出文件或备份 zip
              时会自动记录。每章最多 {SNAPSHOT_CAP_PER_CHAPTER}{" "}
              条；超过 {SNAPSHOT_MAX_AGE_MS / (24 * 60 * 60 * 1000)} 天的记录会自动删除，超出条数删最旧。
            </p>
            <div className="modal-footer modal-footer--start">
              <button type="button" className="btn primary small" onClick={() => void handleManualSnapshot()}>
                保存当前版本
              </button>
            </div>
            {snapshotList.length === 0 ? (
              <p className="muted small">暂无历史版本。</p>
            ) : (
              <ul className="snapshot-list">
                {snapshotList.map((s, idx) => (
                  <li key={s.id} className="snapshot-item">
                    <div className="snapshot-item-head">
                      <div className="snapshot-item-time-row">
                        <time dateTime={new Date(s.createdAt).toISOString()}>
                          {new Date(s.createdAt).toLocaleString()}
                        </time>
                        {idx === 0 && (
                          <span className="snapshot-badge-latest">最新</span>
                        )}
                        <span className="snapshot-wc">{wordCount(s.content).toLocaleString()} 字</span>
                      </div>
                      <div className="snapshot-item-actions">
                        <button type="button" className="btn small" onClick={() => void handleRestoreSnapshot(s)}>
                          恢复
                        </button>
                        <button
                          type="button"
                          className={"btn ghost small" + (diffSnapshotId === s.id ? " is-active" : "")}
                          onClick={() => setDiffSnapshotId((v) => (v === s.id ? null : s.id))}
                        >
                          {diffSnapshotId === s.id ? "收起对比" : "对比"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => void handleDeleteSnapshot(s.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <pre className="snapshot-preview">{s.content.slice(0, 120)}{s.content.length > 120 ? "…" : ""}</pre>
                    {diffSnapshotId === s.id && (() => {
                      const diffLines = collapseDiff(simpleDiffLines(s.content, content));
                      return (
                        <div className="snapshot-diff" aria-label="历史版本与当前版本对比">
                          <div className="snapshot-diff-legend">
                            <span className="snapshot-diff-legend-del">红 = 历史有、当前无</span>
                            <span className="snapshot-diff-legend-add">绿 = 历史无、当前有</span>
                          </div>
                          <pre className="snapshot-diff-body" aria-live="polite">
                            {diffLines.map((line, li) => (
                              <span
                                key={li}
                                className={
                                  line.kind === "del"
                                    ? "snapshot-diff-del"
                                    : line.kind === "add"
                                      ? "snapshot-diff-add"
                                      : line.text.startsWith("···")
                                        ? "snapshot-diff-fold"
                                        : "snapshot-diff-same"
                                }
                              >
                                {line.kind === "del" ? "- " : line.kind === "add" ? "+ " : "  "}
                                {line.text}
                                {"\n"}
                              </span>
                            ))}
                          </pre>
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-footer">
              <button type="button" className="btn ghost small" onClick={() => setSnapshotOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* P2-C/E：导出选项弹窗 */}
      {exportDialogOpen && work && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setExportDialogOpen(false)}
        >
          <div
            className="modal-card modal-card--wide"
            role="dialog"
            aria-labelledby="export-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="export-dialog-title">导出全书（{exportFormat.toUpperCase()}）</h3>

            <div className="export-dialog-section">
              <div className="export-dialog-label">导出范围</div>
              <div className="export-dialog-range-row">
                <label className="export-dialog-radio">
                  <input
                    type="radio"
                    checked={exportRangeMode === "all"}
                    onChange={() => setExportRangeMode("all")}
                  />
                  全书（{chapters.length} 章）
                </label>
                <label className="export-dialog-radio">
                  <input
                    type="radio"
                    checked={exportRangeMode === "range"}
                    onChange={() => setExportRangeMode("range")}
                  />
                  自定义章节范围
                </label>
              </div>
              {exportRangeMode === "range" && (
                <div className="export-dialog-range-inputs">
                  <label>
                    从 order
                    <input
                      type="number"
                      className="export-dialog-num"
                      value={exportFromOrder}
                      min={0}
                      onChange={(e) => setExportFromOrder(Number(e.target.value) || 0)}
                    />
                  </label>
                  <span>—</span>
                  <label>
                    到 order
                    <input
                      type="number"
                      className="export-dialog-num"
                      value={exportToOrder}
                      min={0}
                      onChange={(e) => setExportToOrder(Number(e.target.value) || 0)}
                    />
                  </label>
                  <span className="muted small">
                    （匹配 {chapters.filter((c) => c.order >= exportFromOrder && c.order <= exportToOrder).length} 章）
                  </span>
                </div>
              )}
            </div>

            <div className="export-dialog-section">
              <label className="export-dialog-label" htmlFor="export-foreword">
                前言（可空）
              </label>
              <textarea
                id="export-foreword"
                value={exportForeword}
                onChange={(e) => setExportForeword(e.target.value)}
                rows={4}
                placeholder="在书名后、正文前插入前言文字…"
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div className="export-dialog-section">
              <label className="export-dialog-label" htmlFor="export-afterword">
                后记（可空）
              </label>
              <textarea
                id="export-afterword"
                value={exportAfterword}
                onChange={(e) => setExportAfterword(e.target.value)}
                rows={4}
                placeholder="在正文后插入后记文字…"
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const opts: ExportBookOptions = {
                    foreword: exportForeword || undefined,
                    afterword: exportAfterword || undefined,
                    fromOrder: exportRangeMode === "range" ? exportFromOrder : undefined,
                    toOrder: exportRangeMode === "range" ? exportToOrder : undefined,
                  };
                  setExportDialogOpen(false);
                  if (exportFormat === "txt") void doExportBookTxt(opts);
                  else void doExportBookDocx(opts);
                }}
              >
                确认导出
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setExportDialogOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** P2-B：行级对比 diff（LCS 算法，上限 400 行） */
type DiffLine = { kind: "same" | "del" | "add"; text: string };

function simpleDiffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n").slice(0, 400);
  const b = newText.split("\n").slice(0, 400);
  const m = a.length;
  const n = b.length;
  // DP for LCS lengths
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrace
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ kind: "same", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ kind: "add", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ kind: "del", text: a[i - 1] });
      i--;
    }
  }
  return result;
}

/** P2-B：折叠连续 same 行，保留每段变更前后各 3 行上下文 */
function collapseDiff(lines: DiffLine[], ctx = 3): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "same") {
      out.push(lines[i++]);
    } else {
      // 找出这段 same 的长度
      let end = i;
      while (end < lines.length && lines[end].kind === "same") end++;
      const len = end - i;
      if (len <= ctx * 2) {
        // 短段全显
        for (let k = i; k < end; k++) out.push(lines[k]);
      } else {
        // 头 ctx 行
        for (let k = 0; k < ctx; k++) out.push(lines[i + k]);
        // 折叠提示
        out.push({ kind: "same", text: `\u00b7\u00b7\u00b7 折叠 ${len - ctx * 2} 行未变更内容 \u00b7\u00b7\u00b7` });
        // 尾 ctx 行
        for (let k = end - ctx; k < end; k++) out.push(lines[k]);
      }
      i = end;
    }
  }
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function safeFilename(s: string) {
  return s.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 80) || "export";
}
