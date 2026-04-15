import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";
import { getWork, isChapterSaveConflictError, listChapters, updateChapter } from "../db/repo";
import type { Chapter, Work } from "../db/types";
import { formatSummaryScope, formatSummaryUpdatedAt, isSummaryStale } from "../util/summary-meta";

export function SummaryOverviewPage() {
  const { workId } = useParams<{ workId: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workId) return;
    void (async () => {
      setLoading(true);
      try {
        const w = await getWork(workId);
        setWork(w ?? null);
        const ch = await listChapters(workId);
        setChapters(ch);
      } finally {
        setLoading(false);
      }
    })();
  }, [workId]);

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

  if (!workId) {
    return (
      <div className={cn("page summary-overview-page flex flex-col gap-4")}>
        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-6 shadow-sm sm:px-6">
          <p className="muted">无效地址。</p>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/library">返回作品库</Link>
          </Button>
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
          <Link to={`/work/${workId}`} className="back-link summary-overview-back">
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
            <Link to={`/work/${workId}/bible`}>锦囊</Link>
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
                  <Link to={`/work/${workId}?chapter=${c.id}`} className="summary-overview-title">
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
                  </div>
                </div>
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
                      } catch (e) {
                        if (isChapterSaveConflictError(e)) {
                          window.alert("该章已在其它窗口更新，将重新拉取列表。");
                          const list = await listChapters(workId);
                          setChapters(list);
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
