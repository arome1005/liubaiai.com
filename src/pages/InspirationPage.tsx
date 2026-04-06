import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateInspirationFiveExpansions } from "../ai/inspiration-expand";
import {
  addInspirationFragment,
  deleteInspirationFragment,
  getWork,
  isChapterSaveConflictError,
  listChapters,
  listInspirationFragments,
  listWorks,
  updateChapter,
} from "../db/repo";
import type { Chapter, InspirationFragment, Work } from "../db/types";
import { AiInlineErrorNotice } from "../components/AiInlineErrorNotice";
import { HubAiSettingsHint } from "../components/HubAiSettingsHint";
import { formatRelativeUpdateMs } from "../util/relativeTime";
import { liuguangQuickCaptureShortcutLabel } from "../util/keyboardHints";

const LS_LAST_WORK = "liubai:lastWorkId";

type FilterScope = "all" | "unassigned" | "work";

type ExpandPanelState = {
  source: InspirationFragment;
  hint: string;
  busy: boolean;
  error: string | null;
  segments: string[] | null;
};

export function InspirationPage() {
  const [works, setWorks] = useState<Work[]>([]);
  const [fragments, setFragments] = useState<InspirationFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filterScope, setFilterScope] = useState<FilterScope>("all");
  const [filterWorkId, setFilterWorkId] = useState<string | null>(null);
  const [newBody, setNewBody] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newWorkId, setNewWorkId] = useState<string>("");
  const [expandPanel, setExpandPanel] = useState<ExpandPanelState | null>(null);
  const expandAbortRef = useRef<AbortController | null>(null);
  const [transferFragment, setTransferFragment] = useState<InspirationFragment | null>(null);
  const [transferWorkId, setTransferWorkId] = useState("");
  const [transferChapterId, setTransferChapterId] = useState("");
  const [transferChapters, setTransferChapters] = useState<Chapter[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [w, f] = await Promise.all([listWorks(), listInspirationFragments()]);
    setWorks(w);
    setFragments(f);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const w = await listWorks();
        setWorks(w);
        setFragments(await listInspirationFragments());
        try {
          const saved = localStorage.getItem(LS_LAST_WORK);
          if (saved && w.some((x) => x.id === saved)) {
            setFilterWorkId(saved);
            setFilterScope("work");
            setNewWorkId(saved);
          }
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    if (filterScope === "all") return fragments;
    if (filterScope === "unassigned") return fragments.filter((x) => x.workId == null);
    if (filterScope === "work" && filterWorkId) {
      return fragments.filter((x) => x.workId === filterWorkId);
    }
    return fragments;
  }, [fragments, filterScope, filterWorkId]);

  useEffect(() => {
    if (filterScope === "work" && works.length > 0 && !filterWorkId) {
      setFilterWorkId(works[0].id);
    }
  }, [filterScope, works, filterWorkId]);

  useEffect(() => {
    if (!transferFragment) return;
    if (!transferWorkId) {
      setTransferChapters([]);
      setTransferChapterId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const sorted = [...(await listChapters(transferWorkId))].sort((a, b) => a.order - b.order);
      if (cancelled) return;
      setTransferChapters(sorted);
      const w = await getWork(transferWorkId);
      const pick =
        w?.progressCursor && sorted.some((c) => c.id === w.progressCursor)
          ? w.progressCursor
          : sorted[0]?.id ?? "";
      setTransferChapterId((prev) => (prev && sorted.some((c) => c.id === prev) ? prev : pick));
    })();
    return () => {
      cancelled = true;
    };
  }, [transferFragment, transferWorkId]);

  const workTitle = useCallback(
    (id: string | null) => {
      if (!id) return "未归属";
      return works.find((w) => w.id === id)?.title ?? id.slice(0, 8);
    },
    [works],
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const body = newBody.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const tagParts = newTags
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await addInspirationFragment({
        body,
        tags: tagParts,
        workId: newWorkId || null,
      });
      setNewBody("");
      setNewTags("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    if (!window.confirm("删除这条碎片？")) return;
    setBusy(true);
    try {
      await deleteInspirationFragment(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const closeExpandPanel = useCallback(() => {
    expandAbortRef.current?.abort();
    expandAbortRef.current = null;
    setExpandPanel(null);
  }, []);

  const runExpandGeneration = useCallback(
    async (source: InspirationFragment, hint: string) => {
      expandAbortRef.current?.abort();
      const ac = new AbortController();
      expandAbortRef.current = ac;
      setExpandPanel({
        source,
        hint,
        busy: true,
        error: null,
        segments: null,
      });
      try {
        const { segments } = await generateInspirationFiveExpansions({
          fragmentBody: source.body,
          tags: source.tags,
          workTitle: source.workId ? workTitle(source.workId) : undefined,
          userHint: hint || undefined,
          signal: ac.signal,
        });
        setExpandPanel((p) =>
          p && p.source.id === source.id
            ? { ...p, busy: false, segments, error: null }
            : p,
        );
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) {
          setExpandPanel((p) =>
            p && p.source.id === source.id ? { ...p, busy: false, error: null } : p,
          );
          return;
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          setExpandPanel((p) =>
            p && p.source.id === source.id ? { ...p, busy: false, error: null } : p,
          );
          return;
        }
        if (e instanceof Error && e.name === "AbortError") {
          setExpandPanel((p) =>
            p && p.source.id === source.id ? { ...p, busy: false, error: null } : p,
          );
          return;
        }
        setExpandPanel((p) =>
          p && p.source.id === source.id
            ? {
                ...p,
                busy: false,
                error: e instanceof Error ? e.message : String(e),
              }
            : p,
        );
      } finally {
        if (expandAbortRef.current === ac) expandAbortRef.current = null;
      }
    },
    [workTitle],
  );

  function handleOpenExpand(f: InspirationFragment) {
    const hintReuse = expandPanel?.source.id === f.id ? expandPanel.hint : "";
    void runExpandGeneration(f, hintReuse);
  }

  async function handleSaveExpandedSegment(text: string) {
    if (!expandPanel || !text.trim() || busy) return;
    setBusy(true);
    try {
      const tags = [...new Set([...expandPanel.source.tags, "扩容"])];
      await addInspirationFragment({
        body: text.trim(),
        tags,
        workId: expandPanel.source.workId,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const closeTransferPanel = useCallback(() => {
    setTransferFragment(null);
    setTransferWorkId("");
    setTransferChapterId("");
    setTransferChapters([]);
  }, []);

  function handleOpenTransfer(f: InspirationFragment) {
    setTransferFragment(f);
    setTransferWorkId(f.workId ?? works[0]?.id ?? "");
  }

  async function handleTransferAppend() {
    if (!transferFragment || !transferWorkId || !transferChapterId || transferBusy) return;
    setTransferBusy(true);
    try {
      const sorted = [...(await listChapters(transferWorkId))].sort((a, b) => a.order - b.order);
      const ch = sorted.find((c) => c.id === transferChapterId);
      if (!ch) {
        window.alert("未找到目标章节，请重新选择。");
        return;
      }
      const base = ch.content ?? "";
      const trimmedEnd = base.trimEnd();
      const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
      const sep = trimmedEnd ? `\n\n──────── 流光转入 · ${stamp} ────────\n\n` : "";
      const block = transferFragment.body.trim();
      const nextContent = trimmedEnd + sep + block;
      await updateChapter(ch.id, { content: nextContent }, { expectedUpdatedAt: ch.updatedAt });
      window.alert(`已追加到《${ch.title || "未命名章"}》末尾。可在写作页继续编辑。`);
      closeTransferPanel();
    } catch (e) {
      if (isChapterSaveConflictError(e)) {
        window.alert(
          "保存冲突：该章已在其它窗口或写作页更新。请关闭本面板后重试，或先在写作页保存后再转入。",
        );
      } else {
        window.alert(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setTransferBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page inspiration-page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  return (
    <div className="page inspiration-page">
      <header className="page-header inspiration-page-header">
        <div>
          <Link to="/" className="back-link inspiration-page-back">
            ← 返回首页
          </Link>
          <div className="inspiration-page-title-row">
            <span className="inspiration-page-kbd" aria-hidden>
              3
            </span>
            <h1>流光</h1>
          </div>
          <p className="muted small inspiration-page-lead">
            <strong>灵感碎片</strong>：记录闪念、对白、设定点；支持标签、时间、可选归属作品。
            <strong> 全局速记</strong>：任意页按 <kbd className="inspiration-page-kbd">{liuguangQuickCaptureShortcutLabel()}</kbd>{" "}
            唤起弹层（编辑器与输入框内不触发）。
            <strong> AI 五段扩容</strong>：在列表中对单条碎片生成五条候选，可逐条存为新碎片（需同意隐私条款；若开启云端，章节正文可能上云，与推演等一致）。
            <strong> 转入章节</strong>：将本条正文<strong>追加</strong>到所选章节末尾（带分隔线），保存冲突与写作页一致。数据与备份/合并导入同源；云端同步需库表已就绪（
            <code className="inspiration-inline-code">inspiration_fragment</code>）。
          </p>
        </div>
        <div className="header-actions">
          <Link to="/library" className="btn ghost small">
            作品库
          </Link>
        </div>
      </header>

      <section className="inspiration-toolbar" aria-label="筛选">
        <label className="inspiration-toolbar-field">
          <span className="muted small">范围</span>
          <select
            className="inspiration-select"
            value={filterScope}
            onChange={(e) => {
              const v = e.target.value as FilterScope;
              if (v === "work") {
                setFilterScope("work");
                const wid = filterWorkId ?? works[0]?.id ?? null;
                setFilterWorkId(wid);
              } else {
                setFilterScope(v);
              }
            }}
          >
            <option value="all">全部</option>
            <option value="unassigned">未归属作品</option>
            <option value="work">按作品</option>
          </select>
        </label>
        {filterScope === "work" ? (
          works.length > 0 ? (
            <label className="inspiration-toolbar-field">
              <span className="muted small">作品</span>
              <select
                className="inspiration-select"
                value={filterWorkId ?? ""}
                onChange={(e) => setFilterWorkId(e.target.value || null)}
              >
                {works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title || "未命名"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted small inspiration-toolbar-empty">暂无作品，请先在作品库创建。</p>
          )
        ) : null}
      </section>

      <section className="inspiration-compose" aria-label="新建碎片">
        <h2 className="inspiration-subh">记一条</h2>
        <form className="inspiration-form" onSubmit={handleAdd}>
          <textarea
            className="inspiration-textarea"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="闪念、对白、设定点…"
            rows={4}
            disabled={busy}
          />
          <div className="inspiration-form-row">
            <label className="inspiration-inline-field">
              <span className="muted small">标签（逗号分隔）</span>
              <input
                className="inspiration-input"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="伏笔, 人物"
                disabled={busy}
              />
            </label>
            <label className="inspiration-inline-field">
              <span className="muted small">归属作品（可选）</span>
              <select
                className="inspiration-select inspiration-select-grow"
                value={newWorkId}
                onChange={(e) => setNewWorkId(e.target.value)}
                disabled={busy}
              >
                <option value="">不关联</option>
                {works.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title || "未命名"}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn primary small" disabled={busy || !newBody.trim()}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </section>

      {expandPanel ? (
        <section className="inspiration-expand-panel" aria-label="AI 五段扩容">
          <div className="inspiration-expand-head">
            <h2 className="inspiration-subh inspiration-expand-title">AI 五段扩容</h2>
            <button type="button" className="btn ghost small" onClick={closeExpandPanel}>
              关闭
            </button>
          </div>
          <p className="muted small inspiration-expand-source">
            来源节选：{expandPanel.source.body.slice(0, 120)}
            {expandPanel.source.body.length > 120 ? "…" : ""}
          </p>
          <label className="inspiration-expand-hint-field">
            <span className="muted small">补充说明（可选，参与重新生成）</span>
            <textarea
              className="inspiration-expand-hint-textarea"
              value={expandPanel.hint}
              onChange={(e) =>
                setExpandPanel((p) => (p ? { ...p, hint: e.target.value } : p))
              }
              rows={2}
              disabled={expandPanel.busy}
              placeholder="例如：希望偏悬疑 / 加强人物对话…"
            />
          </label>
          <div className="inspiration-expand-actions">
            <button
              type="button"
              className="btn ghost small"
              disabled={expandPanel.busy}
              onClick={() => void runExpandGeneration(expandPanel.source, expandPanel.hint)}
            >
              {expandPanel.busy ? "生成中…" : expandPanel.segments ? "重新生成" : "生成"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={!expandPanel.busy}
              onClick={() => expandAbortRef.current?.abort()}
            >
              取消请求
            </button>
          </div>
          {expandPanel.error ? <AiInlineErrorNotice message={expandPanel.error} /> : null}
          {expandPanel.busy && !expandPanel.segments ? (
            <p className="muted small">生成中…</p>
          ) : null}
          {expandPanel.segments ? (
            <ol className="inspiration-expand-segments">
              {expandPanel.segments.map((seg, i) => (
                <li key={i} className="inspiration-expand-seg">
                  <p className="inspiration-expand-seg-body">{seg}</p>
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={busy || !seg.trim()}
                    onClick={() => void handleSaveExpandedSegment(seg)}
                  >
                    存为碎片
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {transferFragment ? (
        <section
          className="inspiration-expand-panel inspiration-transfer-panel"
          aria-label="转入章节"
        >
          <div className="inspiration-expand-head">
            <h2 className="inspiration-subh inspiration-expand-title">转入章节</h2>
            <button type="button" className="btn ghost small" onClick={closeTransferPanel}>
              关闭
            </button>
          </div>
          <p className="muted small inspiration-expand-source">
            将追加到<strong>章末</strong>（不覆盖原有正文）：{transferFragment.body.slice(0, 100)}
            {transferFragment.body.length > 100 ? "…" : ""}
          </p>
          {works.length === 0 ? (
            <p className="muted small">暂无作品，请先在作品库创建后再转入。</p>
          ) : (
            <>
              <div className="inspiration-transfer-row">
                <label className="inspiration-global-field inspiration-global-field-grow">
                  <span className="muted small">作品</span>
                  <select
                    className="inspiration-select inspiration-select-grow"
                    value={transferWorkId}
                    onChange={(e) => setTransferWorkId(e.target.value)}
                    disabled={transferBusy}
                  >
                    {works.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title || "未命名"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inspiration-global-field inspiration-global-field-grow">
                  <span className="muted small">章节</span>
                  <select
                    className="inspiration-select inspiration-select-grow"
                    value={transferChapterId}
                    onChange={(e) => setTransferChapterId(e.target.value)}
                    disabled={transferBusy || transferChapters.length === 0}
                  >
                    {transferChapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || "未命名章"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {transferChapters.length === 0 && transferWorkId ? (
                <p className="muted small">该作品下暂无章节。</p>
              ) : null}
              <div className="inspiration-expand-actions inspiration-transfer-actions">
                <button
                  type="button"
                  className="btn primary small"
                  disabled={
                    transferBusy ||
                    !transferChapterId ||
                    transferChapters.length === 0 ||
                    !transferFragment.body.trim()
                  }
                  onClick={() => void handleTransferAppend()}
                >
                  {transferBusy ? "写入中…" : "追加到章末"}
                </button>
                {transferWorkId && transferChapterId ? (
                  <Link
                    className="btn ghost small"
                    to={`/work/${transferWorkId}?chapter=${transferChapterId}`}
                  >
                    打开写作页
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}

      <section className="inspiration-list-section" aria-label="碎片列表">
        <h2 className="inspiration-subh">列表 · {visible.length} 条</h2>
        {visible.length === 0 ? (
          <p className="muted">暂无碎片。登录云端账号后数据会写入 Supabase（见设置）。</p>
        ) : (
          <ul className="inspiration-card-list">
            {visible.map((f) => (
              <li key={f.id} className="inspiration-card">
                <div className="inspiration-card-meta">
                  <time className="inspiration-card-time" dateTime={new Date(f.createdAt).toISOString()}>
                    {formatRelativeUpdateMs(f.createdAt)}
                  </time>
                  <span className="inspiration-card-work muted small">{workTitle(f.workId)}</span>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => handleOpenExpand(f)}
                    disabled={busy || expandPanel?.busy || transferBusy}
                    title="调用当前模型生成五段扩写"
                  >
                    AI 五段
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => handleOpenTransfer(f)}
                    disabled={works.length === 0 || busy || expandPanel?.busy || transferBusy}
                    title="追加到某章正文末尾"
                  >
                    转入章节
                  </button>
                  <button
                    type="button"
                    className="btn ghost small inspiration-card-del"
                    onClick={() => void handleDelete(f.id)}
                    disabled={busy || transferBusy}
                  >
                    删除
                  </button>
                </div>
                <p className="inspiration-card-body">{f.body}</p>
                {f.tags.length > 0 ? (
                  <p className="inspiration-card-tags muted small">{f.tags.join(" · ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <HubAiSettingsHint />
    </div>
  );
}
