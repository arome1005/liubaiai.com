import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  addReferenceExcerpt,
  clearAllReferenceLibraryData,
  createReferenceFromPlainText,
  createReferenceTag,
  deleteReferenceExcerpt,
  deleteReferenceLibraryEntry,
  deleteReferenceTag,
  getReferenceChunkAt,
  getWork,
  listChapters,
  listReferenceExcerptsWithTagIds,
  listReferenceChapterHeads,
  listReferenceLibrary,
  listReferenceTags,
  listWorks,
  rebuildAllReferenceSearchIndex,
  searchReferenceLibrary,
  updateReferenceExcerpt,
  updateReferenceLibraryEntry,
} from "../db/repo";
import type {
  Chapter,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  Work,
} from "../db/types";
import { REFERENCE_CHUNK_CHAR_TARGET, REFERENCE_IMPORT_HEAVY_BYTES } from "../db/types";
import { readUtf8TextFileWithCheck } from "../util/readUtf8TextFile";

const CONTEXT_TAIL = 280;
const CONTEXT_HEAD = 280;

const LS_REF_PROGRESS_FILTER = "liubai-ref3_8-progress-filter";
const LS_REF_PROGRESS_WORK = "liubai-ref3_8-progress-work";
const LS_REF_READER_POS_PREFIX = "liubai-ref:readerPos:";

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
  /** 仅搜当前打开的书；null = 全库 */
  const [searchScopeRefId, setSearchScopeRefId] = useState<string | null>(null);

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
    if (!categoryFilter) return items;
    return items.filter((it) => (it.category ?? "").trim() === categoryFilter);
  }, [items, categoryFilter]);

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
      window.alert("地址栏中的参考书目不存在或已删除。");
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

  const jumpExcerptToReader = useCallback(
    async (ex: ReferenceExcerpt) => {
      const entry = items.find((x) => x.id === ex.refWorkId);
      if (!entry) {
        window.alert("该参考书目已不存在，无法跳转。");
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
  }, [activeRefId]);

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

    const txtFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".txt"));
    if (txtFiles.length === 0) {
      window.alert("仅支持 .txt 原著导入（分块存储，可支持百万字级）。可多选文件。");
      return;
    }
    if (txtFiles.length < picked.length) {
      window.alert(
        `已忽略 ${picked.length - txtFiles.length} 个非 .txt 文件，将导入 ${txtFiles.length} 个 .txt。`,
      );
    }

    if (txtFiles.length === 1) {
      const file = txtFiles[0]!;
      setBusy(true);
      try {
        const { text, suspiciousEncoding } = await readUtf8TextFileWithCheck(file);
        if (suspiciousEncoding) {
          const go = window.confirm(
            "文本疑似非 UTF-8，或含较多无法解码字符；继续导入可能出现乱码。请将 .txt 另存为 UTF-8 后导入更稳妥。\n\n仍要继续导入吗？",
          );
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
              }
            : undefined,
        );
        setHeavyJob(null);
        await refresh();
        await openReader(entry, 0, null);
      } catch (err) {
        setHeavyJob(null);
        window.alert(err instanceof Error ? err.message : "导入失败");
      } finally {
        setBusy(false);
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
        const file = txtFiles[i]!;
        setImportProgress({ current: i + 1, total: txtFiles.length, fileName: file.name });
        try {
          const { text, suspiciousEncoding } = await readUtf8TextFileWithCheck(file);
          if (suspiciousEncoding) {
            const go = window.confirm(
              `${file.name}：疑似非 UTF-8 或无法解码字符较多，继续导入可能乱码。仍要继续？`,
            );
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
                }
              : undefined,
          );
          setHeavyJob(null);
          ok++;
          await refresh();
        } catch (err) {
          setHeavyJob(null);
          errors.push(`${file.name}：${err instanceof Error ? err.message : "导入失败"}`);
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    } finally {
      setImportProgress(null);
      setHeavyJob(null);
      setBusy(false);
    }

    if (errors.length > 0) {
      const head = errors.slice(0, 8);
      const more = errors.length > 8 ? `\n… 共 ${errors.length} 条失败` : "";
      window.alert(`批量导入完成：成功 ${ok}，失败 ${errors.length}。\n\n${head.join("\n")}${more}`);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`删除参考库「${title}」？（分块、索引与摘录一并删除）`)) return;
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
      window.alert("请先在阅读器中划选要保存的文字。");
      return;
    }
    let start = ch.content.indexOf(t);
    if (start < 0) {
      window.alert("无法定位选区，请缩短选区或避免跨段选择。");
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
    if (!window.confirm("删除这条摘录？")) return;
    await deleteReferenceExcerpt(id);
    if (activeRefId) await loadExcerpts(activeRefId);
    if (editingExcerptId === id) setEditingExcerptId(null);
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
      <div className="page reference-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="page reference-page reference-page--split">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← 作品库
        </Link>
        <h1>参考库</h1>
        <div className="header-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={openPicker}>
            {busy
              ? importProgress
                ? `导入中 ${importProgress.current}/${importProgress.total}…`
                : "导入中…"
              : "导入 .txt（可多选）"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            multiple
            className="visually-hidden"
            onChange={(ev) => void handleFiles(ev)}
          />
        </div>
      </header>

      {importProgress && (
        <div className="reference-import-progress" role="status" aria-live="polite">
          <div className="reference-progress-meta">
            <span>
              正在导入第 {importProgress.current} / {importProgress.total} 个
            </span>
            {importProgress.fileName ? (
              <span className="muted truncate" title={importProgress.fileName}>
                {importProgress.fileName}
              </span>
            ) : null}
          </div>
          <div
            className="reference-progress-bar"
            aria-valuenow={importProgress.current}
            aria-valuemax={importProgress.total}
            role="progressbar"
          >
            <div
              className="reference-progress-bar-fill"
              style={{
                width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <p className="muted small import-hint">
        导入时建立<strong>关键词倒排索引</strong>；检索为索引召回 + 字面量确认。可选中多个 .txt 批量导入。
        分块约 <strong>{REFERENCE_CHUNK_CHAR_TARGET.toLocaleString()}</strong> 字/段。
      </p>

      <div className="reference-page-layout">
        <main className="reference-main">
          <div className="reference-search-block">
            <div className="reference-filter-row">
              <label className="small muted">
                分类筛选
                <select
                  className="input reference-category-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">全部</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="reference-search-row">
              <input
                type="search"
                className="input reference-search-input"
                placeholder="搜索参考库全文…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
              />
              <button type="button" className="btn small" disabled={searchLoading} onClick={() => void runSearch()}>
                {searchLoading ? "…" : "搜索"}
              </button>
            </div>
            <label className="reference-scope small muted">
              <input
                type="checkbox"
                checked={searchScopeRefId !== null}
                onChange={(e) => {
                  if (e.target.checked) {
                    if (activeRefId) setSearchScopeRefId(activeRefId);
                  } else setSearchScopeRefId(null);
                }}
                disabled={!activeRefId}
              />{" "}
              仅搜当前阅读中的书
              {!activeRefId ? "（先打开一本书）" : ""}
            </label>
            <p className="muted small reference-search-note">
              全文检索命中的是参考正文<strong>分块</strong>，无法按写作进度裁剪；若需与 2.6 游标一致防剧透，请为摘录<strong>关联创作章节</strong>并在侧栏用「进度前」过滤。
            </p>
            <div className="reference-excerpt-filters">
              <label className="small muted">
                摘录按标签筛选
                <select
                  className="input reference-category-select"
                  value={excerptTagFilterId}
                  onChange={(e) => setExcerptTagFilterId(e.target.value)}
                >
                  <option value="">全部</option>
                  {allTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="reference-progress-filter small muted">
                <input
                  type="checkbox"
                  checked={progressFilterEnabled}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setProgressFilterEnabled(v);
                    try {
                      localStorage.setItem(LS_REF_PROGRESS_FILTER, v ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                  }}
                />{" "}
                摘录仅保留关联章节在<strong>写作进度前</strong>（与全书「仅进度前」一致，不含游标章）
              </label>
              <label className="small muted">
                进度参照作品
                <select
                  className="input reference-category-select"
                  value={progressFilterWorkId}
                  disabled={!progressFilterEnabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProgressFilterWorkId(v);
                    try {
                      localStorage.setItem(LS_REF_PROGRESS_WORK, v);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <option value="">选择作品</option>
                  {worksList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="reference-tag-manage">
              <span className="small muted">摘录标签（全局）</span>
              <div className="reference-tag-manage-row">
                <input
                  type="text"
                  className="input reference-tag-input"
                  placeholder="新标签名称"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                />
                <button
                  type="button"
                  className="btn small"
                  disabled={!newTagName.trim()}
                  onClick={() => {
                    void (async () => {
                      try {
                        await createReferenceTag(newTagName);
                        setNewTagName("");
                        await refresh();
                      } catch (err) {
                        window.alert(err instanceof Error ? err.message : "创建失败");
                      }
                    })();
                  }}
                >
                  添加标签
                </button>
              </div>
              {allTags.length > 0 ? (
                <ul className="reference-tag-list">
                  {allTags.map((t) => (
                    <li key={t.id}>
                      <span className="reference-tag-name">{t.name}</span>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => {
                          if (!window.confirm(`删除标签「${t.name}」？摘录上的该标签会一并移除。`)) return;
                          void (async () => {
                            await deleteReferenceTag(t.id);
                            if (excerptTagFilterId === t.id) setExcerptTagFilterId("");
                            await refresh();
                            if (activeRefId) await loadExcerpts(activeRefId);
                          })();
                        }}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">暂无标签；添加后可在侧栏摘录上勾选。</p>
              )}
            </div>
          </div>

          {searchHits.length > 0 && (
            <div className="reference-search-hits">
              <div className="reference-search-hits-title">搜索结果</div>
              <ul className="reference-hit-list">
                {searchHits.map((h) => (
                  <li key={`${h.chunkId}-${h.ordinal}-${h.highlightStart}-${h.snippetMatch}`}>
                    <button type="button" className="reference-hit-btn" onClick={() => void onHitClick(h)}>
                      <span className="reference-hit-title">{h.refTitle}</span>
                      <span className="muted small">
                        {chapterLabelForHit(h.refWorkId, h.ordinal) ? `章：${chapterLabelForHit(h.refWorkId, h.ordinal)} · ` : ""}
                        存储段 {h.ordinal + 1} · {h.matchCount} 处
                      </span>
                      <p className="reference-hit-snippet">
                        <span className="reference-hit-snippet-before">{h.snippetBefore}</span>
                        <mark className="reference-hit-snippet-match">{h.snippetMatch}</mark>
                        <span className="reference-hit-snippet-after">{h.snippetAfter}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items.length === 0 ? (
            <p className="muted">暂无参考库。请先导入 .txt。</p>
          ) : (
            <ul className="reference-list">
              {filteredItems.map((r) => {
                const chCount = r.chapterHeadCount ?? 0;
                return (
                  <li key={r.id} className="reference-row">
                    <div className="reference-row-line">
                      <button
                        type="button"
                        className="reference-row-main"
                        onClick={() => void openReader(r, 0, null)}
                      >
                        <span className="reference-title">{r.title}</span>
                        {(r.category ?? "").trim() ? (
                          <span className="reference-category-badge">{(r.category ?? "").trim()}</span>
                        ) : null}
                        <span className="muted small">
                          {r.totalChars.toLocaleString()} 字 · {r.chunkCount} 段
                          {chCount > 0 ? ` · ${chCount} 章` : ""}
                          {r.sourceName ? ` · ${r.sourceName}` : ""}
                        </span>
                      </button>
                      <div className="reference-row-actions">
                        <button
                          type="button"
                          className="btn ghost small"
                          title="编辑分类"
                          onClick={(e) => {
                            e.stopPropagation();
                            const c =
                              window.prompt("分类（可空）", (r.category ?? "").trim()) ?? "";
                            void (async () => {
                              await updateReferenceLibraryEntry(r.id, { category: c.trim() || undefined });
                              await refresh();
                            })();
                          }}
                        >
                          分类
                        </button>
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => void handleDelete(r.id, r.title)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    {chCount > 0 ? (
                      <details
                        className="reference-chapter-collapse"
                        onToggle={(e) => {
                          const el = e.currentTarget;
                          if (!el.open || refChapterHeadsById[r.id]) return;
                          void listReferenceChapterHeads(r.id).then((list) =>
                            setRefChapterHeadsById((prev) => ({ ...prev, [r.id]: list })),
                          );
                        }}
                      >
                        <summary className="reference-chapter-summary">章节列表（{chCount}）</summary>
                        <ul className="reference-chapter-sublist">
                          {(refChapterHeadsById[r.id] ?? []).map((h, idx) => (
                            <li key={h.id}>
                              <button
                                type="button"
                                className="reference-chapter-link"
                                onClick={() => void openReader(r, h.ordinal, null)}
                              >
                                <span className="reference-chapter-idx">{idx + 1}.</span>
                                <span className="reference-chapter-title">{h.title}</span>
                                <span className="muted small">存储段 {h.ordinal + 1}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <section className="reference-maintain" aria-labelledby="ref-maintain-title">
            <h3 id="ref-maintain-title" className="reference-maintain-title">
              参考库维护
            </h3>
            <p className="muted small reference-maintain-hint">
              以下仅影响<strong>参考库</strong>（导入原著与摘录索引），<strong>不会</strong>删除作品正文。升级 Schema
              后若检索异常，可先试「重建索引」。
            </p>
            <div className="reference-maintain-btns">
              <button
                type="button"
                className="btn"
                disabled={maintainBusy || busy}
                onClick={() => {
                  void (async () => {
                    setMaintainBusy(true);
                    setHeavyJob({ phase: "index", percent: 0, label: "准备重建…" });
                    try {
                      await rebuildAllReferenceSearchIndex((p) =>
                        setHeavyJob({
                          phase: "index",
                          percent: p.percent,
                          label: p.label,
                        }),
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
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={maintainBusy || busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "将清空全部参考库（原著、索引、摘录），不影响作品与章节正文。此操作不可撤销。确定？",
                    )
                  ) {
                    return;
                  }
                  void (async () => {
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
                  })();
                }}
              >
                清空参考库
              </button>
            </div>
          </section>
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
            <div className="reference-reader-inner">
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
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={currentChapterIndex <= 0}
                            onClick={() => {
                              const prev = activeChapterHeads[currentChapterIndex - 1];
                              if (!prev) return;
                              setFocusOrdinal(prev.ordinal);
                              setHighlight(null);
                            }}
                          >
                            上一章
                          </button>
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
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={currentChapterIndex < 0 || currentChapterIndex >= activeChapterHeads.length - 1}
                            onClick={() => {
                              const next = activeChapterHeads[currentChapterIndex + 1];
                              if (!next) return;
                              setFocusOrdinal(next.ordinal);
                              setHighlight(null);
                            }}
                          >
                            下一章
                          </button>
                        </>
                      ) : (
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={focusOrdinal <= 0}
                        onClick={() => {
                          setFocusOrdinal((o) => o - 1);
                          setHighlight(null);
                        }}
                      >
                        上一段
                      </button>
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
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={focusOrdinal >= activeChunkCount - 1}
                        onClick={() => {
                          setFocusOrdinal((o) => o + 1);
                          setHighlight(null);
                        }}
                      >
                        下一段
                      </button>
                      )}
                    </div>
                    <button type="button" className="btn small" onClick={() => void saveSelectionAsExcerpt()}>
                      保存划选为摘录
                    </button>
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
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => void jumpExcerptToReader(ex)}
                              >
                                跳转到原文
                              </button>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => beginEditExcerpt(ex)}
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => void removeExcerpt(ex.id)}
                              >
                                删除
                              </button>
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
                            <button type="button" className="btn small primary" onClick={() => void saveExcerptEdit()}>
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => setEditingExcerptId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
    </div>
  );
}
