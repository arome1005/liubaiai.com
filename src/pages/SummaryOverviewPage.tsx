import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, Navigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";
import { getWork, isChapterSaveConflictError, listChapters, updateChapter } from "../db/repo";
import { useResolvedWorkFromRoute } from "../hooks/useResolvedWorkFromRoute";
import { workPathSegment } from "../util/work-url";
import type { Chapter, Work } from "../db/types";
import { formatSummaryScope, formatSummaryUpdatedAt, isSummaryStale } from "../util/summary-meta";
import { generateChapterSummaryWithRetry, ChapterSummaryGenerationError } from "../ai/chapter-summary-generate";

type SummaryHistorySource = "manual" | "ai_draft" | "restore";
type SummaryHistoryItem = {
  id: string;
  savedAt: number;
  summary: string;
  source: SummaryHistorySource;
  scopeFromOrder: number | null;
  scopeToOrder: number | null;
};

function summaryHistoryKey(workId: string, chapterId: string): string {
  return `liubai:summaryHistory:v1:${workId}:${chapterId}`;
}

function loadSummaryHistory(workId: string, chapterId: string): SummaryHistoryItem[] {
  try {
    const raw = localStorage.getItem(summaryHistoryKey(workId, chapterId));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => typeof x === "object" && x !== null)
      .map((x) => x as Partial<SummaryHistoryItem>)
      .filter((x) => typeof x.id === "string" && typeof x.savedAt === "number" && typeof x.summary === "string")
      .map((x) => ({
        id: x.id!,
        savedAt: x.savedAt!,
        summary: x.summary!,
        source: (x.source as SummaryHistorySource) ?? "manual",
        scopeFromOrder: typeof x.scopeFromOrder === "number" ? x.scopeFromOrder : null,
        scopeToOrder: typeof x.scopeToOrder === "number" ? x.scopeToOrder : null,
      }));
  } catch {
    return [];
  }
}

