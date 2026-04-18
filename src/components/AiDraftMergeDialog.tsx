import { useEffect } from "react";
import { toast } from "sonner";
import { lineDiffRows, type TextLineDiffRow } from "../util/text-line-diff";

export type AiDraftMergePayload =
  | { kind: "insert"; payload: string }
  | { kind: "append"; payload: string }
  | { kind: "replace"; before: string; after: string };

export function AiDraftMergeDialog(props: {
  open: boolean;
  payload: AiDraftMergePayload | null;
  getSelectedText: () => string;
  onCancel: () => void;
  onConfirm: (p: AiDraftMergePayload) => void;
}) {
  const { open, payload, getSelectedText, onCancel, onConfirm } = props;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !payload) return null;

  const p = payload;

  function handleConfirm() {
    if (p.kind === "replace") {
      const now = getSelectedText().trim();
      if (now !== p.before.trim()) {
        toast.error("选区已变化，请重新在正文中选中要替换的原文后再试。");
        onCancel();
        return;
      }
    }
    onConfirm(p);
  }

  let diffRows: TextLineDiffRow[] | null = null;
  if (p.kind === "replace") {
    diffRows = lineDiffRows(p.before, p.after);
  }

  const title =
    p.kind === "insert" ? "确认插入到光标" : p.kind === "append" ? "确认追加到章尾" : "确认替换选区";

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card modal-card--wide ai-merge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-merge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="ai-merge-title">{title}</h3>
        <p className="small muted">
          {p.kind === "replace"
            ? "以下为选区原文与 AI 草稿的行级对比（红删绿增）；确认后将写入正文并触发自动保存。"
            : "以下为将写入编辑器的内容预览；确认后将插入正文并触发自动保存。"}
        </p>

        {p.kind === "insert" ? <pre className="ai-merge-preview">{p.payload}</pre> : null}
        {p.kind === "append" ? <pre className="ai-merge-preview">{p.payload}</pre> : null}

        {p.kind === "replace" && diffRows ? (
          <div className="ai-merge-diff" role="region" aria-label="行级差异">
            {diffRows.map((row, idx) => (
              <div
                key={idx}
                className={
                  row.kind === "del"
                    ? "ai-merge-diff-line ai-merge-diff-line--del"
                    : row.kind === "ins"
                      ? "ai-merge-diff-line ai-merge-diff-line--ins"
                      : "ai-merge-diff-line ai-merge-diff-line--same"
                }
              >
                <span className="ai-merge-diff-mark" aria-hidden="true">
                  {row.kind === "del" ? "−" : row.kind === "ins" ? "+" : " "}
                </span>
                <span className="ai-merge-diff-text">{row.line || " "}</span>
              </div>
            ))}
          </div>
        ) : null}

        {p.kind === "replace" && !diffRows ? (
          <div className="ai-merge-two-col">
            <div className="ai-merge-col">
              <div className="ai-merge-col-title">选区原文</div>
              <pre className="ai-merge-preview">{p.before}</pre>
            </div>
            <div className="ai-merge-col">
              <div className="ai-merge-col-title">替换为（AI 草稿）</div>
              <pre className="ai-merge-preview">{p.after}</pre>
            </div>
          </div>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={handleConfirm}>
            确认合并
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
