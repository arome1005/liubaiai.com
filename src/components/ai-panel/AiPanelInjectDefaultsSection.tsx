import type { Dispatch, SetStateAction } from "react";
import type { Chapter } from "../../db/types";
import { CHAPTER_BIBLE_FIELD_LABELS, type ChapterBibleFieldKey } from "../../ai/assemble-context";
import { WORK_BIBLE_SECTION_HEADERS } from "../../ai/work-bible-sections";

/** 不含「注入本书锦囊」（该项仍在全局 `AiSettings` / AI 侧栏） */
export function AiPanelInjectDefaultsSection(props: {
  /** `plain`：仅表单区，由外层 `<details>` 提供折叠标题（设定 Tab 手风琴） */
  wrap?: "details" | "plain";
  includeBible: boolean;
  includeLinkedExcerpts: boolean;
  onIncludeLinkedExcerptsChange: (v: boolean) => void;
  includeRecentSummaries: boolean;
  onIncludeRecentSummariesChange: (v: boolean) => void;
  recentN: number;
  onRecentNChange: (v: number) => void;
  neighborSummaryPoolChapters: Chapter[];
  neighborSummaryIncludeById: Record<string, boolean>;
  setNeighborSummaryIncludeById: Dispatch<SetStateAction<Record<string, boolean>>>;
  chapterBibleInjectMask: Record<ChapterBibleFieldKey, boolean>;
  setChapterBibleInjectMask: Dispatch<SetStateAction<Record<ChapterBibleFieldKey, boolean>>>;
  workBibleSectionMask: Record<string, boolean>;
  setWorkBibleSectionMask: Dispatch<SetStateAction<Record<string, boolean>>>;
  currentContextMode: "full" | "summary" | "selection" | "none";
  onCurrentContextModeChange: (v: "full" | "summary" | "selection" | "none") => void;
  chapter: Chapter | null;
}) {
  const p = props;
  const wrap = p.wrap ?? "details";
  const fields = (
    <>
      <p className="muted small" style={{ marginBottom: 10, lineHeight: 1.55 }}>
        此处配置本书默认的注入项（摘录/邻章/板块/字段/当前章等）。
      </p>
      <label className="ai-panel-check row row--check">
        <input
          name="includeLinkedExcerpts"
          type="checkbox"
          checked={p.includeLinkedExcerpts}
          onChange={(e) => p.onIncludeLinkedExcerptsChange(e.target.checked)}
        />
        <span>注入本章关联摘录</span>
      </label>
      <div className="ai-panel-row">
        <label className="ai-panel-check row row--check" style={{ margin: 0 }}>
          <input
            name="includeRecentSummaries"
            type="checkbox"
            checked={p.includeRecentSummaries}
            onChange={(e) => p.onIncludeRecentSummariesChange(e.target.checked)}
          />
          <span>注入最近章节概要</span>
        </label>
        <input
          type="number"
          name="recentN"
          min={0}
          max={12}
          value={p.recentN}
          onChange={(e) => p.onRecentNChange(Number(e.target.value) || 0)}
          style={{ width: 72 }}
          title="最近 N 章"
        />
      </div>
      {p.includeRecentSummaries && p.neighborSummaryPoolChapters.length > 0 ? (
        <div className="ai-panel-subchecks" style={{ marginTop: 8 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            邻章概要包含章节（仅包含有概要的章；未勾选的章不会注入）
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {p.neighborSummaryPoolChapters.map((c) => (
              <label key={c.id} className="ai-panel-check row row--check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={p.neighborSummaryIncludeById[c.id] !== false}
                  onChange={(e) =>
                    p.setNeighborSummaryIncludeById((prev) => ({ ...prev, [c.id]: e.target.checked }))
                  }
                />
                <span className="small">{c.title}</span>
              </label>
            ))}
          </div>
        </div>
      ) : p.includeRecentSummaries && p.chapter ? (
        <p className="muted small" style={{ marginTop: 6 }}>
          邻章概要：当前窗口内无已填概要的章节（可先为前几章生成概要）。
        </p>
      ) : null}
      <div className="ai-panel-subchecks" style={{ marginTop: 10 }}>
        <div className="muted small" style={{ marginBottom: 6 }}>
          本章锦囊字段（user 上下文）— 未勾选的字段不会注入
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexWrap: "wrap" as const }}>
          {(Object.keys(CHAPTER_BIBLE_FIELD_LABELS) as ChapterBibleFieldKey[]).map((k) => (
            <label key={k} className="ai-panel-check row row--check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={p.chapterBibleInjectMask[k] !== false}
                onChange={(e) =>
                  p.setChapterBibleInjectMask((prev) => ({ ...prev, [k]: e.target.checked }))
                }
              />
              <span className="small">{CHAPTER_BIBLE_FIELD_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </div>
      {p.includeBible ? (
        <div className="ai-panel-subchecks" style={{ marginTop: 10 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            本书锦囊（全书导出 Markdown）板块 — 未勾选的板块不会注入
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {WORK_BIBLE_SECTION_HEADERS.map((h) => (
              <label key={h} className="ai-panel-check row row--check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={p.workBibleSectionMask[h] !== false}
                  onChange={(e) =>
                    p.setWorkBibleSectionMask((prev) => ({ ...prev, [h]: e.target.checked }))
                  }
                />
                <span className="small">{h}</span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 10 }}>
          当前未启用「注入本书锦囊」时，板块勾选在生成时不会生效；可在 AI Tab 打开锦囊注入后再来此调整板块。
        </p>
      )}
      <div className="ai-panel-row" style={{ marginTop: 10 }}>
        <label className="small muted">当前章注入（默认）</label>
        <select
          name="currentContextMode"
          value={p.currentContextMode}
          onChange={(e) => p.onCurrentContextModeChange(e.target.value as "full" | "summary" | "selection" | "none")}
        >
          <option value="full">全文</option>
          <option value="summary">概要</option>
          <option value="selection">选区</option>
          <option value="none">不注入</option>
        </select>
      </div>
    </>
  );

  if (wrap === "plain") {
    return <div className="ai-panel-box ai-panel-box--plain-fields">{fields}</div>;
  }

  return (
    <details className="ai-panel-box" aria-labelledby="ai-panel-inject-defaults-summary">
      <summary id="ai-panel-inject-defaults-summary">上下文注入 · 本书默认</summary>
      {fields}
    </details>
  );
}
