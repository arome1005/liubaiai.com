import { memo, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import {
  AI_DRAFT_HISTORY_MAX_ENTRIES,
  AI_DRAFT_HISTORY_RETENTION_DAYS,
  deleteDraftHistoryEntry,
  readDraftHistory,
  type AiDraftHistoryEntry,
} from "../../util/ai-panel-draft";

/**
 * 写作侧栏「历史」独立弹窗（左列：列表 + 排序切换；右列：选中正文预览 + 操作）。
 *
 * 拆分动机（2026-04-26）：从 `AiPanel.tsx` 抽出 ~150 行 JSX + 4 个 state，
 * 避免继续把无共享状态的弹窗逻辑塞进 2k+ 行的页面组件。
 *
 * 调用方仅需暴露 entries 与 onRestore；删除/排序/选中态均自管。
 */

type HistorySortBy = "time" | "length";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: AiDraftHistoryEntry[];
  workId: string;
  chapterId: string | null;
  onRestore: (content: string) => void;
  onEntriesChanged: (next: AiDraftHistoryEntry[]) => void;
}

export const AiPanelHistoryDialog = memo(function AiPanelHistoryDialog(props: Props) {
  const { open, onOpenChange, entries, workId, chapterId, onRestore, onEntriesChanged } = props;

  const [activeSavedAt, setActiveSavedAt] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<HistorySortBy>("time");

  const sortedEntries = useMemo(() => {
    const list = [...entries];
    if (sortBy === "length") {
      list.sort((a, b) => b.content.length - a.content.length || b.savedAt - a.savedAt);
      return list;
    }
    list.sort((a, b) => b.savedAt - a.savedAt);
    return list;
  }, [entries, sortBy]);

  const activeEntry = useMemo(() => {
    if (sortedEntries.length === 0) return null;
    if (activeSavedAt == null) return sortedEntries[0];
    return sortedEntries.find((entry) => entry.savedAt === activeSavedAt) ?? sortedEntries[0];
  }, [sortedEntries, activeSavedAt]);

  // 弹窗打开 & 章节切换：保证选中态与当前列表一致
  useEffect(() => {
    if (!open) return;
    if (sortedEntries.length === 0) {
      setActiveSavedAt(null);
      return;
    }
    if (!activeEntry) {
      setActiveSavedAt(sortedEntries[0].savedAt);
    }
  }, [open, sortedEntries, activeEntry]);

  // 章节变更时清空选中态（父组件刷新 entries 时会触发）
  useEffect(() => {
    setActiveSavedAt(null);
  }, [chapterId]);

  function handleDelete(savedAt: number) {
    if (!workId || !chapterId) return;
    deleteDraftHistoryEntry(workId, chapterId, savedAt);
    const next = readDraftHistory(workId, chapterId);
    onEntriesChanged(next);
    if (next.length === 0) {
      setActiveSavedAt(null);
      return;
    }
    const stillExists = next.some((entry) => entry.savedAt === savedAt);
    if (!stillExists) setActiveSavedAt(next[0].savedAt);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="work-form-modal-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "z-[var(--z-modal-app-content)] max-h-[min(82vh,760px)] w-full max-w-[min(960px,calc(100vw-3rem))] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[min(960px,calc(100vw-3rem))]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <DialogTitle className="text-left text-lg font-semibold">
            生成历史（仅本章 · 本机约 {AI_DRAFT_HISTORY_RETENTION_DAYS} 天 · 每章最多{" "}
            {AI_DRAFT_HISTORY_MAX_ENTRIES} 条）
          </DialogTitle>
          <button type="button" className="icon-btn" title="关闭" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5" style={{ overflow: "auto" }}>
          {entries.length === 0 ? (
            <p className="muted small">暂无历史</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)",
                gap: 12,
                height: "min(72vh, 620px)",
                minHeight: 420,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  padding: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div className="muted small">历史列表（共 {entries.length} 条）</div>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setSortBy("time")}
                      style={{ opacity: sortBy === "time" ? 1 : 0.7 }}
                      title="按时间倒序"
                    >
                      按时间
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setSortBy("length")}
                      style={{ opacity: sortBy === "length" ? 1 : 0.7 }}
                      title="按字数倒序"
                    >
                      按字数
                    </button>
                  </div>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {sortedEntries.map((entry) => {
                    const active = activeEntry?.savedAt === entry.savedAt;
                    return (
                      <li key={entry.savedAt}>
                        <button
                          type="button"
                          onClick={() => setActiveSavedAt(entry.savedAt)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: active ? "1px solid var(--ring)" : "1px solid var(--border)",
                            borderRadius: 6,
                            background: active ? "var(--muted)" : "transparent",
                            padding: "8px 10px",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            className="muted small"
                            style={{
                              marginBottom: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <span>{new Date(entry.savedAt).toLocaleTimeString()}</span>
                            <span>{entry.content.length.toLocaleString()} 字</span>
                          </div>
                          <div
                            className="muted small"
                            style={{
                              lineHeight: 1.4,
                              wordBreak: "break-word",
                              maxHeight: 38,
                              overflow: "hidden",
                            }}
                          >
                            {entry.preview}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                {activeEntry ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span className="muted small">
                        选中记录：{new Date(activeEntry.savedAt).toLocaleTimeString()} ·{" "}
                        {activeEntry.content.length.toLocaleString()} 字
                      </span>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          type="button"
                          className="btn small"
                          title="恢复此版本到生成弹窗"
                          onClick={() => {
                            onRestore(activeEntry.content);
                            onOpenChange(false);
                          }}
                        >
                          恢复到生成弹窗
                        </button>
                        <button
                          type="button"
                          className="btn small secondary"
                          title="删除此条历史"
                          onClick={() => handleDelete(activeEntry.savedAt)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        padding: "12px 14px",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.62,
                        wordBreak: "break-word",
                      }}
                    >
                      {activeEntry.content}
                    </div>
                  </>
                ) : (
                  <div className="muted small" style={{ padding: "14px 12px" }}>
                    请从左侧选择一条历史记录
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});
