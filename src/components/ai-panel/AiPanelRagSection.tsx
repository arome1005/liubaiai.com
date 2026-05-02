import type { Dispatch, SetStateAction } from "react";
import { useLayoutEffect, useRef } from "react";
import type { Chapter, ReferenceSearchHit, Work } from "../../db/types";
import { referenceReaderHref } from "../../util/readUtf8TextFile";
import { isRuntimeRagHit, type WritingRagSources } from "../../util/work-rag-runtime";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function AiPanelRagSection(props: {
  workId: string;
  work: Work;
  chapters: Chapter[];
  activeChapterId: string | null;
  /** `full`：默认+本次检索；`defaultsOnly`：仅本书默认；`sessionOnly`：仅本次关键词/预览/命中 */
  variant?: "full" | "defaultsOnly" | "sessionOnly";
  /** false：不包外层 `<details>`，由父级提供折叠标题（设定 Tab 手风琴） */
  useDisclosure?: boolean;
  /** 仅当 `useDisclosure !== false` 时：首屏是否展开（用 ref 设置，避免 React 对 DOM 的 `defaultOpen` 告警） */
  defaultOpen?: boolean;
  ragEnabled: boolean;
  onRagEnabledChange: (v: boolean) => void;
  ragWorkSources: WritingRagSources;
  setRagWorkSources: Dispatch<SetStateAction<WritingRagSources>>;
  ragQuery: string;
  onRagQueryChange: (v: string) => void;
  ragK: number;
  onRagKChange: (v: number) => void;
  ragHits: ReferenceSearchHit[];
  ragLoading: boolean;
  ragExcluded: ReadonlySet<string>;
  setRagExcluded: Dispatch<SetStateAction<ReadonlySet<string>>>;
  busy: boolean;
  onRunPreview: () => void;
}) {
  const p = props;
  const variant = p.variant ?? "full";
  const useDisclosure = p.useDisclosure ?? true;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (!useDisclosure) return;
    if (p.defaultOpen && detailsRef.current) detailsRef.current.open = true;
  }, [useDisclosure, p.defaultOpen]);
  const showDefaults = variant !== "sessionOnly";
  const showSession = variant !== "defaultsOnly";
  const summaryLabel =
    variant === "defaultsOnly"
      ? "检索增强（默认）"
      : variant === "sessionOnly"
        ? "检索增强（本次）"
        : "检索增强";

  const ragHelp = (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 600 }}>检索增强是什么？</div>
      <div>填关键词 → 点「检索预览」→ 把命中的原文片段注入本次生成。</div>
      <div style={{ opacity: 0.92 }}>
        原创：用来找回你书里已写的设定/伏笔/人物状态，减少前后不一致。
        <br />
        同人：用来从你导入的原著/资料里提取相关片段，贴合原作设定与口吻。
      </div>
    </div>
  );
  const body = (
    <>
      {showDefaults ? (
        <>
      <label className="ai-panel-check row row--check">
        <input name="ragEnabled" type="checkbox" checked={p.ragEnabled} onChange={(e) => p.onRagEnabledChange(e.target.checked)} />
        <span>启用检索注入</span>
      </label>
      <div className="ai-panel-field">
        <span className="flex items-center gap-1">
          <span className="small muted">检索范围</span>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="inline-flex cursor-help items-center text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-ring"
                aria-label="检索范围说明"
              >
                <Info className="size-3" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" sideOffset={6} className="max-w-[min(92vw,18rem)] text-xs leading-relaxed">
              <p className="mb-1.5">从勾选来源检索片段注入上下文：藏经、本书 · 锦囊导出（分块）、本书 · 正文。</p>
              <p>启用检索但未勾选任何范围时，不会产生检索片段。</p>
            </TooltipContent>
          </Tooltip>
        </span>
        <label className="ai-panel-check row row--check">
          <input
            type="checkbox"
            checked={p.ragWorkSources.referenceLibrary}
            disabled={!p.ragEnabled}
            onChange={(e) => {
              const checked = e.target.checked;
              p.setRagWorkSources((s) => ({ ...s, referenceLibrary: checked }));
            }}
          />
          <span>藏经</span>
        </label>
        <label className="ai-panel-check row row--check">
          <input
            type="checkbox"
            checked={p.ragWorkSources.workBibleExport}
            disabled={!p.ragEnabled}
            onChange={(e) => {
              const checked = e.target.checked;
              p.setRagWorkSources((s) => ({ ...s, workBibleExport: checked }));
            }}
          />
          <span>本书 · 锦囊导出（分块）</span>
        </label>
        <label className="ai-panel-check row row--check">
          <input
            type="checkbox"
            checked={p.ragWorkSources.workManuscript}
            disabled={!p.ragEnabled}
            onChange={(e) => {
              const checked = e.target.checked;
              p.setRagWorkSources((s) => ({ ...s, workManuscript: checked }));
            }}
          />
          <span>本书 · 正文（不含当前章）</span>
        </label>
      </div>
      {variant === "defaultsOnly" ? (
        <div className="ai-panel-row">
          <label className="small muted">top-k（默认）</label>
          <input
            type="number"
            name="ragTopKDefaults"
            min={1}
            max={20}
            value={p.ragK}
            onChange={(e) => p.onRagKChange(Number(e.target.value) || 6)}
            style={{ width: 72 }}
          />
        </div>
      ) : null}
        </>
      ) : null}
      {showSession ? (
        <>
      {variant === "sessionOnly" ? (
        <p className="muted small" style={{ marginBottom: 8 }}>
          填关键词 → 点「检索预览」→ 选择要注入的片段。
        </p>
      ) : null}
      <label className="ai-panel-field">
        <span className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          关键词
          {variant === "sessionOnly" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="检索增强说明"
                  title="检索增强说明"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6} className="max-w-[360px] text-xs">
                {ragHelp}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </span>
        <input
          className="input"
          name="ragQuery"
          value={p.ragQuery}
          onChange={(e) => p.onRagQueryChange(e.target.value)}
          placeholder="例如：太初古矿、玉简、主角姓名…"
        />
      </label>
      <div className="ai-panel-row">
        {variant === "full" ? (
          <>
            <label className="small muted">top-k</label>
            <input
              type="number"
              name="ragTopK"
              min={1}
              max={20}
              value={p.ragK}
              onChange={(e) => p.onRagKChange(Number(e.target.value) || 6)}
              style={{ width: 72 }}
            />
          </>
        ) : (
          <span className="muted small">top-k：{p.ragK}</span>
        )}
        <button type="button" className="btn small" disabled={!p.ragEnabled || !p.ragQuery.trim() || p.ragLoading || p.busy} onClick={() => p.onRunPreview()}>
          {p.ragLoading ? "检索中…" : "检索预览"}
        </button>
      </div>
      {p.ragEnabled && p.ragQuery.trim() ? (
        p.ragHits.length > 0 ? (
          <>
            <p className="muted small" style={{ marginBottom: 6 }}>
              {p.ragHits.length} 条命中 · {p.ragExcluded.size > 0 ? `已取消 ${p.ragExcluded.size} 条 · ` : ""}注入{" "}
              {p.ragHits.filter((h) => !p.ragExcluded.has(h.chunkId)).length} 条
            </p>
            <ul className="rr-list" style={{ gap: 6 }}>
              {p.ragHits.slice(0, Math.max(0, Math.min(12, p.ragK))).map((h) => {
                const excluded = p.ragExcluded.has(h.chunkId);
                const isRuntime = isRuntimeRagHit(h);
                const srcBadge = h.refTitle.startsWith("本书锦囊")
                  ? "锦囊"
                  : h.refTitle.startsWith("正文")
                    ? "正文"
                    : "藏经";
                return (
                  <li
                    key={`${h.chunkId}-${h.highlightStart}-${h.highlightEnd}`}
                    className="rr-list-item"
                    style={{
                      flexDirection: "column",
                      alignItems: "stretch",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      opacity: excluded ? 0.45 : 1,
                      background: excluded ? "transparent" : "var(--card)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          flexShrink: 0,
                        }}
                      >
                        {srcBadge}
                      </span>
                      {isRuntime ? (
                        <span
                          className="rr-link small"
                          title="本书运行时检索命中（无藏经深链）"
                          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {h.refTitle}
                        </span>
                      ) : (
                        <a
                          className="rr-link small"
                          href={referenceReaderHref({
                            refWorkId: h.refWorkId,
                            ordinal: h.ordinal,
                            startOffset: h.highlightStart,
                            endOffset: h.highlightEnd,
                          })}
                          target="_blank"
                          rel="noreferrer"
                          title="在藏经打开（新标签页）"
                          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {h.refTitle} · 段 {h.ordinal + 1}
                        </a>
                      )}
                      <button
                        type="button"
                        title={excluded ? "重新纳入此条" : "取消注入此条"}
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: "0 2px",
                          fontSize: 12,
                          color: excluded ? "var(--primary)" : "var(--muted-foreground)",
                          flexShrink: 0,
                        }}
                        onClick={() =>
                          p.setRagExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(h.chunkId)) next.delete(h.chunkId);
                            else next.add(h.chunkId);
                            return next;
                          })
                        }
                      >
                        {excluded ? "＋" : "×"}
                      </button>
                    </div>
                    <p className="muted small" style={{ margin: 0, lineHeight: 1.5, wordBreak: "break-all" }}>
                      {h.snippetBefore}
                      {h.snippetMatch && (
                        <mark
                          style={{
                            background: "var(--primary)",
                            color: "var(--primary-foreground)",
                            borderRadius: 2,
                            padding: "0 1px",
                          }}
                        >
                          {h.snippetMatch}
                        </mark>
                      )}
                      {h.snippetAfter}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted small">暂无命中。你可以换关键词，或先去「藏经」确认已导入原著。</p>
        )
      ) : (
        <p className="muted small">用于把相关原文片段带进本次生成，减少胡编与设定漂移。</p>
      )}
        </>
      ) : null}
    </>
  );

  if (!useDisclosure) {
    return <div className="ai-panel-disclosure-body">{body}</div>;
  }

  const summaryId =
    variant === "sessionOnly" ? "ai-panel-rag-session-summary" : variant === "defaultsOnly" ? "ai-panel-rag-defaults-summary" : "ai-panel-rag-full-summary";

  return (
    <details ref={detailsRef} className="ai-panel-box" aria-labelledby={summaryId}>
      <summary id={summaryId}>{summaryLabel}</summary>
      {body}
    </details>
  );
}
