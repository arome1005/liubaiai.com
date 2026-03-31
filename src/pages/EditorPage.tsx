import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  listBibleGlossaryTerms,
  listChapterSnapshots,
  listChapters,
  listVolumes,
  upsertWorkStyleCard,
  upsertChapterBible,
  reorderChapters,
  searchWork,
  updateChapter,
  updateVolume,
  updateWork,
} from "../db/repo";
import type {
  BibleGlossaryTerm,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterSnapshot,
  ReferenceExcerpt,
  Volume,
  Work,
} from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import { exportWorkAsMergedMarkdown } from "../storage/backup";
import {
  buildBookDocx,
  buildBookTxt,
  buildChapterDocx,
  buildChapterTxt,
} from "../storage/export-txt-docx";
import { addDailyWordsFromDelta, getDailyWordsToday } from "../util/dailyWords";
import { clearDraft, readDraft, writeDraftDebounced } from "../util/draftRecovery";
import { normalizeLineEndings, readLineEndingMode } from "../util/lineEnding";
import { replaceAllLiteral, replaceFirstLiteral } from "../util/text-replace";
import { wordCount } from "../util/wordCount";
import { referenceReaderHref } from "../util/readUtf8TextFile";
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from "../components/CodeMirrorEditor";
import { AiPanel } from "../components/AiPanel";
import { useRightRail } from "../components/RightRailContext";
import { BibleRightPanel, RefRightPanel, SummaryRightPanel } from "../components/RightRailPanels";
import { useTopbar } from "../components/TopbarContext";

const LAST_CHAPTER_KEY = "liubai:lastChapter:";
const SIDEBAR_KEY = "liubai:editorSidebarCollapsed";
const CHAPTER_LIST_KEY = "liubai:chapterListCollapsed";
const EDITOR_WIDTH_KEY = "liubai:editorMaxWidthPx";

