import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getWork, listChapters, updateChapter } from "../db/repo";
import type { Chapter, Work } from "../db/types";

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
    return chapters.filter((c) => (c.title + "\n" + (c.summary ?? "")).includes(s));
  }, [chapters, q]);

  if (!workId) {
    return (
      <div className="page">
        <p className="muted">无效地址。</p>
        <Link to="/">返回</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="page">
        <p>作品不存在。</p>
        <Link to="/">返回</Link>
      </div>
    );
  }

  return (
    <div className="page summary-overview-page">
      <header className="page-header">
        <div>
          <Link to={`/work/${workId}`} className="back-link">
            ← 返回编辑
          </Link>
          <h1>概要总览 · {work.title}</h1>
        </div>
      </header>

      <div className="summary-overview-controls">
        <input
          type="search"
          placeholder="搜索章节标题/概要…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="muted small">
          {filtered.length} / {chapters.length}
        </span>
      </div>

      <ul className="summary-overview-list">
        {filtered.map((c) => (
          <li key={c.id} className="summary-overview-item">
            <div className="summary-overview-head">
              <Link to={`/work/${workId}?chapter=${c.id}`} className="summary-overview-title">
                {c.title}
              </Link>
              <span className="muted small">{(c.summary ?? "").trim() ? "已写概要" : "未写概要"}</span>
            </div>
            <textarea
              value={c.summary ?? ""}
              onChange={(e) =>
                setChapters((prev) => prev.map((x) => (x.id === c.id ? { ...x, summary: e.target.value } : x)))
              }
              onBlur={() => void updateChapter(c.id, { summary: c.summary ?? "" })}
              rows={4}
              placeholder="（可空）"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

