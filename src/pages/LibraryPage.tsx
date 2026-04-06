import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { WorkFormModal } from "../components/WorkFormModal";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { createWork, deleteWork, listChapters, listWorks, updateWork } from "../db/repo";
import type { Work } from "../db/types";
import { cn } from "../lib/utils";
import { importWorkFromFile } from "../storage/import-work";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import { computeWorkLibraryStat, type WorkLibraryStat } from "../util/work-library-stat";

const LS_LIBRARY_VIEW = "liubai:libraryViewMode";
const LS_LIBRARY_SORT = "liubai:librarySort";

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

function coverPlaceholderHue(workId: string): number {
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
  const [workModal, setWorkModal] = useState<WorkModalState>({ open: false });
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
    try {
      const w = await importWorkFromFile(file);
      setImportBusy(false);
      setWorks((prev) => (prev.some((x) => x.id === w.id) ? prev : [w, ...prev]));
      void refresh().catch(() => {});
      navigate(`/work/${w.id}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "导入失败");
      setImportBusy(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("删除作品及全部章节？不可恢复（除非已有备份）。")) return;
    await deleteWork(id);
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

  const filteredWorks = useMemo(() => {
    let list = [...works];
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
    } else {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return list;
  }, [works, searchQuery, sortMode]);

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
      <div className="page library-page">
        <div className="border-b border-border/40 bg-card/30 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">我的作品</h1>
          <p className="mt-2 text-sm text-muted-foreground">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page library-page flex min-h-0 flex-col">
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

      {/* §E.2.2：对齐 v0「留白」页眉 + 统计卡（`liubai-module`） */}
      <div className="border-b border-border/40 bg-card/30 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">我的作品</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理你的创作，开启新的故事</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={importBusy} onClick={openImportPicker}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              {importBusy ? "导入中…" : "导入作品"}
            </Button>
            <Button type="button" variant="default" size="sm" className="gap-1.5" onClick={() => setWorkModal({ open: true, mode: "create" })}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              新建作品
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{libraryTotals.workCount}</p>
                <p className="text-xs text-muted-foreground">作品总数</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{aggregateStats.worksWithChapters}</p>
                <p className="text-xs text-muted-foreground">有章节作品</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{aggregateStats.wan}</p>
                <p className="text-xs text-muted-foreground">万字累计</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.84 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                  <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{aggregateStats.totalChapters}</p>
                <p className="text-xs text-muted-foreground">章节总数</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {works.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/40 bg-card/20 px-4 py-3 sm:px-6"
          role="search"
        >
          <label className="visually-hidden" htmlFor="library-search-input">
            搜索作品（书名或留白标签）
          </label>
          <div className="relative min-w-0 max-w-md flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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
              className={cn(
                "library-toolbar-search min-w-0 border-border bg-background/50 pl-9 shadow-sm md:text-sm",
                "pr-9",
              )}
              placeholder="搜索作品名称、标签…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
                title="清除搜索"
                aria-label="清除搜索"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            ) : null}
          </div>
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
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/50 p-1 sm:ml-0" role="group" aria-label="视图">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn("h-7 min-w-7 px-2", viewMode === "grid" && "is-on")}
              aria-pressed={viewMode === "grid"}
              title="网格"
              onClick={() => setViewMode("grid")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:mr-1" aria-hidden>
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              <span className="hidden sm:inline">网格</span>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:mr-1" aria-hidden>
                <line x1="8" x2="21" y1="6" y2="6" />
                <line x1="8" x2="21" y1="12" y2="12" />
                <line x1="8" x2="21" y1="18" y2="18" />
                <line x1="3" x2="3.01" y1="6" y2="6" />
                <line x1="3" x2="3.01" y1="12" y2="12" />
                <line x1="3" x2="3.01" y1="18" y2="18" />
              </svg>
              <span className="hidden sm:inline">列表</span>
            </Button>
          </div>
        </div>
      ) : null}

      <p className="import-hint muted small mt-4 px-1">
        支持从 <strong>.txt</strong>、<strong>.md</strong>、<strong>.docx</strong> 导入为新作品。Markdown
        可用「## 章节名」分章；纯文本也会尝试按「第X章/回/卷、序章、楔子、后记…」自动切章；首行「# 书名」
        可作为作品标题。.doc 请先另存为 .docx。
      </p>
      {statsLoading && works.length > 0 ? (
        <p className="muted small mb-3 px-1">正在统计字数与进度…</p>
      ) : null}
      {works.length === 0 ? (
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
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">点击下方按钮创建第一部作品，或使用顶栏「导入作品」。</p>
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
            const hue = coverPlaceholderHue(w.id);
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
                          background: `linear-gradient(135deg, hsl(${hue} 42% 42%), hsl(${(hue + 40) % 360} 38% 28%))`,
                        }}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="library-work-card-body">
                    <span className="library-work-card-title">{w.title}</span>
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
                          {s.chapterCount} 章 · {s.totalWords.toLocaleString()} 字 · {rel}
                        </>
                      ) : (
                        <>更新 {rel}</>
                      )}
                    </div>
                    {s ? (
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
                    title="上传封面（宜小于 400KB）"
                    onClick={(e) => openCoverPicker(w.id, e)}
                  >
                    封面
                  </Button>
                  {w.coverImage ? (
                    <Button type="button" variant="ghost" size="sm" onClick={(e) => void clearCover(w.id, e)}>
                      清除封面
                    </Button>
                  ) : null}
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/work/${w.id}/bible`} title="创作圣经">
                      圣经
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    title="删除"
                    onClick={(e) => void handleDelete(w.id, e)}
                  >
                    删除
                  </Button>
                </div>
              </li>
            );
          })}
          {viewMode === "grid" ? (
            <li key="__library_new__">
              <button
                type="button"
                className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/40 bg-card/20 p-6 text-center transition-colors hover:border-primary/50 hover:bg-card/50"
                onClick={() => setWorkModal({ open: true, mode: "create" })}
              >
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform hover:scale-105">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                </span>
                <span className="text-sm text-muted-foreground">新建作品</span>
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
