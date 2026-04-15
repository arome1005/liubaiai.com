import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WorkFormModal } from "../components/WorkFormModal";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { createChapter, createWork, deleteWork, listChapters, listWorks, updateChapter, updateWork } from "../db/repo";
import type { Work } from "../db/types";
import { cn } from "../lib/utils";
import { exportWorkAsMergedMarkdown } from "../storage/backup";
import { importWorkFromFile } from "../storage/import-work";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import { computeWorkLibraryStat, type WorkLibraryStat } from "../util/work-library-stat";

const LS_LIBRARY_VIEW = "liubai:libraryViewMode";
const LS_LIBRARY_SORT = "liubai:librarySort";
const LS_PINNED_WORKS = "liubai:pinnedWorkIds";
const LS_WORK_CUSTOM_ORDER = "liubai:workCustomOrder";

type LibraryViewMode = "grid" | "list";
type LibrarySortMode = "updated" | "title";

type WorkModalState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; work: Work };

const COVER_MAX_FILE_BYTES = 400 * 1024;
const COVER_MAX_DATA_URL_CHARS = 520_000;

function readImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件。"));
  }
  if (file.size > COVER_MAX_FILE_BYTES) {
    return Promise.reject(new Error("封面图片请小于 400KB。"));
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      if (s.length > COVER_MAX_DATA_URL_CHARS) {
        reject(new Error("图片编码后过大，请换一张更小的图。"));
        return;
      }
      resolve(s);
    };
    r.onerror = () => reject(new Error("读取图片失败。"));
    r.readAsDataURL(file);
  });
}


function fmtWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万字`;
  return `${n.toLocaleString()}字`;
}

function coverHue(workId: string): number {
  let h = 0;
  for (let i = 0; i < workId.length; i++) h = (h * 31 + workId.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [stats, setStats] = useState<Record<string, WorkLibraryStat>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const coverPickWorkIdRef = useRef<string | null>(null);
  const importChapterFileRef = useRef<HTMLInputElement>(null);
  const importChapterWorkIdRef = useRef<string | null>(null);
  const closeMoreMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openMoreMenuId, setOpenMoreMenuId] = useState<string | null>(null);
  const [workCustomOrder, setWorkCustomOrder] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(LS_WORK_CUSTOM_ORDER);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [workModal, setWorkModal] = useState<WorkModalState>({ open: false });
  const [activeTab, setActiveTab] = useState<"works" | "archived" | "trash">("works");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    try {
      const v = localStorage.getItem(LS_LIBRARY_VIEW);
      return v === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [sortMode, setSortMode] = useState<LibrarySortMode>(() => {
    try {
      const v = localStorage.getItem(LS_LIBRARY_SORT);
      return v === "title" ? "title" : "updated";
    } catch {
      return "updated";
    }
  });
  const [pinnedWorkIds, setPinnedWorkIds] = useState<Set<string>>(() => {
    try {
      const v = localStorage.getItem(LS_PINNED_WORKS);
      return new Set(v ? (JSON.parse(v) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_LIBRARY_VIEW, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LIBRARY_SORT, sortMode);
    } catch {
      /* ignore */
    }
  }, [sortMode]);

  const loadStats = useCallback(async (list: Work[]) => {
    setStatsLoading(true);
    try {
      const entries = await Promise.all(
        list.map(async (w) => {
          const chapters = await listChapters(w.id);
          return [w.id, computeWorkLibraryStat(w, chapters)] as const;
        }),
      );
      setStats(Object.fromEntries(entries));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const list = await listWorks();
    setWorks(list);
    void loadStats(list);
  }, [loadStats]);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  async function handleWorkModalSubmit(payload: { title: string; tags: string[] }) {
    if (!workModal.open) return;
    if (workModal.mode === "create") {
      const w = await createWork(payload.title, { tags: payload.tags });
      setWorkModal({ open: false });
      await refresh();
      window.location.href = `/work/${w.id}`;
      return;
    }
    await updateWork(workModal.work.id, {
      title: payload.title,
      tags: payload.tags.length > 0 ? payload.tags : [],
    });
    setWorkModal({ open: false });
    await refresh();
  }

  function openImportPicker() {
    fileRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    let created: Work | null = null;
    try {
      const w = await importWorkFromFile(file);
      created = w;
      setWorks((prev) => (prev.some((x) => x.id === w.id) ? prev : [w, ...prev]));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "导入失败");
    } finally {
      // 必须立即复位：refresh/loadStats 会对每部作品 listChapters，大书架/大章数可能很慢，不能挡在「导入中」后面
      setImportBusy(false);
    }
    if (created) {
      void refresh().catch(() => {});
      navigate(`/work/${created.id}`);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("删除作品及全部章节？不可恢复（除非已有备份）。")) return;
    await deleteWork(id);
    await refresh();
  }

  async function handleTrash(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("将作品移至回收站？")) return;
    await updateWork(id, { status: "deleted" });
    await refresh();
  }

  async function handleRestore(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await updateWork(id, { status: "serializing" });
    await refresh();
  }

  async function handleArchive(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await updateWork(id, { status: "archived" });
    await refresh();
  }

  function openCoverPicker(workId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    coverPickWorkIdRef.current = workId;
    coverFileRef.current?.click();
  }

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const wid = coverPickWorkIdRef.current;
    coverPickWorkIdRef.current = null;
    if (!file || !wid) return;
    try {
      const dataUrl = await readImageDataUrl(file);
      await updateWork(wid, { coverImage: dataUrl });
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "设置封面失败");
    }
  }

  async function clearCover(workId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await updateWork(workId, { coverImage: null });
    await refresh();
  }

  async function handleNewChapter(workId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ch = await createChapter(workId);
    navigate(`/work/${workId}?chapterId=${ch.id}`);
  }

  async function handleExportWork(workId: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const chapters = await listChapters(workId);
      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const blob = await exportWorkAsMergedMarkdown(
        title,
        sorted.map((ch) => ({ title: ch.title, content: ch.content ?? "" })),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "导出失败");
    }
  }

  function handleTogglePin(workId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPinnedWorkIds((prev) => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      try {
        localStorage.setItem(LS_PINNED_WORKS, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }

  function handleMoreMouseEnter(workId: string) {
    if (closeMoreMenuTimerRef.current) {
      clearTimeout(closeMoreMenuTimerRef.current);
      closeMoreMenuTimerRef.current = null;
    }
    setOpenMoreMenuId(workId);
  }

  function handleMoreMenuLeave() {
    closeMoreMenuTimerRef.current = setTimeout(() => {
      setOpenMoreMenuId(null);
    }, 300);
  }

  function closeMoreMenu() {
    if (closeMoreMenuTimerRef.current) {
      clearTimeout(closeMoreMenuTimerRef.current);
      closeMoreMenuTimerRef.current = null;
    }
    setOpenMoreMenuId(null);
  }

  function handleMoreMenuContentEnter() {
    if (closeMoreMenuTimerRef.current) {
      clearTimeout(closeMoreMenuTimerRef.current);
      closeMoreMenuTimerRef.current = null;
    }
  }

  function openImportChapterPicker(workId: string) {
    importChapterWorkIdRef.current = workId;
    importChapterFileRef.current?.click();
  }

  async function handleImportChapterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const wid = importChapterWorkIdRef.current;
    importChapterWorkIdRef.current = null;
    if (!file || !wid) return;
    try {
      const text = await file.text();
      const title = file.name.replace(/\.[^.]+$/, "") || "导入章节";
      const ch = await createChapter(wid, title);
      await updateChapter(ch.id, { content: text, title });
      navigate(`/work/${wid}?chapterId=${ch.id}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "导入章节失败");
    }
  }

  function handleMoveWork(workId: string, dir: "up" | "down") {
    const allIds = works
      .slice()
      .sort((a, b) => {
        if (workCustomOrder.length > 0) {
          const ai = workCustomOrder.indexOf(a.id);
          const bi = workCustomOrder.indexOf(b.id);
          const aIdx = ai === -1 ? Infinity : ai;
          const bIdx = bi === -1 ? Infinity : bi;
          if (aIdx !== bIdx) return aIdx - bIdx;
        }
        return b.updatedAt - a.updatedAt;
      })
      .map((w) => w.id);
    const idx = allIds.indexOf(workId);
    if (idx === -1) return;
    const newIdx = dir === "up" ? Math.max(0, idx - 1) : Math.min(allIds.length - 1, idx + 1);
    if (newIdx === idx) return;
    const next = [...allIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setWorkCustomOrder(next);
    try {
      localStorage.setItem(LS_WORK_CUSTOM_ORDER, JSON.stringify(next));
    } catch { /* ignore */ }
    setOpenMoreMenuId(null);
  }

  const filteredWorks = useMemo(() => {
    let list = [...works].filter((w) => {
      if (activeTab === "archived") return w.status === "archived";
      if (activeTab === "trash") return (w.status as string) === "deleted";
      return w.status !== "archived" && (w.status as string) !== "deleted";
    });
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
      );
    }
    if (sortMode === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
    } else if (workCustomOrder.length > 0 && !searchQuery.trim()) {
      list.sort((a, b) => {
        const ai = workCustomOrder.indexOf(a.id);
        const bi = workCustomOrder.indexOf(b.id);
        const aIdx = ai === -1 ? Infinity : ai;
        const bIdx = bi === -1 ? Infinity : bi;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return b.updatedAt - a.updatedAt;
      });
    } else {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    // pinned works float to top
    list.sort((a, b) => {
      const ap = pinnedWorkIds.has(a.id) ? 0 : 1;
      const bp = pinnedWorkIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
    return list;
  }, [works, activeTab, searchQuery, sortMode, pinnedWorkIds, workCustomOrder]);

  const libraryTotals = useMemo(() => {
    let totalWords = 0;
    for (const w of works) {
      const s = stats[w.id];
      if (s) totalWords += s.totalWords;
    }
    return { workCount: works.length, totalWords };
  }, [works, stats]);

  const aggregateStats = useMemo(() => {
    let totalChapters = 0;
    let worksWithChapters = 0;
    for (const w of works) {
      const s = stats[w.id];
      if (!s) continue;
      totalChapters += s.chapterCount;
      if (s.chapterCount > 0) worksWithChapters += 1;
    }
    const tw = libraryTotals.totalWords;
    const wan = tw >= 10000 ? (tw / 10000).toFixed(1) : (tw / 10000).toFixed(2);
    return { totalChapters, worksWithChapters, wan };
  }, [works, stats, libraryTotals.totalWords]);

  if (loading) {
    return (
      <div className="page library-page library-page--bleed-top">
        <div className="border-b border-border/40 bg-card/30 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">我的作品</h1>
          <p className="mt-2 text-sm text-muted-foreground">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page library-page library-page--bleed-top flex min-h-0 flex-col"
      data-library-page="topbar-v1"
    >
      <WorkFormModal
        open={workModal.open}
        variant={workModal.open && workModal.mode === "edit" ? "edit" : "create"}
        initialTitle={workModal.open && workModal.mode === "edit" ? workModal.work.title : "新作品"}
        initialTagLine={
          workModal.open && workModal.mode === "edit" ? (workModal.work.tags?.join("、") ?? "") : ""
        }
        onClose={() => setWorkModal({ open: false })}
        onSubmit={(p) => void handleWorkModalSubmit(p)}
      />

      <input
        ref={fileRef}
        name="importWorkFile"
        type="file"
        accept=".txt,.md,.markdown,.docx,text/plain"
        className="visually-hidden"
        aria-hidden
        onChange={(ev) => void handleImportFile(ev)}
      />
      <input
        ref={coverFileRef}
        name="libraryCoverFile"
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-hidden
        onChange={(ev) => void handleCoverFile(ev)}
      />
      <input
        ref={importChapterFileRef}
        name="importChapterFile"
        type="file"
        accept=".txt,.md,.markdown,text/plain"
        className="visually-hidden"
        aria-hidden
        onChange={(ev) => void handleImportChapterFile(ev)}
      />

      {/* 顶栏大版块被移除，统计数据浓缩至下方工具栏的悬浮按钮中 */}

      {works.length === 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border/40 bg-card/20 px-4 py-2 sm:px-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={importBusy} onClick={openImportPicker}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
                {importBusy ? "导入中…" : "导入作品"}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              支持txt、docx 等格式导入
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-card/20 px-4 pt-3 pb-0 sm:px-6 min-h-[56px]"
        role="toolbar"
      >
        <div className="flex items-center gap-6 text-sm font-medium self-end -mb-[1px]">
          <button
            type="button"
            className={cn("flex items-center gap-1.5 pb-2 border-b-2 transition-colors", activeTab === "works" ? "border-green-600 text-green-600" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab("works")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
            作品
          </button>
          <button
            type="button"
            className={cn("flex items-center gap-1.5 pb-2 border-b-2 transition-colors", activeTab === "archived" ? "border-green-600 text-green-600" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab("archived")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
            已归档
          </button>
          <button
            type="button"
            className={cn("flex items-center gap-1.5 pb-2 border-b-2 transition-colors", activeTab === "trash" ? "border-green-600 text-green-600" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab("trash")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            回收站
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 pb-2">
          {works.length > 0 && (
            <div className="relative min-w-0 w-36 sm:w-48 shrink-0 transition-all mr-1">
              <label className="visually-hidden" htmlFor="library-search-input">搜索作品名称</label>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Input
                id="library-search-input"
                type="search"
                className="library-toolbar-search min-w-0 border-border bg-background/50 pl-9 pr-8 shadow-sm text-sm h-8 rounded-full"
                placeholder="搜索作品…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                  title="清除搜索"
                  aria-label="清除搜索"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              ) : null}
            </div>
          )}

          <div className="library-toolbar-seg" role="group" aria-label="排序">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sortMode === "updated" ? "is-on" : undefined}
              aria-pressed={sortMode === "updated"}
              onClick={() => setSortMode("updated")}
            >
              最近更新
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={sortMode === "title" ? "is-on" : undefined}
              aria-pressed={sortMode === "title"}
              onClick={() => setSortMode("title")}
            >
              书名
            </Button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1" role="group" aria-label="视图">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 min-w-7 px-2", viewMode === "grid" && "is-on")}
              aria-pressed={viewMode === "grid"}
              title="网格"
              onClick={() => setViewMode("grid")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 min-w-7 px-2", viewMode === "list" && "is-on")}
              aria-pressed={viewMode === "list"}
              title="列表"
              onClick={() => setViewMode("list")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="8" x2="21" y1="6" y2="6" />
                <line x1="8" x2="21" y1="12" y2="12" />
                <line x1="8" x2="21" y1="18" y2="18" />
                <line x1="3" x2="3.01" y1="6" y2="6" />
                <line x1="3" x2="3.01" y1="12" y2="12" />
                <line x1="3" x2="3.01" y1="18" y2="18" />
              </svg>
            </Button>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0 border-border/50 bg-background/50 text-primary hover:bg-primary/5 hover:text-primary transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-3 py-1.5 px-3 text-xs shadow-md border-border/50 bg-popover/95 backdrop-blur-md">
              <div className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                <span className="font-medium">{libraryTotals.workCount}</span> 作品
              </div>
              <div className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>
                <span className="font-medium">{aggregateStats.wan}</span> 万字
              </div>
              <div className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.84 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
                <span className="font-medium">{aggregateStats.totalChapters}</span> 章
              </div>
            </TooltipContent>
          </Tooltip>

          </div>
        </div>

      {statsLoading && works.length > 0 ? (
        <p className="muted small mb-3 px-1">正在统计字数与进度…</p>
      ) : null}
      {works.length === 0 && activeTab === "works" ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <svg
            className="h-16 w-16 text-muted-foreground/30"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-1.42-1.42A2 2 0 0 0 7.11 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2Z" />
            <path d="M2 10h20" />
          </svg>
          <h2 className="mt-4 text-lg font-medium text-foreground">开始你的创作之旅</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">点击下方按钮创建第一部作品，或使用上方「导入作品」。</p>
          <Button type="button" className="mt-6 gap-2" onClick={() => setWorkModal({ open: true, mode: "create" })}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            新建作品
          </Button>
        </div>
      ) : filteredWorks.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <p className="text-foreground">未找到匹配的作品</p>
          <p className="mt-1 text-sm text-muted-foreground">尝试调整搜索词，或清除筛选。</p>
          <Button type="button" variant="outline" className="mt-4 gap-2" onClick={() => setSearchQuery("")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            清除搜索
          </Button>
        </div>
      ) : (
        <ul className={"library-work-grid" + (viewMode === "list" ? " library-work-grid--list" : "")}>
          {filteredWorks.map((w) => {
            const s = stats[w.id];
            const hue = coverHue(w.id);
            const rel = formatRelativeUpdateMs(w.updatedAt);
            return (
              <li key={w.id} className="library-work-card-wrap">
                <Link to={`/work/${w.id}`} className="library-work-card-main">
                  <div className="library-work-card-cover">
                    {w.coverImage ? (
                      <img src={w.coverImage} alt="" className="library-work-card-cover-img" />
                    ) : (
                      <div
                        className="library-work-card-cover-placeholder"
                        style={{
                          background: `linear-gradient(145deg, hsl(${hue} 40% 28%), hsl(${(hue + 35) % 360} 35% 18%))`,
                        }}
                        aria-hidden
                      >
                        <svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-[72%] w-auto">
                          <path d="M39 7 L9 3 L9 57 L39 61 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.88"/>
                          <rect x="15" y="11" width="5.5" height="37" fill="white" opacity="0.88" rx="0.4"/>
                          <rect x="15" y="43" width="18" height="5.5" fill="white" opacity="0.88" rx="0.4"/>
                          <path d="M41 7 L71 3 L71 57 L41 61 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" opacity="0.88"/>
                          <text x="40" y="77" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="serif" letterSpacing="1.5" opacity="0.82">留白写作</text>
                          <text x="40" y="89" textAnchor="middle" fill="white" fontSize="4.8" fontFamily="sans-serif" letterSpacing="2.2" opacity="0.45">LIUBAI WRITING</text>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="library-work-card-body">
                    <span className="library-work-card-title" title={w.title}>
                      {w.title}
                    </span>
                    {w.tags && w.tags.length > 0 ? (
                      <div className="library-work-card-tags" aria-label="作品标签">
                        {w.tags.map((tag, i) => (
                          <span key={`${i}-${tag}`} className="library-work-card-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="library-work-card-meta muted small">
                      {s ? (
                        <>
                          {s.chapterCount} 章 · {fmtWords(s.totalWords)} · {rel}
                        </>
                      ) : (
                        <>更新 {rel}</>
                      )}
                    </div>
                    {s && s.progressPercent > 0 ? (
                      <div className="library-work-progress-block">
                        <div className="library-work-progress-label small">
                          进度：<span className="library-work-progress-chapter">{s.progressChapterTitle}</span>
                          <span className="muted"> · {s.progressPercent}%</span>
                        </div>
                        <div
                          className="library-work-progress-bar"
                          role="progressbar"
                          aria-valuenow={s.progressPercent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="写作进度游标在全书中的位置"
                        >
                          <div
                            className="library-work-progress-fill"
                            style={{ width: `${s.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Link>
                <div className="library-work-card-toolbar">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/work/${w.id}`} title="进入写作页">
                      写作
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="编辑书名与留白标签"
                    onClick={() => setWorkModal({ open: true, mode: "edit", work: w })}
                  >
                    标签
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="在本书新建章节并进入"
                    onClick={(e) => void handleNewChapter(w.id, e)}
                  >
                    新建章节
                  </Button>
                  <DropdownMenu open={openMoreMenuId === w.id}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        title="更多操作"
                        className="text-[0.65rem] min-h-[1.5rem] px-[0.35rem] py-[0.1rem]"
                        onMouseEnter={() => handleMoreMouseEnter(w.id)}
                        onMouseLeave={handleMoreMenuLeave}
                      >
                        更多
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-32"
                      onMouseEnter={handleMoreMenuContentEnter}
                      onMouseLeave={handleMoreMenuLeave}
                      onPointerDownOutside={closeMoreMenu}
                      onEscapeKeyDown={closeMoreMenu}
                    >
                      <DropdownMenuItem onClick={() => { openImportChapterPicker(w.id); closeMoreMenu(); }}>
                        导入章节
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { void handleExportWork(w.id, w.title, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                      >
                        作品导出
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { openCoverPicker(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                      >
                        {w.coverImage ? "更换封面" : "上传封面"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => { handleTogglePin(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                      >
                        {pinnedWorkIds.has(w.id) ? "取消置顶" : "置顶"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {w.status === "deleted" ? (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => { void handleRestore(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                          >
                            恢复作品
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={(e) => { void handleDelete(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                          >
                            彻底删除
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          {w.status === "archived" ? (
                            <DropdownMenuItem
                              onClick={(e) => { void handleRestore(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                            >
                              取消归档
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => { void handleArchive(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                            >
                              归档作品
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={(e) => { void handleTrash(w.id, e as unknown as React.MouseEvent); closeMoreMenu(); }}
                          >
                            移至回收站
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
          {viewMode === "grid" ? (
            <li key="__library_new__" className="library-work-new-li">
              <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border-2 border-dashed border-border/40 bg-card/20 transition-colors hover:border-primary/50 hover:bg-card/40">
                <button
                  type="button"
                  className="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center transition-colors hover:bg-card/60"
                  onClick={() => setWorkModal({ open: true, mode: "create" })}
                >
                  <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-xl bg-muted/60 transition-transform hover:scale-105">
                    <svg viewBox="0 0 80 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-auto opacity-55">
                      <path d="M39 5 L9 2 L9 50 L39 53 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
                      <rect x="15" y="9" width="5" height="32" fill="currentColor" rx="0.3"/>
                      <rect x="15" y="36.5" width="16" height="5" fill="currentColor" rx="0.3"/>
                      <path d="M41 5 L71 2 L71 50 L41 53 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
                    </svg>
                    <span className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                    </span>
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">新建作品</span>
                </button>
                <div className="mx-4 h-px shrink-0 bg-border/40" />
                <button
                  type="button"
                  className="flex h-12 shrink-0 items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
                  disabled={importBusy}
                  onClick={openImportPicker}
                  title="支持 txt、docx 等格式"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" x2="12" y1="3" y2="15" />
                  </svg>
                  {importBusy ? "导入中…" : "导入作品"}
                </button>
              </div>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
