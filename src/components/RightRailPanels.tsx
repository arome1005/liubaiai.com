import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Chapter, ReferenceExcerpt, Work } from "../db/types";
import { isFirstAiGateCancelledError } from "../ai/client";
import { generateChapterSummaryWithRetry } from "../ai/chapter-summary-generate";
import { loadAiSettings } from "../ai/storage";
import { exportBibleMarkdown, isChapterSaveConflictError, updateChapter } from "../db/repo";
import { referenceReaderHref } from "../util/readUtf8TextFile";
import { formatSummaryUpdatedAt } from "../util/summary-meta";

export function SummaryRightPanel(props: {
  workId: string;
  work: Work;
  chapter: Chapter | null;
  /** 当前章在编辑器中的正文（与列表缓存同步，供 AI 概要生成） */
  chapterEditorContent?: string;
  chapters: Chapter[];
  onJumpToChapter: (chapterId: string) => void;
  /** 概要保存成功后合并进父级 `chapters`，以同步 `updatedAt`（步 25 乐观锁） */
  onChapterPatch?: (chapterId: string, patch: Partial<Chapter>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [summaryAiBusy, setSummaryAiBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const curId = props.chapter?.id ?? "";
  useEffect(() => {
    setDraft(props.chapter?.summary ?? "");
  }, [curId, props.chapter?.summary]);

  const recent = useMemo(() => {
    if (!props.chapter) return [];
    const curOrder = props.chapter.order;
    return [...props.chapters]
      .filter((c) => c.order <= curOrder)
      .sort((a, b) => b.order - a.order)
      .slice(0, 8);
  }, [props.chapter, props.chapters]);

  return (
    <div className="rr-panel">
      <div className="rr-panel-actions">
        <Link className="btn small" to={`/work/${props.workId}/summary`}>
          打开总览
        </Link>
      </div>

      <div className="rr-block">
        <div className="rr-block-title">当前章节概要</div>
        {props.chapter ? (
          <>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {props.chapter.title}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              placeholder="用要点写事实与推进（可空）"
              style={{ width: "100%", resize: "vertical" }}
              onBlur={() => {
                if (!props.chapter) return;
                const next = draft;
                const exp = props.chapter.updatedAt;
                setSaving(true);
                void (async () => {
                  try {
                    const t = Date.now();
                    await updateChapter(
                      props.chapter!.id,
                      { summary: next, summaryUpdatedAt: t },
                      { expectedUpdatedAt: exp },
                    );
                    props.onChapterPatch?.(props.chapter!.id, {
                      summary: next,
                      updatedAt: t,
                      summaryUpdatedAt: t,
                    });
                  } catch (e) {
                    if (isChapterSaveConflictError(e)) {
                      window.alert("概要保存冲突：本章已在其它窗口更新。请打开章节概要总览或切换章节后重试。");
                    }
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            />
            <div className="rr-panel-row" style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="btn small"
                disabled={summaryAiBusy || saving}
                onClick={() => {
                  if (!props.chapter) return;
                  const body = (props.chapterEditorContent ?? props.chapter.content ?? "").trim();
                  if (!body) {
                    window.alert("本章暂无正文，请先撰写后再生成概要。");
                    return;
                  }
                  void (async () => {
                    setSummaryAiBusy(true);
                    try {
                      const text = await generateChapterSummaryWithRetry({
                        workTitle: props.work.title,
                        chapterTitle: props.chapter!.title,
                        chapterContent: body,
                        settings: loadAiSettings(),
                      });
                      const t = Date.now();
                      const exp = props.chapter!.updatedAt;
                      await updateChapter(
                        props.chapter!.id,
                        { summary: text, summaryUpdatedAt: t },
                        { expectedUpdatedAt: exp },
                      );
                      setDraft(text);
                      props.onChapterPatch?.(props.chapter!.id, {
                        summary: text,
                        updatedAt: t,
                        summaryUpdatedAt: t,
                      });
                    } catch (e) {
                      if (isFirstAiGateCancelledError(e)) return;
                      window.alert(e instanceof Error ? e.message : "生成失败");
                    } finally {
                      setSummaryAiBusy(false);
                    }
                  })();
                }}
              >
                {summaryAiBusy ? "生成中…" : "AI 生成概要"}
              </button>
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              {saving ? "保存中…" : "失焦自动保存"}
              {formatSummaryUpdatedAt(props.chapter.summaryUpdatedAt) ? (
                <span style={{ display: "block", marginTop: 4 }}>
                  概要更新：{formatSummaryUpdatedAt(props.chapter.summaryUpdatedAt)}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted small">请先选择章节。</p>
        )}
      </div>

      <div className="rr-block">
        <div className="rr-block-title">最近章节（点标题跳转）</div>
        <ul className="rr-list">
          {recent.map((c) => (
            <li key={c.id} className="rr-list-item">
              <button type="button" className="rr-link" onClick={() => props.onJumpToChapter(c.id)}>
                {c.title}
              </button>
              <div className="muted small">{(c.summary ?? "").trim() ? "有概要" : "无概要"}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BibleRightPanel(props: { workId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [md, setMd] = useState<string>("");
  const [query, setQuery] = useState("");

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const text = await exportBibleMarkdown(props.workId);
      setMd(text.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rr-panel">
      <div className="rr-panel-actions">
        <Link className="btn small" to={`/work/${props.workId}/bible`}>
          打开圣经页
        </Link>
        <button type="button" className="btn small" onClick={() => void load()} disabled={busy}>
          {busy ? "加载中…" : md ? "刷新" : "加载"}
        </button>
      </div>
      {err ? <p className="muted small" style={{ color: "#b91c1c" }}>{err}</p> : null}
      {md ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rr-input"
          placeholder="搜索圣经内容（本面板仅预览文本）"
        />
      ) : null}
      {md ? (
        <textarea
          value={
            query.trim()
              ? md
                  .split("\n")
                  .filter((line) => line.toLowerCase().includes(query.trim().toLowerCase()))
                  .join("\n") || "（无匹配行）"
              : md
          }
          readOnly
          rows={18}
          style={{ width: "100%", resize: "vertical" }}
        />
      ) : (
        <p className="muted small">点击“加载”把圣经导出为 Markdown 预览（会根据上下文上限截断）。</p>
      )}
    </div>
  );
}

export function RefRightPanel(props: {
  linked: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  onInsert: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    const list = props.linked.slice(0, 200);
    if (!key) return list.slice(0, 24);
    return list.filter((ex) => `${ex.refTitle}\n${ex.text}\n${ex.note ?? ""}`.toLowerCase().includes(key)).slice(0, 24);
  }, [props.linked, q]);

  return (
    <div className="rr-panel">
      <div className="rr-block">
        <div className="rr-block-title">本章关联参考（摘录）</div>
        {props.linked.length === 0 ? (
          <p className="muted small">暂无。本章可在“参考库”阅读器划选保存并关联。</p>
        ) : (
          <>
            <input
              name="refRightPanelSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="rr-input"
              placeholder="搜索摘录（标题/正文/备注）"
            />
            <ul className="rr-list">
              {shown.map((ex) => (
              <li key={ex.id} className="rr-excerpt">
                <div className="rr-excerpt-head">
                  <Link to={referenceReaderHref(ex)} className="rr-excerpt-title">
                    {ex.refTitle}
                  </Link>
                  <button type="button" className="btn small" onClick={() => props.onInsert(ex.text)}>
                    插入
                  </button>
                </div>
                <div className="rr-excerpt-body">{ex.text}</div>
                {ex.note ? <div className="muted small">{ex.note}</div> : null}
              </li>
              ))}
            </ul>
            {q.trim() && shown.length === 0 ? <p className="muted small">无匹配摘录。</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

