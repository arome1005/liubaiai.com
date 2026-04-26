import { useMemo, useState } from "react";
import type { ExportBookOptions } from "../storage/export-txt-docx";
import type { Chapter } from "../db/types";

export interface ExportBookDialogProps {
  open: boolean;
  format: "txt" | "docx";
  chapters: Chapter[];
  onExport: (opts: ExportBookOptions) => void;
  onClose: () => void;
}

export function ExportBookDialog({ open, format, chapters, onExport, onClose }: ExportBookDialogProps) {
  if (!open) return null;
  return <ExportBookDialogInner format={format} chapters={chapters} onExport={onExport} onClose={onClose} />;
}

function ExportBookDialogInner({
  format,
  chapters,
  onExport,
  onClose,
}: Omit<ExportBookDialogProps, "open">) {
  const { minO, maxO } = useMemo(() => {
    const min = chapters.length ? Math.min(...chapters.map((c) => c.order)) : 0;
    const max = chapters.length ? Math.max(...chapters.map((c) => c.order)) : 0;
    return { minO: min, maxO: max };
  }, [chapters]);

  const [rangeMode, setRangeMode] = useState<"all" | "range">("all");
  const [fromOrder, setFromOrder] = useState(minO);
  const [toOrder, setToOrder] = useState(maxO);
  const [foreword, setForeword] = useState("");
  const [afterword, setAfterword] = useState("");

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="export-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="export-dialog-title">导出全书（{format.toUpperCase()}）</h3>

        <div className="export-dialog-section">
          <div className="export-dialog-label">导出范围</div>
          <div className="export-dialog-range-row">
            <label className="export-dialog-radio">
              <input
                type="radio"
                checked={rangeMode === "all"}
                onChange={() => setRangeMode("all")}
              />
              全书（{chapters.length} 章）
            </label>
            <label className="export-dialog-radio">
              <input
                type="radio"
                checked={rangeMode === "range"}
                onChange={() => setRangeMode("range")}
              />
              自定义章节范围
            </label>
          </div>
          {rangeMode === "range" && (
            <div className="export-dialog-range-inputs">
              <label>
                从 order
                <input
                  type="number"
                  className="export-dialog-num"
                  value={fromOrder}
                  min={0}
                  onChange={(e) => setFromOrder(Number(e.target.value) || 0)}
                />
              </label>
              <span>—</span>
              <label>
                到 order
                <input
                  type="number"
                  className="export-dialog-num"
                  value={toOrder}
                  min={0}
                  onChange={(e) => setToOrder(Number(e.target.value) || 0)}
                />
              </label>
              <span className="muted small">
                （匹配 {chapters.filter((c) => c.order >= fromOrder && c.order <= toOrder).length} 章）
              </span>
            </div>
          )}
        </div>

        <div className="export-dialog-section">
          <label className="export-dialog-label" htmlFor="export-foreword">
            前言（可空）
          </label>
          <textarea
            id="export-foreword"
            value={foreword}
            onChange={(e) => setForeword(e.target.value)}
            rows={4}
            placeholder="在书名后、正文前插入前言文字…"
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div className="export-dialog-section">
          <label className="export-dialog-label" htmlFor="export-afterword">
            后记（可空）
          </label>
          <textarea
            id="export-afterword"
            value={afterword}
            onChange={(e) => setAfterword(e.target.value)}
            rows={4}
            placeholder="在正文后插入后记文字…"
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const opts: ExportBookOptions = {
                foreword: foreword || undefined,
                afterword: afterword || undefined,
                fromOrder: rangeMode === "range" ? fromOrder : undefined,
                toOrder: rangeMode === "range" ? toOrder : undefined,
              };
              onClose();
              onExport(opts);
            }}
          >
            确认导出
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