function saveSummaryHistory(workId: string, chapterId: string, items: SummaryHistoryItem[]): void {
  try {
    localStorage.setItem(summaryHistoryKey(workId, chapterId), JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function pushSummaryHistory(workId: string, chapterId: string, item: SummaryHistoryItem, maxKeep = 20): void {
  const cur = loadSummaryHistory(workId, chapterId);
  const next = [item, ...cur].slice(0, Math.max(1, Math.min(100, maxKeep)));
  saveSummaryHistory(workId, chapterId, next);
}

export function SummaryOverviewPage() {
  const { resolvedWorkId, phase } = useResolvedWorkFromRoute();
  const workId = phase === "ok" && resolvedWorkId ? resolvedWorkId : null;
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // ── AI 生成概要（P1-1） ────────────────────────────────────────────────
  type SummaryGenScope = "chapter" | "recent" | "all";
  const [genScope, setGenScope] = useState<SummaryGenScope>("chapter");
  const [genRecentN, setGenRecentN] = useState(5);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const genAbortRef = useRef<AbortController | null>(null);
  const [draftByChapterId, setDraftByChapterId] = useState<Record<string, string>>({});
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [applyBusy, setApplyBusy] = useState<Record<string, boolean>>({});
  const lastSavedSummaryRef = useRef<Record<string, string>>({});
  const [historyOpenChapterId, setHistoryOpenChapterId] = useState<string | null>(null);
  const [historyByChapterId, setHistoryByChapterId] = useState<Record<string, SummaryHistoryItem[]>>({});

  useEffect(() => {
    if (phase === "notfound") return;
    if (phase === "loading" || !workId) return;
    void (async () => {
      setLoading(true);
      try {
        const w = await getWork(workId);
        setWork(w ?? null);
        const ch = await listChapters(workId);
        setChapters(ch);
        lastSavedSummaryRef.current = Object.fromEntries(ch.map((c) => [c.id, c.summary ?? ""] as const));
      } finally {
        setLoading(false);
      }
    })();
  }, [workId, phase]);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return chapters;
    const needle = s.toLowerCase();
    return chapters.filter((c) => (c.title + "\n" + (c.summary ?? "")).toLowerCase().includes(needle));
  }, [chapters, q]);

  const overviewStats = useMemo(() => {
    let withSummary = 0;
    let staleCount = 0;
    for (const c of chapters) {
      const hasSummary = (c.summary ?? "").trim().length > 0;
      const hasContent = (c.content ?? "").trim().length > 0;
      if (hasSummary) withSummary++;
      if (isSummaryStale({ contentUpdatedAt: c.updatedAt, summaryUpdatedAt: c.summaryUpdatedAt, hasContent, hasSummary })) staleCount++;
    }
    return { total: chapters.length, withSummary, staleCount };
  }, [chapters]);

  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const chaptersByOrder = useMemo(() => [...chapters].sort((a, b) => a.order - b.order), [chapters]);

  function isAbortError(err: unknown): boolean {
    return (
      (err instanceof DOMException && err.name === "AbortError") ||
      (typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "AbortError")
    );
  }

  function targetsForScope(scope: SummaryGenScope): Chapter[] {
    if (chaptersByOrder.length === 0) return [];
    if (scope === "all") return chaptersByOrder;
    if (scope === "recent") {
      const n = Math.max(1, Math.min(50, Math.floor(genRecentN || 0)));
      return chaptersByOrder.slice(Math.max(0, chaptersByOrder.length - n));
    }
    // chapter：优先使用筛选后的第一章；否则用全书第一章
    const base = (filtered[0] ?? chaptersByOrder[0]) ? [filtered[0] ?? chaptersByOrder[0]!] : [];
    return base;
  }

  async function runGenerateSummaries() {
    if (!workId || !work) return;
    const targets = targetsForScope(genScope);
    if (targets.length === 0) {
      setGenErr("没有可生成的章节。");
      return;
    }

    setGenErr(null);
    setGenBusy(true);
    const ctrl = new AbortController();
    genAbortRef.current?.abort();
    genAbortRef.current = ctrl;

    // 清空本轮草稿（避免混淆）
    setDraftByChapterId({});
    setDraftOrder([]);

    try {
      const drafts: Record<string, string> = {};
      const order: string[] = [];
      for (const c of targets) {
        if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (!(c.content ?? "").trim()) continue;
        const text = await generateChapterSummaryWithRetry({
          workTitle: work.title,
          chapterTitle: c.title,
          chapterContent: c.content,
          signal: ctrl.signal,
        });
        drafts[c.id] = text;
        order.push(c.id);
        setDraftByChapterId((prev) => ({ ...prev, [c.id]: text }));
        setDraftOrder((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
      }
      if (order.length === 0) {
        setGenErr("选定范围内没有可生成概要的正文内容。");
      }
      // keep local vars to satisfy lint (future use)
      void drafts;
    } catch (e) {
      if (isAbortError(e)) return;
      if (e instanceof ChapterSummaryGenerationError) {
        setGenErr(e.message);
      } else {
        setGenErr(e instanceof Error ? e.message : "生成失败");
      }
    } finally {
      setGenBusy(false);
      if (genAbortRef.current === ctrl) genAbortRef.current = null;
    }
  }

  async function applyDraftToChapter(chapterId: string) {
    const draft = (draftByChapterId[chapterId] ?? "").trim();
    if (!draft) return;
    const cur = byId.get(chapterId);
    if (!cur || !workId) return;
    const ok = window.confirm(`覆盖章节「${cur.title}」的当前概要？（将写入并更新元数据）`);
    if (!ok) return;
    setApplyBusy((prev) => ({ ...prev, [chapterId]: true }));
    try {
      const t = Date.now();
      // 写入前：把"旧概要"存入历史（避免误覆盖）
      const prevSummary = lastSavedSummaryRef.current[chapterId] ?? (cur.summary ?? "");
      if ((prevSummary ?? "").trim()) {
        pushSummaryHistory(workId, chapterId, {
          id: `${t}-${Math.random().toString(16).slice(2)}`,
          savedAt: t,
          summary: prevSummary,
          source: "ai_draft",
          scopeFromOrder: cur.summaryScopeFromOrder ?? null,
          scopeToOrder: cur.summaryScopeToOrder ?? null,
        });
      }
      await updateChapter(
        chapterId,
        {
          summary: draft,
          summaryUpdatedAt: t,
          summaryScopeFromOrder: cur.order,
          summaryScopeToOrder: cur.order,
        },
        { expectedUpdatedAt: cur.updatedAt },
      );
      setChapters((prev) =>
        prev.map((x) =>
          x.id === chapterId
            ? { ...x, summary: draft, summaryUpdatedAt: t, summaryScopeFromOrder: cur.order, summaryScopeToOrder: cur.order, updatedAt: t }
            : x,
        ),
      );
      lastSavedSummaryRef.current[chapterId] = draft;
      setDraftByChapterId((prev) => {
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
      setDraftOrder((prev) => prev.filter((id) => id !== chapterId));
    } catch (e) {
      if (isChapterSaveConflictError(e)) {
        toast.error("该章已在其它窗口更新，将重新拉取列表。");
        const list = await listChapters(workId);
        setChapters(list);
        lastSavedSummaryRef.current = Object.fromEntries(list.map((c) => [c.id, c.summary ?? ""] as const));
      } else {
        toast.error(e instanceof Error ? e.message : "写入失败");
      }
    } finally {
      setApplyBusy((prev) => ({ ...prev, [chapterId]: false }));
    }
  }

  const openHistory = (chapterId: string) => {
    if (!workId) return;
    setHistoryByChapterId((prev) => ({
      ...prev,
      [chapterId]: loadSummaryHistory(workId, chapterId),
    }));
    setHistoryOpenChapterId((cur) => (cur === chapterId ? null : chapterId));
  };

  const restoreFromHistory = async (chapter: Chapter, item: SummaryHistoryItem) => {
    if (!workId) return;
    const ok = window.confirm(`回滚章节「${chapter.title}」到历史版本？（当前概要会先进入历史）`);
    if (!ok) return;
    const now = Date.now();
    const currentSaved = lastSavedSummaryRef.current[chapter.id] ?? (chapter.summary ?? "");
    if ((currentSaved ?? "").trim()) {
      pushSummaryHistory(workId, chapter.id, {
        id: `${now}-${Math.random().toString(16).slice(2)}`,
        savedAt: now,
        summary: currentSaved,
        source: "restore",
        scopeFromOrder: chapter.summaryScopeFromOrder ?? null,
        scopeToOrder: chapter.summaryScopeToOrder ?? null,
      });
    }
    try {
      await updateChapter(
        chapter.id,
        {
          summary: item.summary,
          summaryUpdatedAt: now,
          summaryScopeFromOrder: chapter.summaryScopeFromOrder ?? chapter.order,
          summaryScopeToOrder: chapter.summaryScopeToOrder ?? chapter.order,
        },
        { expectedUpdatedAt: chapter.updatedAt },
      );
      setChapters((prev) =>
        prev.map((x) => (x.id === chapter.id ? { ...x, summary: item.summary, summaryUpdatedAt: now, updatedAt: now } : x)),
      );
      lastSavedSummaryRef.current[chapter.id] = item.summary;
      setHistoryByChapterId((prev) => ({ ...prev, [chapter.id]: loadSummaryHistory(workId, chapter.id) }));
    } catch (e) {
      if (isChapterSaveConflictError(e)) {
        toast.error("该章已在其它窗口更新，将重新拉取列表。");
        const list = await listChapters(workId);
        setChapters(list);
        lastSavedSummaryRef.current = Object.fromEntries(list.map((c) => [c.id, c.summary ?? ""] as const));
      } else {
        toast.error(e instanceof Error ? e.message : "回滚失败");
      }
    }
  };

  if (phase === "notfound") {
    return <Navigate to="/library" replace />;
  }
  if (phase === "loading" || !workId) {
    return (
      <div className={cn("page summary-overview-page flex flex-col gap-4")}>
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-8 text-center shadow-sm sm:px-6">
          <p className="muted">加载中…</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("page summary-overview-page flex flex-col gap-4")}>
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-8 text-center shadow-sm sm:px-6">
          <p className="muted">加载中…</p>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className={cn("page summary-overview-page flex flex-col gap-4")}>
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-6 shadow-sm sm:px-6">
          <p>作品不存在。</p>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/library">返回作品库</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("page summary-overview-page flex flex-col gap-4")}>
      <header
        className={cn(
          "summary-overview-page-header rounded-xl border border-border/40 bg-card/30 px-4 py-5 sm:px-6 shadow-sm",
        )}
      >
        <div className="summary-overview-header-text">
          <Link to={`/work/${workPathSegment(work)}`} className="back-link summary-overview-back">
            ← 返回写作
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">概要总览</h1>
          <p className="summary-overview-work-title muted">{work.title}</p>
          {overviewStats.total > 0 ? (
            <p className="summary-overview-stats muted small">
              共 <strong>{overviewStats.total}</strong> 章 ·{" "}
              <strong>{overviewStats.withSummary}</strong> 章已写概要
              {overviewStats.staleCount > 0 && (
                <span style={{ marginLeft: 8, color: "var(--warning, #d97706)", fontWeight: 600 }}>
                  · {overviewStats.staleCount} 章概要可能过期
                </span>
              )}
            </p>
          ) : null}
        </div>
        <div className="header-actions flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/work/${workPathSegment(work)}/bible`}>锦囊</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/library">作品库</Link>
          </Button>
        </div>
      </header>

      <div className="summary-overview-main card">
      <p className="muted small summary-overview-lead">
        在此按章编辑概要正文；保存使用乐观锁（与其它窗口冲突时会提示并刷新列表）。搜索不区分大小写。
      </p>

      {/* P1-1：AI 生成概要（先草稿后覆盖确认 + 支持取消） */}
      <div className="rounded-xl border border-border/40 bg-card/20 p-4" style={{ marginBottom: 12 }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-foreground">AI 生成概要</div>
          {genBusy ? <span className="muted small">生成中…</span> : null}
          <div className="ml-auto flex gap-2">
            {genBusy ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => genAbortRef.current?.abort()}
              >
                取消
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => void runGenerateSummaries()}>
                生成草稿
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <label className="muted small">
            范围{" "}
            <select
              className="input"
              value={genScope}
              onChange={(e) => setGenScope(e.target.value as SummaryGenScope)}
              disabled={genBusy}
              style={{ width: 160, marginLeft: 6 }}
            >
              <option value="chapter">本章（当前列表第一章）</option>
              <option value="recent">最近 N 章</option>
              <option value="all">全书</option>
            </select>
          </label>
          {genScope === "recent" ? (
            <label className="muted small">
              N{" "}
              <input
                type="number"
                className="input"
                min={1}
                max={50}
                step={1}
                value={genRecentN}
                onChange={(e) => setGenRecentN(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))))}
                disabled={genBusy}
                style={{ width: 90, marginLeft: 6 }}
              />
            </label>
          ) : null}
        </div>

        {genErr ? (
          <p className="muted small" style={{ marginTop: 8, color: "var(--destructive)" }}>
            ⚠ {genErr}
          </p>
        ) : null}

        {draftOrder.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              草稿（{draftOrder.length}）——确认后才会覆盖写入
            </div>
            <div className="flex flex-col gap-10">
              {draftOrder.map((id) => {
                const c = byId.get(id);
                const draft = draftByChapterId[id] ?? "";
                if (!c) return null;
                return (
                  <div key={id} className="rounded-lg border border-border/40 bg-background/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-foreground">{c.title}</div>
                      <div className="ml-auto flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={applyBusy[id]}
                          onClick={() => void applyDraftToChapter(id)}
                        >
                          {applyBusy[id] ? "写入中…" : "确认覆盖写入"}
                        </Button>
                      </div>
                    </div>
                    <textarea
                      value={draft}
                      onChange={(e) =>
                        setDraftByChapterId((prev) => ({ ...prev, [id]: e.target.value }))
                      }
                      rows={4}
                      className="mt-2 w-full resize-y rounded-lg border border-border/40 bg-background/60 p-2 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="summary-toolbar" role="search">
        <label className="visually-hidden" htmlFor="summary-overview-search">
          搜索章节标题或概要
        </label>
        <Input
          id="summary-overview-search"
          type="search"
          className="summary-toolbar-search"
          placeholder="搜索章节标题或概要…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <span className="muted small summary-toolbar-count" aria-live="polite">
          {filtered.length} / {chapters.length} 章
        </span>
      </div>

      {chapters.length === 0 ? (
        <p className="muted summary-overview-empty">本书尚无章节，请先在写作页新建章节。</p>
      ) : filtered.length === 0 ? (
        <p className="muted summary-overview-empty">没有匹配「{q.trim()}」的章节，请调整搜索词。</p>
      ) : (
        <ul className="summary-overview-list">
          {filtered.map((c) => {
            const hasSummary = (c.summary ?? "").trim().length > 0;
            const hasContent = (c.content ?? "").trim().length > 0;
            const stale = isSummaryStale({ contentUpdatedAt: c.updatedAt, summaryUpdatedAt: c.summaryUpdatedAt, hasContent, hasSummary });
            const updatedLabel = formatSummaryUpdatedAt(c.summaryUpdatedAt);
            return (
              <li key={c.id} className="summary-overview-item">
                <div className="summary-overview-head">
                  <Link to={`/work/${workPathSegment(work)}?chapter=${c.id}`} className="summary-overview-title">
                    {c.title}
                  </Link>
                  <div className="summary-overview-meta">
                    <span className={"summary-overview-badge" + (hasSummary ? " is-on" : "")}>
                      {hasSummary ? "已写概要" : "未写概要"}
                    </span>
                    {stale && (
                      <span
                        className="summary-overview-badge"
                        style={{ background: "var(--warning-muted, #fef3c7)", color: "var(--warning, #92400e)", border: "1px solid var(--warning-border, #fde68a)" }}
                        title="正文在概要生成后已有较大更新，建议重新生成概要"
                      >
                        概要可能过期
                      </span>
                    )}
                    {formatSummaryScope(c.summaryScopeFromOrder, c.summaryScopeToOrder) ? (
                      <span className="muted small" title="概要覆盖范围">
                        {formatSummaryScope(c.summaryScopeFromOrder, c.summaryScopeToOrder)}
                      </span>
                    ) : null}
                    {updatedLabel ? (
                      <span className="muted small" title="概要上次保存时间">
                        更新 {updatedLabel}
                      </span>
                    ) : null}
                    {workId ? (
                      <button
                        type="button"
                        className="muted small"
                        style={{
                          marginLeft: 10,
                          textDecoration: "underline",
                          cursor: "pointer",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                        }}
                        onClick={() => openHistory(c.id)}
                        title="查看/回滚历史"
                      >
                        历史（{(historyByChapterId[c.id]?.length ?? loadSummaryHistory(workId, c.id).length) || 0}）
                      </button>
                    ) : null}
                  </div>
                </div>
                {historyOpenChapterId === c.id ? (
                  <div className="mt-2 rounded-lg border border-border/40 bg-background/40 p-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">概要历史（本地）</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-7 px-2 text-xs"
                        onClick={() => setHistoryOpenChapterId(null)}
                      >
                        收起
                      </Button>
                    </div>
                    {(historyByChapterId[c.id] ?? loadSummaryHistory(workId, c.id)).length === 0 ? (
                      <p className="muted small" style={{ marginTop: 6 }}>
                        暂无历史记录。每次保存/覆盖/回滚前会自动把旧概要存一份在本地。
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2">
                        {(historyByChapterId[c.id] ?? loadSummaryHistory(workId, c.id)).map((h) => (
                          <div key={h.id} className="rounded-md border border-border/40 bg-background/50 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {new Date(h.savedAt).toLocaleString("zh-CN")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {h.source === "ai_draft" ? "来源：AI 覆盖前" : h.source === "restore" ? "来源：回滚前" : "来源：手动保存前"}
                              </span>
                              <div className="ml-auto flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => void restoreFromHistory(c, h)}
                                >
                                  回滚到此版
                                </Button>
                              </div>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-4">
                              {h.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                <textarea
                  aria-label={`${c.title} 概要`}
                  value={c.summary ?? ""}
                  onChange={(e) =>
                    setChapters((prev) => prev.map((x) => (x.id === c.id ? { ...x, summary: e.target.value } : x)))
                  }
                  onBlur={() => {
                    const cur = chapters.find((x) => x.id === c.id);
                    if (!cur || !workId) return;
                    void (async () => {
                      try {
                        const t = Date.now();
                        const prevSaved = lastSavedSummaryRef.current[cur.id] ?? "";
                        const nextSummary = cur.summary ?? "";
                        if (prevSaved !== nextSummary && prevSaved.trim()) {
                          pushSummaryHistory(workId, cur.id, {
                            id: `${t}-${Math.random().toString(16).slice(2)}`,
                            savedAt: t,
                            summary: prevSaved,
                            source: "manual",
                            scopeFromOrder: cur.summaryScopeFromOrder ?? null,
                            scopeToOrder: cur.summaryScopeToOrder ?? null,
                          });
                        }
                        await updateChapter(
                          cur.id,
                          {
                            summary: cur.summary ?? "",
                            summaryUpdatedAt: t,
                            summaryScopeFromOrder: cur.summaryScopeFromOrder ?? cur.order,
                            summaryScopeToOrder: cur.summaryScopeToOrder ?? cur.order,
                          },
                          { expectedUpdatedAt: cur.updatedAt },
                        );
                        setChapters((prev) =>
                          prev.map((x) =>
                            x.id === cur.id
                              ? { ...x, summary: cur.summary ?? "", summaryUpdatedAt: t, updatedAt: t }
                              : x,
                          ),
                        );
                        lastSavedSummaryRef.current[cur.id] = cur.summary ?? "";
                      } catch (e) {
                        if (isChapterSaveConflictError(e)) {
                          toast.error("该章已在其它窗口更新，将重新拉取列表。");
                          const list = await listChapters(workId);
                          setChapters(list);
                          lastSavedSummaryRef.current = Object.fromEntries(list.map((c) => [c.id, c.summary ?? ""] as const));
                        }
                      }
                    })();
                  }}
                  rows={4}
                  placeholder="本章概要（可空）"
                />
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}
