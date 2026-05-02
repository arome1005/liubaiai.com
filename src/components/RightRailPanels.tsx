import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import type { Chapter, ReferenceExcerpt, Work } from "../db/types";
import { exportBibleMarkdown } from "../db/repo";
import { referenceReaderHref } from "../util/readUtf8TextFile";
import { workPathSegment } from "../util/work-url";
import type { AutoSummaryStatus } from "../ai/chapter-summary-auto";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import {
  LINKED_CHAPTERS_UPDATED_EVENT,
  loadLinkedChapters,
  saveLinkedChapters,
  type LinkedChaptersState,
} from "../util/linked-chapters-storage";
import { approxRoughTokenCount } from "../ai/approx-tokens";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function KnowledgeBaseRightPanel(props: {
  workId: string;
  work: Work;
  chapter: Chapter | null;
  /** 当前章在编辑器中的正文（与列表缓存同步，供 AI 概要生成） */
  chapterEditorContent?: string;
  chapters: Chapter[];
  autoSummaryStatus?: AutoSummaryStatus;
  onJumpToChapter: (chapterId: string) => void;
  /** 概要保存成功后合并进父级 `chapters`，以同步 `updatedAt`（步 25 乐观锁） */
  onChapterPatch?: (chapterId: string, patch: Partial<Chapter>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkedTick, setLinkedTick] = useState(0);

  useEffect(() => {
    const on = (e: CustomEvent<{ workId?: string; chapterId?: string }>) => {
      const wid = e.detail?.workId;
      const cid = e.detail?.chapterId;
      if (!props.chapter) return;
      if (wid === props.workId && cid === props.chapter.id) setLinkedTick((x) => x + 1);
    };
    window.addEventListener(LINKED_CHAPTERS_UPDATED_EVENT, on as EventListenerOrEventListenerObject);
    return () => window.removeEventListener(LINKED_CHAPTERS_UPDATED_EVENT, on as EventListenerOrEventListenerObject);
  }, [props.workId, props.chapter?.id]);

  const state: LinkedChaptersState = useMemo(() => {
    void linkedTick;
    if (!props.chapter) return { fullChapterIds: [], summaryChapterIds: [] };
    return loadLinkedChapters(props.workId, props.chapter.id);
  }, [props.workId, props.chapter?.id, linkedTick]);

  const canPick = useMemo(() => {
    if (!props.chapter) return [];
    const curId = props.chapter.id;
    const pool = [...props.chapters].filter((c) => c.id !== curId);
    // 若 order 可用则按 order 倒序；否则按 updatedAt 倒序（更贴近“最近写完”）
    return pool.sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : null;
      const bo = typeof b.order === "number" ? b.order : null;
      if (ao != null && bo != null) return bo - ao;
      const au = typeof a.updatedAt === "number" ? a.updatedAt : 0;
      const bu = typeof b.updatedAt === "number" ? b.updatedAt : 0;
      return bu - au;
    });
  }, [props.chapter, props.chapters]);

  const approxTokens = useMemo(() => {
    if (!props.chapter) return { full: 0, sum: 0 };
    const fullSet = new Set(state.fullChapterIds);
    const sumSet = new Set(state.summaryChapterIds);
    const fullText = canPick
      .filter((c) => fullSet.has(c.id))
      .map((c) => (c.content ?? "").trim())
      .join("\n");
    const sumText = canPick
      .filter((c) => sumSet.has(c.id))
      .map((c) => (c.summary ?? "").trim())
      .join("\n");
    return { full: approxRoughTokenCount(fullText), sum: approxRoughTokenCount(sumText) };
  }, [props.chapter, canPick, state.fullChapterIds, state.summaryChapterIds]);

  const selectedChapterIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of state.fullChapterIds) s.add(id);
    for (const id of state.summaryChapterIds) s.add(id);
    return s;
  }, [state.fullChapterIds, state.summaryChapterIds]);

  const selectedCount = selectedChapterIds.size;
  const INLINE_CAP = 5;

  const selectedRows = useMemo(() => {
    const byId = new Map<string, Chapter>();
    for (const c of canPick) byId.set(c.id, c);
    const ids = [...selectedChapterIds].filter((id) => byId.has(id));
    const orderOf = (id: string) => byId.get(id)?.order ?? -1;
    ids.sort((a, b) => orderOf(b) - orderOf(a));
    return ids.map((id) => {
      const c = byId.get(id)!;
      return {
        id,
        title: c.title,
        order: c.order,
        hasFull: state.fullChapterIds.includes(id),
        hasSum: state.summaryChapterIds.includes(id),
      };
    });
  }, [canPick, selectedChapterIds, state.fullChapterIds, state.summaryChapterIds]);

  function saveNext(next: LinkedChaptersState, opts?: { autoOpenPickerIfOverflow?: boolean }) {
    if (!props.chapter) return;
    saveLinkedChapters(props.workId, props.chapter.id, next);
    const overflow =
      new Set<string>([...next.fullChapterIds, ...next.summaryChapterIds]).size > INLINE_CAP;
    if (opts?.autoOpenPickerIfOverflow && overflow) {
      setPickerOpen(true);
    }
  }

  function addRecent(n: number, mode: "full" | "summary") {
    const cur = state;
    const picked =
      mode === "full"
        ? canPick.filter((c) => (c.content ?? "").trim()).slice(0, n).map((c) => c.id)
        : canPick.filter((c) => (c.summary ?? "").trim()).slice(0, n).map((c) => c.id);
    const full = new Set(cur.fullChapterIds);
    const sum = new Set(cur.summaryChapterIds);
    for (const id of picked) {
      if (mode === "full") full.add(id);
      else sum.add(id);
    }
    saveNext({ fullChapterIds: [...full], summaryChapterIds: [...sum] }, { autoOpenPickerIfOverflow: true });
  }

  return (
    <div className="rr-panel">
      <div className="rr-block">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="rr-block-title" style={{ margin: 0 }}>
            关联知识库
          </div>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 cursor-help items-center rounded-sm text-muted-foreground/50 outline-none transition-colors hover:text-muted-foreground/90 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="关联知识库说明"
              >
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
              用「已完成章节」来约束本章生成：可混搭 <strong>全文</strong> 与 <strong>概要</strong>，概要更省 tokens。
            </TooltipContent>
          </Tooltip>
        </div>
        {props.chapter ? (
          <>
            {/* 五章内：直接在面板里管理；超过后再进弹窗批量管理 */}
            <div className="rounded-md border border-border/50 bg-background/40 p-2">
              {selectedCount === 0 ? (
                <div className="muted small" style={{ padding: "10px 8px", textAlign: "center" }}>
                  未选择任何章节
                </div>
              ) : (
                <>
                  {(selectedCount > INLINE_CAP ? selectedRows.slice(0, INLINE_CAP) : selectedRows).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="muted small">#{r.order}</span> {r.title}
                        </div>
                        <div className="muted small">
                          {r.hasFull ? "（正文）" : ""}
                          {r.hasFull && r.hasSum ? " · " : ""}
                          {r.hasSum ? "（概要）" : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        title="移除该章关联"
                        onClick={() => {
                          const next: LinkedChaptersState = {
                            fullChapterIds: state.fullChapterIds.filter((x) => x !== r.id),
                            summaryChapterIds: state.summaryChapterIds.filter((x) => x !== r.id),
                          };
                          saveNext(next);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedCount > INLINE_CAP ? (
                    <div className="muted small" style={{ padding: "6px 8px" }}>
                      已关联 {selectedCount} 章，更多请点「更多」。
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="rr-panel-row" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  if (!props.chapter) return;
                  saveLinkedChapters(props.workId, props.chapter.id, { fullChapterIds: [], summaryChapterIds: [] });
                }}
                disabled={state.fullChapterIds.length === 0 && state.summaryChapterIds.length === 0}
              >
                清除
              </button>
              <button type="button" className="btn small" onClick={() => addRecent(3, "full")}>
                最近3章全文
              </button>
              <button type="button" className="btn small" onClick={() => addRecent(5, "summary")}>
                最近5章概要
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setPickerOpen(true);
                }}
                disabled={canPick.length === 0}
                title={canPick.length === 0 ? "暂无可关联章节" : "打开关联章节弹窗"}
              >
                更多
              </button>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-sm text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground/90 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="已选章节与 tokens 概览"
                  >
                    <Info className="size-3 shrink-0 opacity-70" aria-hidden />
                    <span className="tabular-nums">
                      全文 {state.fullChapterIds.length} · 概要 {state.summaryChapterIds.length}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,20rem)] text-xs leading-relaxed">
                  已选：全文 {state.fullChapterIds.length} 章（≈{approxTokens.full.toLocaleString()} tokens） · 概要{" "}
                  {state.summaryChapterIds.length} 章（≈{approxTokens.sum.toLocaleString()} tokens）
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        ) : (
          <p className="muted small">请先选择章节。</p>
        )}
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(v) => {
          setPickerOpen(v);
        }}
      >
        <DialogContent
          overlayClassName="work-form-modal-overlay"
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            "z-[var(--z-modal-app-content)] max-h-[min(92vh,880px)] w-full max-w-[min(980px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
            <DialogTitle className="text-left text-lg font-semibold">选择关联章节</DialogTitle>
            <button type="button" className="icon-btn" title="关闭" onClick={() => setPickerOpen(false)}>
              ×
            </button>
          </div>
          <ChapterLinkPicker
            workId={props.workId}
            chapter={props.chapter}
            chapters={canPick}
            value={state}
            onChange={(v) => {
              if (!props.chapter) return;
              saveLinkedChapters(props.workId, props.chapter.id, v);
            }}
            onClose={() => setPickerOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChapterLinkPicker(props: {
  workId: string;
  chapter: Chapter | null;
  chapters: Chapter[];
  value: LinkedChaptersState;
  onChange: (v: LinkedChaptersState) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LinkedChaptersState>(() => props.value);

  useEffect(() => setSelected(props.value), [props.value.fullChapterIds.join(","), props.value.summaryChapterIds.join(",")]);

  const filtered = useMemo(() => {
    const key = q.trim();
    if (!key) return props.chapters;
    return props.chapters.filter((c) => (c.title ?? "").includes(key));
  }, [props.chapters, q]);

  function toggle(id: string, mode: "full" | "summary") {
    setSelected((prev) => {
      const full = new Set(prev.fullChapterIds);
      const sum = new Set(prev.summaryChapterIds);
      if (mode === "full") {
        if (full.has(id)) full.delete(id);
        else full.add(id);
      } else {
        if (sum.has(id)) sum.delete(id);
        else sum.add(id);
      }
      return { fullChapterIds: [...full], summaryChapterIds: [...sum] };
    });
  }

  function setRecent(n: number, mode: "full" | "summary") {
    const ids = filtered
      .filter((c) => {
        const hasBody = (c.content ?? "").trim().length > 0;
        const hasSum = (c.summary ?? "").trim().length > 0;
        return mode === "full" ? hasBody : hasSum;
      })
      .slice(0, Math.max(0, n))
      .map((c) => c.id);
    setSelected((prev) => {
      const full = new Set(prev.fullChapterIds);
      const sum = new Set(prev.summaryChapterIds);
      for (const id of ids) {
        if (mode === "full") full.add(id);
        else sum.add(id);
      }
      return { fullChapterIds: [...full], summaryChapterIds: [...sum] };
    });
  }

  const fullSet = useMemo(() => new Set(selected.fullChapterIds), [selected.fullChapterIds]);
  const sumSet = useMemo(() => new Set(selected.summaryChapterIds), [selected.summaryChapterIds]);

  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rr-input"
          placeholder="搜索章节标题…"
          style={{ flex: "1 1 320px" }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn small" onClick={() => setRecent(3, "full")}>
            最近3章全文
          </button>
          <button type="button" className="btn small" onClick={() => setRecent(5, "summary")}>
            最近5章概要
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => setSelected({ fullChapterIds: [], summaryChapterIds: [] })}
          >
            清空
          </button>
        </div>
      </div>

      <div className="muted small" style={{ marginTop: 10 }}>
        可自由组合：例如「3 章全文 + 5 章概要」。
      </div>

      <div className="mt-3 max-h-[58vh] overflow-auto rounded-md border border-border/50 bg-background/40 p-2 text-sm">
        {filtered.map((c) => {
          const hasBody = !!(c.content ?? "").trim();
          const hasSum = !!(c.summary ?? "").trim();
          const bodyCount = (c.content ?? "").trim().length;
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/30">
              <div className="min-w-0">
                <div className="truncate">
                  <span className="muted small">#{c.order}</span> {c.title}
                </div>
                <div className="muted small">
                  {bodyCount ? `${Math.round(bodyCount / 2)} 字` : "无正文"} · {hasSum ? "有概要" : "无概要"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={"btn small" + (fullSet.has(c.id) ? " primary" : "")}
                  disabled={!hasBody}
                  title={!hasBody ? "该章无正文" : "关联全文"}
                  onClick={() => toggle(c.id, "full")}
                >
                  正文
                </button>
                <button
                  type="button"
                  className={"btn small" + (sumSet.has(c.id) ? " primary" : "")}
                  disabled={!hasSum}
                  title={!hasSum ? "该章无概要" : "关联概要"}
                  onClick={() => toggle(c.id, "summary")}
                >
                  概要
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? <div className="muted small p-2">无匹配章节。</div> : null}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" className="btn" onClick={props.onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            // 严格模式：概要关联必须章节真的有概要（避免历史残留把“无概要章”写进 summaryChapterIds）
            const allowedSum = new Set(props.chapters.filter((c) => (c.summary ?? "").trim()).map((c) => c.id));
            const allowedFull = new Set(props.chapters.filter((c) => (c.content ?? "").trim()).map((c) => c.id));
            const next: LinkedChaptersState = {
              fullChapterIds: selected.fullChapterIds.filter((id) => allowedFull.has(id)),
              summaryChapterIds: selected.summaryChapterIds.filter((id) => allowedSum.has(id)),
            };
            props.onChange(next);
            props.onClose();
          }}
        >
          确认选择
        </button>
      </div>
    </div>
  );
}

/** 锦囊 Markdown 加载/搜索/预览（无外层 `rr-panel`，供组合进「设定」等面板） */
export function BibleMarkdownPreview(props: { workId: string; linkWork?: Pick<Work, "id" | "bookNo"> | null }) {
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
    <>
      <div className="rr-panel-actions">
        <Link
          className="btn small"
          to={`/work/${props.linkWork ? workPathSegment(props.linkWork) : props.workId}/bible`}
        >
          打开锦囊页
        </Link>
        <button type="button" className="btn small" onClick={() => void load()} disabled={busy}>
          {busy ? "加载中…" : md ? "刷新" : "加载"}
        </button>
      </div>
      {busy && !md && (
        <div className="rr-skeleton-list" aria-busy="true" aria-label="加载中">
          {[60, 80, 45].map((w, i) => (
            <div key={i} className="rr-skeleton-line" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {err ? <p className="muted small" style={{ color: "#b91c1c" }}>{err}</p> : null}
      {md ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rr-input"
          placeholder="搜索锦囊内容（本面板仅预览文本）"
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
        <p className="muted small">点击"加载"把本书锦囊导出为 Markdown 预览（会根据上下文上限截断）。</p>
      )}
    </>
  );
}

export function BibleRightPanel(props: { workId: string; linkWork?: Pick<Work, "id" | "bookNo"> | null }) {
  return (
    <div className="rr-panel">
      <BibleMarkdownPreview workId={props.workId} linkWork={props.linkWork} />
    </div>
  );
}

export function RefRightPanel(props: {
  linked: Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>;
  onInsert: (text: string) => void;
  loading?: boolean;
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
        {props.loading ? (
          <div className="rr-skeleton-list" aria-busy="true" aria-label="加载中">
            {[75, 55, 90].map((w, i) => (
              <div key={i} className="rr-skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : props.linked.length === 0 ? (
          <p className="muted small">暂无。本章可在「藏经」阅读器划选保存并关联。</p>
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