export function EditorPage() {
  const { workId } = useParams<{ workId: string }>();
  const rightRail = useRightRail();
  const topbar = useTopbar();
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [findQ, setFindQ] = useState("");
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
  const [findOpen, setFindOpen] = useState(false);
  const [replaceQ, setReplaceQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);
  const [bookSearchOpen, setBookSearchOpen] = useState(false);
  const [bookSearchQ, setBookSearchQ] = useState("");
  const [bookSearchLoading, setBookSearchLoading] = useState(false);
  /** null 表示尚未执行过本次会话的搜索 */
  const [bookSearchHits, setBookSearchHits] = useState<BookSearchHit[] | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotList, setSnapshotList] = useState<ChapterSnapshot[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [bookSearchScope, setBookSearchScope] = useState<BookSearchScope>("full");
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [dailyTick, setDailyTick] = useState(0);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [inspirationList, setInspirationList] = useState<
    Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>
  >([]);
  const [cbGoal, setCbGoal] = useState("");
  const [cbForbid, setCbForbid] = useState("");
  const [cbPov, setCbPov] = useState("");
  const [cbScene, setCbScene] = useState("");
  const [stylePov, setStylePov] = useState("");
  const [styleTone, setStyleTone] = useState("");
  const [styleBanned, setStyleBanned] = useState("");
  const [styleAnchor, setStyleAnchor] = useState("");
  const [styleExtra, setStyleExtra] = useState("");
  const [glossaryTerms, setGlossaryTerms] = useState<BibleGlossaryTerm[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [editorMaxWidthPx, setEditorMaxWidthPx] = useState(() => {
    try {
      const n = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
      if (!Number.isFinite(n)) return 860;
      return Math.max(720, Math.min(1600, Math.floor(n)));
    } catch {
      return 860;
    }
  });
  const [editorAutoWidth, setEditorAutoWidth] = useState(() => {
    // When true: expand to available width
    return false;
  });
  const widthDragRef = useRef<null | { startX: number; startW: number }>(null);
  const cbStateRef = useRef({ goal: "", forbid: "", pov: "", scene: "" });
  const cbSkipSaveRef = useRef(true);
  const cbReadyForChapterRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<Map<string, string>>(new Map());
  const persistInFlightRef = useRef(false);
  const contentRef = useRef(content);
  const activeIdRef = useRef(activeId);
  const editorRef = useRef<CodeMirrorEditorHandle | null>(null);
  contentRef.current = content;
  activeIdRef.current = activeId;

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeId) ?? null,
    [chapters, activeId],
  );

  useEffect(() => {
    if (!summaryOpen || !activeChapter) return;
    setSummaryDraft(activeChapter.summary ?? "");
  }, [summaryOpen, activeChapter]);

  const chapterWords = useMemo(() => wordCount(content), [content]);
  const bookWords = useMemo(
    () =>
      chapters.reduce((s, c) => {
        if (c.id === activeId) return s + wordCount(content);
        return s + (c.wordCountCache ?? wordCount(c.content));
      }, 0),
    [chapters, activeId, content],
  );
  const dailyWordsDisplay = useMemo(() => {
    void dailyTick;
    return getDailyWordsToday();
  }, [dailyTick]);

  /** 3.6：摘录侧已关联当前章时，在侧栏展示入口 */
  const linkedExcerptsForChapter = useMemo(
    () =>
      activeId ? inspirationList.filter((ex) => ex.linkedChapterId === activeId) : [],
    [inspirationList, activeId],
  );

  // Mount AI panel into global right rail (AppShell)
  useEffect(() => {
    if (!workId || !work) return;
    rightRail.setTabEnabled("ai", true);
    rightRail.setTabContent(
      "ai",
      <AiPanel
        onClose={() => {
          setAiOpen(false);
          rightRail.setOpen(false);
        }}
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapters={chapters}
        chapterContent={content}
        chapterBible={{ goalText: cbGoal, forbidText: cbForbid, povText: cbPov, sceneStance: cbScene }}
        glossaryTerms={glossaryTerms}
        workStyle={{
          pov: stylePov,
          tone: styleTone,
          bannedPhrases: styleBanned,
          styleAnchor: styleAnchor,
          extraRules: styleExtra,
        }}
        onUpdateWorkStyle={(patch) => {
          if (!workId) return;
          if (patch.pov !== undefined) setStylePov(patch.pov);
          if (patch.tone !== undefined) setStyleTone(patch.tone);
          if (patch.bannedPhrases !== undefined) setStyleBanned(patch.bannedPhrases);
          if (patch.styleAnchor !== undefined) setStyleAnchor(patch.styleAnchor);
          if (patch.extraRules !== undefined) setStyleExtra(patch.extraRules);
          void upsertWorkStyleCard(workId, patch);
        }}
        linkedExcerptsForChapter={linkedExcerptsForChapter}
        getSelectedText={getSelectedText}
        insertAtCursor={(t) => editorRef.current?.insertTextAtCursor(t)}
        appendToEnd={(t) => editorRef.current?.appendTextToEnd(t)}
        replaceSelection={replaceSelection}
      />,
    );
    rightRail.setTabEnabled("summary", true);
    rightRail.setTabContent(
      "summary",
      <SummaryRightPanel
        workId={workId}
        work={work}
        chapter={activeChapter}
        chapters={chapters}
        onJumpToChapter={(id) => void switchChapter(id)}
      />,
    );
    rightRail.setTabEnabled("bible", true);
    rightRail.setTabContent("bible", <BibleRightPanel workId={workId} />);
    rightRail.setTabEnabled("ref", true);
    rightRail.setTabContent(
      "ref",
      <RefRightPanel
        linked={linkedExcerptsForChapter}
        onInsert={(t) => {
          insertExcerptIntoEditor(t);
          rightRail.setOpen(false);
        }}
      />,
    );
    return () => {
      rightRail.setTabContent("ai", null);
      rightRail.setTabContent("summary", null);
      rightRail.setTabContent("bible", null);
      rightRail.setTabContent("ref", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workId,
    work,
    activeChapter,
    chapters,
    content,
    cbGoal,
    cbForbid,
    cbPov,
    cbScene,
    glossaryTerms,
    stylePov,
    styleTone,
    styleBanned,
    styleAnchor,
    styleExtra,
    linkedExcerptsForChapter,
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
    cbStateRef.current = { goal: cbGoal, forbid: cbForbid, pov: cbPov, scene: cbScene };
  }, [cbGoal, cbForbid, cbPov, cbScene]);

  useEffect(() => {
    if (!workId) return;
    void listBibleGlossaryTerms(workId).then(setGlossaryTerms);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    void getWorkStyleCard(workId).then((row) => {
      setStylePov(row?.pov ?? "");
      setStyleTone(row?.tone ?? "");
      setStyleBanned(row?.bannedPhrases ?? "");
      setStyleAnchor(row?.styleAnchor ?? "");
      setStyleExtra(row?.extraRules ?? "");
    });
  }, [workId]);

  useEffect(() => {
    if (!activeId || !workId) return;
    cbSkipSaveRef.current = true;
    cbReadyForChapterRef.current = null;
    void getChapterBible(activeId).then((row) => {
      if (activeIdRef.current !== activeId) return;
      setCbGoal(row?.goalText ?? "");
      setCbForbid(row?.forbidText ?? "");
      setCbPov(row?.povText ?? "");
      setCbScene(row?.sceneStance ?? "");
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
        goalText: cbGoal,
        forbidText: cbForbid,
        povText: cbPov,
        sceneStance: cbScene,
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [cbGoal, cbForbid, cbPov, cbScene, activeId, workId]);

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
    const stored = sessionStorage.getItem(LAST_CHAPTER_KEY + workId);
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
        void switchChapter(c);
        u.searchParams.delete("chapter");
        window.history.replaceState({}, "", u.toString());
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, chapters.length]);

  useEffect(() => {
    if (!workId || !activeId) return;
    sessionStorage.setItem(LAST_CHAPTER_KEY + workId, activeId);
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

  useEffect(() => {
    if (!snapshotOpen || !activeId) return;
    void listChapterSnapshots(activeId).then(setSnapshotList);
  }, [snapshotOpen, activeId]);

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

  const canWideWrite = sidebarCollapsed && !rightRail.open;

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

  // Inject write tools into global topbar
  useEffect(() => {
    if (!work) return;
    topbar.setTitleNode(
      <>
        <strong>写作</strong>
        <span className="muted small"> · {work.title}</span>
      </>,
    );
    topbar.setActionsNode(
      <div className="editor-topbar-actions">
        <div className="editor-topbar-stats">
          <span className="muted small" title="本章字数">
            {chapterWords}
          </span>
          <span className="muted small" aria-hidden>
            ·
          </span>
          <span className="muted small" title="全书字数">
            {bookWords}
          </span>
          <span className="muted small" aria-hidden>
            ·
          </span>
          <span className="muted small" title="今日新增">
            今日 {dailyWordsDisplay}
          </span>
        </div>
        <span className={`save-pill save-${saveState}`} title="保存状态">
          {saveState === "saving" && "保存中"}
          {saveState === "saved" && "已保存"}
          {saveState === "idle" && ""}
          {saveState === "error" && "保存失败"}
        </span>
        {lastSavedAt ? (
          <span className="muted small" title="最后一次保存完成时间">
            {new Date(lastSavedAt).toLocaleTimeString()}
          </span>
        ) : null}
        <button type="button" className="btn small" disabled={!activeChapter} onClick={() => void handleManualSnapshot()}>
          保存
        </button>
        <button
          type="button"
          className={`btn small ${aiOpen ? "primary" : ""}`}
          disabled={!activeChapter}
          onClick={() => {
            setAiOpen((v) => {
              const next = !v;
              rightRail.setActiveTab("ai");
              rightRail.setOpen(next);
              return next;
            });
          }}
        >
          AI
        </button>
        <button type="button" className="btn small" disabled={!canWideWrite} onClick={() => setEditorAutoWidth((v) => !v)}>
          {editorAutoWidth ? "宽度：自适应" : "宽度：自定义"}
        </button>
        <button
          type="button"
          className={`icon-btn editor-topbar-hide-sm ${findOpen ? "is-on" : ""}`}
          title="查找 / 替换"
          onClick={() => setFindOpen((v) => !v)}
        >
          ⌕
        </button>
        <button
          type="button"
          className={`icon-btn editor-topbar-hide-sm ${bookSearchOpen ? "is-on" : ""}`}
          title="全书搜索"
          onClick={() => (bookSearchOpen ? closeBookSearch() : openBookSearch())}
        >
          全书
        </button>
        <button
          type="button"
          className="icon-btn editor-topbar-hide-sm"
          title="章节历史"
          disabled={!activeChapter}
          onClick={() => setSnapshotOpen(true)}
        >
          历史
        </button>
        <div className="toolbar-more-wrap" ref={moreWrapRef}>
          <button
            type="button"
            className="icon-btn"
            title="更多"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            ···
          </button>
          {moreOpen ? (
            <div className="toolbar-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setFindOpen(true);
                }}
              >
                查找 / 替换
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  openBookSearch();
                }}
              >
                全书搜索
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!activeChapter}
                onClick={() => {
                  setMoreOpen(false);
                  setSnapshotOpen(true);
                }}
              >
                章节历史
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!activeChapter}
                onClick={() => {
                  setMoreOpen(false);
                  void handleManualSnapshot();
                }}
              >
                保存章节快照
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!workId}
                onClick={() => {
                  setMoreOpen(false);
                  window.location.href = `/work/${workId}/summary`;
                }}
              >
                概要总览
              </button>
              <div className="toolbar-menu-divider" />
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
              <div className="toolbar-menu-label">Markdown</div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  void exportChapterMd();
                }}
              >
                导出本章 .md
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  void exportBookMd();
                }}
              >
                导出全书 .md
              </button>
              <Link to="/settings" role="menuitem" onClick={() => setMoreOpen(false)}>
                设置
              </Link>
            </div>
          ) : null}
        </div>
      </div>,
    );
    return () => {
      topbar.setTitleNode(null);
      topbar.setActionsNode(null);
    };
  }, [
    topbar,
    work,
    workId,
    chapterWords,
    bookWords,
    dailyWordsDisplay,
    saveState,
    lastSavedAt,
    activeChapter,
    aiOpen,
    canWideWrite,
    editorAutoWidth,
    findOpen,
    bookSearchOpen,
    moreOpen,
    rightRail,
  ]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!widthDragRef.current) return;
      const dx = e.clientX - widthDragRef.current.startX;
      const next = Math.max(720, Math.min(1600, Math.floor(widthDragRef.current.startW + dx)));
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

  const persistContent = useCallback(
    async (chapterId: string, text: string) => {
      if (!workId) return;
      persistInFlightRef.current = true;
      setSaveState("saving");
      try {
        const prev = lastPersistedRef.current.get(chapterId) ?? "";
        addDailyWordsFromDelta(prev, text);
        await updateChapter(chapterId, { content: text });
        lastPersistedRef.current.set(chapterId, text);
        clearDraft(workId, chapterId);
        setDailyTick((t) => t + 1);
        setChapters((prevCh) =>
          prevCh.map((c) =>
            c.id === chapterId
              ? { ...c, content: text, updatedAt: Date.now(), wordCountCache: wordCount(text) }
              : c,
          ),
        );
        setSaveState("saved");
        setLastSavedAt(Date.now());
      } catch {
        setSaveState("error");
      } finally {
        persistInFlightRef.current = false;
      }
    },
    [workId],
  );

  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => {
      void persistContent(activeId, content);
    }, 700);
    return () => window.clearTimeout(t);
  }, [content, activeId, persistContent]);

  async function switchChapter(nextId: string) {
    if (activeId && activeId !== nextId) {
      await persistContent(activeId, content);
      await addChapterSnapshot(activeId, content);
      if (workId) {
        await upsertChapterBible({
          chapterId: activeId,
          workId,
          goalText: cbStateRef.current.goal,
          forbidText: cbStateRef.current.forbid,
          povText: cbStateRef.current.pov,
          sceneStance: cbStateRef.current.scene,
        });
      }
    }
    const ch = chapters.find((c) => c.id === nextId);
    setActiveId(nextId);
    const nextBody = ch?.content ?? "";
    setContent(nextBody);
    lastPersistedRef.current.set(nextId, nextBody);
  }

  const handleManualSnapshot = useCallback(async () => {
    if (!activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    if (snapshotOpen) void listChapterSnapshots(activeId).then(setSnapshotList);
  }, [activeId, content, persistContent, snapshotOpen]);

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

  async function handleRestoreSnapshot(snap: ChapterSnapshot) {
    if (!activeChapter || snap.chapterId !== activeChapter.id) return;
    if (!window.confirm("用此历史版本覆盖当前正文？")) return;
    await persistContent(activeChapter.id, content);
    await addChapterSnapshot(activeChapter.id, content);
    setContent(snap.content);
    const wc = wordCount(snap.content);
    await updateChapter(activeChapter.id, { content: snap.content });
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

  function handleReplaceFirst() {
    if (!findQ) {
      window.alert("请先输入查找内容。");
      return;
    }
    setContent((prev) => replaceFirstLiteral(prev, findQ, replaceQ));
  }

  function handleReplaceAll() {
    if (!findQ) {
      window.alert("请先输入查找内容。");
      return;
    }
    if (!window.confirm(`将本章中全部「${findQ}」替换为「${replaceQ}」？`)) return;
    setContent((prev) => replaceAllLiteral(prev, findQ, replaceQ));
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
      const hits = await searchWork(workId, q, bookSearchScope);
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

  async function jumpToSearchHit(chapterId: string) {
    if (chapterId === activeId) {
      closeBookSearch();
      return;
    }
    await switchChapter(chapterId);
    closeBookSearch();
  }

  async function handleNewChapter() {
    if (!workId) return;
    const vid = activeChapter?.volumeId ?? volumes[0]?.id;
    const ch = await createChapter(workId, undefined, vid);
    await load();
    setActiveId(ch.id);
    setContent("");
    lastPersistedRef.current.set(ch.id, "");
  }

  async function handleNewVolume() {
    if (!workId) return;
    const t = window.prompt("新卷标题", "新卷");
    if (t === null) return;
    await createVolume(workId, t.trim() || "新卷");
    await load();
  }

  async function handleRenameVolume(volId: string) {
    const vol = volumes.find((v) => v.id === volId);
    const t = window.prompt("卷名", vol?.title ?? "");
    if (t === null) return;
    await updateVolume(volId, { title: t.trim() || vol?.title });
    await load();
  }

  async function handleDeleteVolumeUi(volId: string) {
    try {
      await deleteVolume(volId);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "无法删除该卷");
    }
  }

  async function handleMoveChapterToVolume(chapterId: string) {
    if (volumes.length < 2) return;
    const lines = volumes.map((v, i) => `${i + 1}. ${v.title}`).join("\n");
    const n = window.prompt(`移到哪一卷？\n${lines}`, "1");
    if (n === null) return;
    const idx = Number.parseInt(n, 10) - 1;
    if (idx < 0 || idx >= volumes.length) return;
    await updateChapter(chapterId, { volumeId: volumes[idx].id });
    await load();
  }

  async function handleDropChapter(targetId: string) {
    if (!workId || !dragChapterId || dragChapterId === targetId) {
      setDragChapterId(null);
      return;
    }
    const from = chapters.findIndex((c) => c.id === dragChapterId);
    const to = chapters.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) {
      setDragChapterId(null);
      return;
    }
    const ids = chapters.map((c) => c.id);
    const [removed] = ids.splice(from, 1);
    ids.splice(to, 0, removed);
    await reorderChapters(workId, ids);
    setDragChapterId(null);
    await load();
  }

  async function handleRename(id: string) {
    const ch = chapters.find((c) => c.id === id);
    const t = window.prompt("章节标题", ch?.title ?? "");
    if (t === null) return;
    await updateChapter(id, { title: t.trim() || ch?.title });
    await load();
  }

  async function handleDeleteChapter(id: string) {
    if (!window.confirm("删除本章？（可先从设置导出备份）")) return;
    await deleteChapter(id);
    await load();
    if (activeId === id) {
      const list = await listChapters(workId!);
      const next = list[0]?.id ?? null;
      setActiveId(next);
      setContent(list[0]?.content ?? "");
    }
  }

  async function moveChapter(id: string, dir: -1 | 1) {
    if (!workId) return;
    const idx = chapters.findIndex((c) => c.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= chapters.length) return;
    const ids = chapters.map((c) => c.id);
    const t = ids[idx];
    ids[idx] = ids[j];
    ids[j] = t;
    await reorderChapters(workId, ids);
    await load();
  }

  async function setProgressChapter(id: string) {
    if (!workId) return;
    await updateWork(workId, { progressCursor: id });
    const w = await getWork(workId);
    if (w) setWork(w);
  }

  async function exportChapterMd() {
    if (!activeChapter || !activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    const le = readLineEndingMode();
    const md = normalizeLineEndings(`# ${activeChapter.title}\n\n${content}`, le);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, `${safeFilename(activeChapter.title)}.md`);
  }

  async function exportBookMd() {
    if (!work || !workId || !activeId) return;
    await persistContent(activeId, content);
    const list = await listChapters(workId);
    for (const c of list) {
      await addChapterSnapshot(c.id, c.content);
    }
    const merged = list.map((c) => ({
      title: c.title,
      content: c.content,
    }));
    const le = readLineEndingMode();
    const nl = le === "crlf" ? "\r\n" : "\n";
    const blob = await exportWorkAsMergedMarkdown(work.title, merged, nl);
    downloadBlob(blob, `${safeFilename(work.title)}.md`);
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
    await persistContent(activeId, content);
    const list = await listChapters(workId);
    for (const c of list) {
      await addChapterSnapshot(c.id, c.content);
    }
    const merged = list.map((c) => ({
      title: c.title,
      content: c.content,
    }));
    const blob = buildBookTxt(work.title, merged, readLineEndingMode());
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
      window.alert(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  async function exportBookDocx() {
    if (!work || !workId || !activeId) return;
    try {
      await persistContent(activeId, content);
      const list = await listChapters(workId);
      for (const c of list) {
        await addChapterSnapshot(c.id, c.content);
      }
      const merged = list.map((c) => ({
        title: c.title,
        content: c.content,
      }));
      const blob = await buildBookDocx(work.title, merged);
      downloadBlob(blob, `${safeFilename(work.title)}.docx`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  const findMatches = useMemo(() => {
    if (!findQ) return 0;
    const re = new RegExp(findQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    return (content.match(re) ?? []).length;
  }, [content, findQ]);

  if (!workId) {
    return <p className="muted">无效地址</p>;
  }

  if (loading) {
    return (
      <div className="page editor-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="page editor-page">
        <p>作品不存在。</p>
        <Link to="/">返回</Link>
      </div>
    );
  }

  return (
    <div className="page editor-page theme-typora">
      <header className="editor-toolbar-lite">
        <button
          type="button"
          className="icon-btn"
          title={sidebarCollapsed ? "展开章节" : "收起章节"}
          aria-expanded={!sidebarCollapsed}
          onClick={toggleSidebar}
        >
          <span className="icon-btn__glyph" aria-hidden>
            {sidebarCollapsed ? "⟩" : "⟨"}
          </span>
        </button>
      </header>

      {/* 旧工具条：按你的要求保留，但不再渲染（避免重复交互/点击冲突） */}
      <header className="editor-toolbar" style={{ display: "none" }} aria-hidden />

      <div
        className={`editor-body ${sidebarCollapsed ? "editor-body--sidebar-collapsed" : ""}`}
      >
        <aside
          className="chapter-sidebar"
          aria-hidden={sidebarCollapsed}
          onWheelCapture={(e) => {
            // Prevent wheel scrolling from chaining into the editor/body.
            e.stopPropagation();
          }}
        >
          <div className="sidebar-head sidebar-section-head">
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
              <button type="button" className="btn small" onClick={() => void handleNewVolume()}>
                + 卷
              </button>
              <button type="button" className="btn primary small" onClick={() => void handleNewChapter()}>
                + 新章
              </button>
            </div>
          </div>
          {work.progressCursor && (
            <p className="progress-hint small">
              进度截至：{chapters.find((c) => c.id === work.progressCursor)?.title ?? "（章节已删）"}
            </p>
          )}
          {!chapterListCollapsed ? (
            volumes.map((vol) => (
              <div key={vol.id} className="volume-block">
                <div className="volume-row">
                  <span className="volume-title">{vol.title}</span>
                  <div className="volume-actions">
                    <button type="button" title="重命名卷" onClick={() => void handleRenameVolume(vol.id)}>
                      ✎
                    </button>
                    {volumes.length > 1 ? (
                      <button type="button" title="删卷（章并入其他卷）" onClick={() => void handleDeleteVolumeUi(vol.id)}>
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
                <ul className="chapter-list">
                  {chapters
                    .filter((c) => c.volumeId === vol.id)
                    .map((c) => {
                      const i = chapters.findIndex((x) => x.id === c.id);
                      return (
                        <li
                          key={c.id}
                          className={c.id === activeId ? "active" : ""}
                          draggable
                          onDragStart={() => setDragChapterId(c.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            void handleDropChapter(c.id);
                          }}
                        >
                          <button
                            type="button"
                            className="chapter-select"
                            onClick={() => void switchChapter(c.id)}
                          >
                            {c.title}
                          </button>
                          <div className="chapter-actions">
                          <button
                            type="button"
                            title="上移"
                            disabled={i === 0}
                            onClick={() => void moveChapter(c.id, -1)}
                          >
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
                          <button
                            type="button"
                            title="概要"
                            onClick={() => {
                              void switchChapter(c.id).then(() => setSummaryOpen(true));
                            }}
                          >
                            概要
                          </button>
                          {volumes.length > 1 ? (
                            <button
                              type="button"
                              title="移到其他卷"
                              onClick={() => void handleMoveChapterToVolume(c.id)}
                            >
                              卷
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title="设为写作进度游标"
                            className={work.progressCursor === c.id ? "on" : ""}
                            onClick={() => void setProgressChapter(c.id)}
                          >
                            ◎
                          </button>
                          <button type="button" title="删除" onClick={() => void handleDeleteChapter(c.id)}>
                            ×
                          </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))
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
          {activeChapter ? (
            <div className="sidebar-chapter-bible">
              <div className="sidebar-chapter-bible-title">本章约束</div>
              <label className="sidebar-bible-field">
                <span>本章目标</span>
                <textarea
                  value={cbGoal}
                  onChange={(e) => setCbGoal(e.target.value)}
                  rows={2}
                  placeholder="可对照圣经中的章模板"
                />
              </label>
              <label className="sidebar-bible-field">
                <span>禁止出现</span>
                <textarea value={cbForbid} onChange={(e) => setCbForbid(e.target.value)} rows={2} />
              </label>
              <label className="sidebar-bible-field">
                <span>视角 / 口吻</span>
                <textarea value={cbPov} onChange={(e) => setCbPov(e.target.value)} rows={2} />
              </label>
              <label className="sidebar-bible-field">
                <span>场景状态</span>
                <textarea
                  value={cbScene}
                  onChange={(e) => setCbScene(e.target.value)}
                  rows={2}
                  placeholder="站位、持物、出口等"
                />
              </label>
            </div>
          ) : null}
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
        </aside>

        <main className="editor-main">
          {findOpen && (
            <div className="find-bar find-bar--extended">
              <label className="find-label">查找</label>
              <input
                type="search"
                placeholder="章内文字"
                value={findQ}
                onChange={(e) => setFindQ(e.target.value)}
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
                <span className="find-count">{findMatches} 处</span>
              ) : null}
              <button type="button" className="btn small" onClick={handleReplaceFirst}>
                替换下一处
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
            <div
              className="editor-paper"
              style={
                canWideWrite
                  ? editorAutoWidth
                    ? { maxWidth: "1400px", width: "100%" }
                    : { maxWidth: `${editorMaxWidthPx}px` }
                  : undefined
              }
            >
              {activeChapter ? (
                <div className="editor-chapter-title" aria-label="当前章节标题">
                  <span className="editor-chapter-title-text">{activeChapter.title}</span>
                  {canWideWrite ? (
                    <span className="editor-chapter-title-tools">
                      <button
                        type="button"
                        className="editor-width-reset"
                        title="恢复默认宽度"
                        onClick={() => {
                          setEditorAutoWidth(false);
                          setEditorMaxWidthPx(860);
                          try {
                            localStorage.setItem(EDITOR_WIDTH_KEY, "860");
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        默认
                      </button>
                      {!editorAutoWidth ? (
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
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {activeChapter ? (
                <CodeMirrorEditor
                  ref={editorRef}
                  className="editor-textarea cm6-editor"
                  value={content}
                  onChange={setContent}
                  ariaLabel="正文编辑器"
                  placeholderText="在此输入正文…"
                />
              ) : (
                <p className="editor-empty">请选择或新建章节。</p>
              )}
            </div>
            </div>
          </div>
        </main>

        {/* AI 面板已迁移到全局右侧栏（AppShell） */}
      </div>

      {summaryOpen && activeChapter && (
        <div className="modal-overlay" role="presentation" onClick={() => setSummaryOpen(false)}>
          <div
            className="modal-card modal-card--wide"
            role="dialog"
            aria-labelledby="sum-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="sum-title">章节概要 · {activeChapter.title}</h3>
            <p className="small muted">建议用要点列事实与推进（供 AI 注入与快速回忆）。</p>
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              rows={12}
              style={{ width: "100%", resize: "vertical" }}
              placeholder="例如：\n- 主角与某人达成协议…\n- 伏笔：提到某物…"
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  void (async () => {
                    await updateChapter(activeChapter.id, { summary: summaryDraft });
                    setChapters((prev) =>
                      prev.map((c) => (c.id === activeChapter.id ? { ...c, summary: summaryDraft } : c)),
                    );
                    setSummaryOpen(false);
                  })();
                }}
              >
                保存概要
              </button>
              <button type="button" className="btn ghost" onClick={() => setSummaryOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
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
            <p className="small muted">字面量匹配（非正则）。搜索前会先保存当前章。</p>
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
                仅进度游标之前
              </label>
            </div>
            <div className="modal-row">
              <input
                type="search"
                className="modal-input"
                placeholder="关键词"
                value={bookSearchQ}
                onChange={(e) => setBookSearchQ(e.target.value)}
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
                      onClick={() => void jumpToSearchHit(h.chapterId)}
                    >
                      <span className="book-search-hit-title">{h.chapterTitle}</span>
                      <span className="book-search-hit-meta">{h.matchCount} 处</span>
                      <span className="book-search-hit-preview">{h.preview}</span>
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
                {snapshotList.map((s) => (
                  <li key={s.id} className="snapshot-item">
                    <div className="snapshot-item-head">
                      <time dateTime={new Date(s.createdAt).toISOString()}>
                        {new Date(s.createdAt).toLocaleString()}
                      </time>
                      <div className="snapshot-item-actions">
                        <button type="button" className="btn small" onClick={() => void handleRestoreSnapshot(s)}>
                          恢复
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
                    <pre className="snapshot-preview">{s.content.slice(0, 400)}{s.content.length > 400 ? "…" : ""}</pre>
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
    </div>
  );
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
