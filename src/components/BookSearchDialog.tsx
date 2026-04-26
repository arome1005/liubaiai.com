import { useState } from "react";
import type { BookSearchHit, BookSearchScope } from "../db/types";

export interface BookSearchDialogProps {
  open: boolean;
  initialQuery: string;
  onSearch: (query: string, scope: BookSearchScope, isRegex: boolean) => Promise<BookSearchHit[]>;
  onJumpToHit: (hit: BookSearchHit, query: string, isRegex: boolean) => void;
  onClose: () => void;
}

export function BookSearchDialog({ open, initialQuery, onSearch, onJumpToHit, onClose }: BookSearchDialogProps) {
  if (!open) return null;
  return (
    <BookSearchDialogInner
      initialQuery={initialQuery}
      onSearch={onSearch}
      onJumpToHit={onJumpToHit}
      onClose={onClose}
    />
  );
}

function BookSearchDialogInner({
  initialQuery,
  onSearch,
  onJumpToHit,
  onClose,
}: Omit<BookSearchDialogProps, "open">) {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<BookSearchScope>("full");
  const [isRegex, setIsRegex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<BookSearchHit[] | null>(null);

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const result = await onSearch(q, scope, isRegex);
      setHits(result);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
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
              checked={scope === "full"}
              onChange={() => setScope("full")}
            />
            全书
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="bookSearchScope"
              checked={scope === "beforeProgress"}
              onChange={() => setScope("beforeProgress")}
            />
            仅进度前
          </label>
          <label className="radio-label" title="将搜索词作为正则表达式解析">
            <input
              type="checkbox"
              checked={isRegex}
              onChange={(e) => {
                setIsRegex(e.target.checked);
                setHits(null);
              }}
            />
            正则
          </label>
        </div>
        <div className="modal-row">
          <input
            type="search"
            className="modal-input"
            placeholder={isRegex ? "正则表达式，如 他[^，]*说" : "关键词"}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHits(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch();
            }}
          />
          <button type="button" className="btn primary small" onClick={() => void handleSearch()}>
            搜索
          </button>
        </div>
        {loading ? (
          <p className="muted small">搜索中…</p>
        ) : hits === null ? null : hits.length === 0 && query.trim() ? (
          <p className="muted small">无匹配。</p>
        ) : (
          <ul className="book-search-list">
            {hits.map((h) => (
              <li key={h.chapterId}>
                <button
                  type="button"
                  className="book-search-hit"
                  onClick={() => onJumpToHit(h, query.trim(), isRegex)}
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
          <button type="button" className="btn ghost small" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
