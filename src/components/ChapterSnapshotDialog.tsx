import { useState } from "react";
import type { ChapterSnapshot } from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import { simpleDiffLines, collapseDiff } from "../util/text-diff";
import { wordCount } from "../util/wordCount";

export interface ChapterSnapshotDialogProps {
  open: boolean;
  chapterTitle: string;
  snapshots: ChapterSnapshot[];
  currentContent: string;
  onManualSnapshot: () => void;
  onRestore: (snap: ChapterSnapshot) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ChapterSnapshotDialog({
  open,
  chapterTitle,
  snapshots,
  currentContent,
  onManualSnapshot,
  onRestore,
  onDelete,
  onClose,
}: ChapterSnapshotDialogProps) {
  const [diffSnapshotId, setDiffSnapshotId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="snap-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="snap-title">章节历史 · {chapterTitle}</h3>
        <p className="small muted">
          切换章节、手动保存（⌘S）、导出文件或备份 zip
          时会自动记录。每章最多 {SNAPSHOT_CAP_PER_CHAPTER}{" "}
          条；超过 {SNAPSHOT_MAX_AGE_MS / (24 * 60 * 60 * 1000)} 天的记录会自动删除，超出条数删最旧。
        </p>
        <div className="modal-footer modal-footer--start">
          <button type="button" className="btn primary small" onClick={onManualSnapshot}>
            保存当前版本
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="muted small">暂无历史版本。</p>
        ) : (
          <ul className="snapshot-list">
            {snapshots.map((s, idx) => (
              <li key={s.id} className="snapshot-item">
                <div className="snapshot-item-head">
                  <div className="snapshot-item-time-row">
                    <time dateTime={new Date(s.createdAt).toISOString()}>
                      {new Date(s.createdAt).toLocaleString()}
                    </time>
                    {idx === 0 && (
                      <span className="snapshot-badge-latest">最新</span>
                    )}
                    <span className="snapshot-wc">{wordCount(s.content).toLocaleString()} 字</span>
                  </div>
                  <div className="snapshot-item-actions">
                    <button type="button" className="btn small" onClick={() => onRestore(s)}>
                      恢复
                    </button>
                    <button
                      type="button"
                      className={"btn ghost small" + (diffSnapshotId === s.id ? " is-active" : "")}
                      onClick={() => setDiffSnapshotId((v) => (v === s.id ? null : s.id))}
                    >
                      {diffSnapshotId === s.id ? "收起对比" : "对比"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => onDelete(s.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <pre className="snapshot-preview">{s.content.slice(0, 120)}{s.content.length > 120 ? "…" : ""}</pre>
                {diffSnapshotId === s.id && (() => {
                  const diffLines = collapseDiff(simpleDiffLines(s.content, currentContent));
                  return (
                    <div className="snapshot-diff" aria-label="历史版本与当前版本对比">
                      <div className="snapshot-diff-legend">
                        <span className="snapshot-diff-legend-del">红 = 历史有、当前无</span>
                        <span className="snapshot-diff-legend-add">绿 = 历史无、当前有</span>
                      </div>
                      <pre className="snapshot-diff-body" aria-live="polite">
                        {diffLines.map((line, li) => (
                          <span
                            key={li}
                            className={
                              line.kind === "del"
                                ? "snapshot-diff-del"
                                : line.kind === "add"
                                  ? "snapshot-diff-add"
                                  : line.text.startsWith("···")
                                    ? "snapshot-diff-fold"
                                    : "snapshot-diff-same"
                            }
                          >
                            {line.kind === "del" ? "- " : line.kind === "add" ? "+ " : "  "}
                            {line.text}
                            {"\n"}
                          </span>
                        ))}
                      </pre>
                    </div>
                  );
                })()}
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
