import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { AiInlineErrorNotice } from "../AiInlineErrorNotice";
import { useImperativeDialog } from "../ImperativeDialog";
import { cn } from "../../lib/utils";
import { GEN_PHASE_UI, type GenPhase } from "./useGenPhase";
import { OUTLINE_SOURCE_LABEL, type OutlineSource } from "./useOutlineSource";

export interface OutlineGenerationDraftMeta {
  provider: string;
  mode: string;
  roughTokens: number;
  generatedAt: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  phase: GenPhase;

  // 头部副信息
  outlineSource: OutlineSource;
  /** 已被解析过的友好模型名（如「豆包 · 观云」） */
  providerLabel: string;

  // 草稿
  draft: string;
  onDraftChange: (next: string) => void;
  /** true: textarea 当前显示细纲（待生正文）；false: 显示生成中的/已完成正文 */
  seedMode: boolean;
  onStartGenerate: () => void;

  /** 用户自定义本章正文字数（0/空 → 不约束）。包含标点。 */
  targetWordCount: number;
  onTargetWordCountChange: (next: number) => void;

  // 错误
  error: string | null;

  // 写入动作（已完成且 draft 非空时可点）
  selectedText: string;
  onAbort: () => void;
  onRetry: () => void;
  canRetry: boolean;
  onInsertToCursor: (text: string) => void;
  onAppendToEnd: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  ensureChapterViewBeforeInsert?: () => void;

  /** 调用方在非 dialog 路径上展示的额外内容（token 用量、调性提示、术语命中） */
  extraSlot?: React.ReactNode;
}

export const OutlineGenerationDialog = memo(function OutlineGenerationDialog(props: Props) {
  const { confirm } = useImperativeDialog();
  const {
    open,
    onOpenChange,
    busy,
    phase,
    outlineSource,
    providerLabel,
    draft,
    onDraftChange,
    seedMode,
    onStartGenerate,
    targetWordCount,
    onTargetWordCountChange,
    error,
    selectedText,
    onAbort,
    onRetry,
    canRetry,
    onInsertToCursor,
    onAppendToEnd,
    onReplaceSelection,
    ensureChapterViewBeforeInsert,
    extraSlot,
  } = props;

  /** 「插入正文 / 追加章尾」点击后的短暂确认态（1.5 秒）→ 防双击 + 反馈 */
  const [justInsertedKind, setJustInsertedKind] = useState<null | "insert" | "append">(null);
  const justInsertedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (justInsertedTimerRef.current) window.clearTimeout(justInsertedTimerRef.current);
  }, []);

  // 弹窗关闭时清掉「已插入 ✓」短暂态；避免 render 阶段 setState。
  useEffect(() => {
    if (!open) setJustInsertedKind(null);
  }, [open]);

  // 流式时把 textarea 滚到底部
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (phase !== "streaming") return;
    const el = textareaRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [draft, phase]);

  const canActOnDraft = phase === "done" && draft.trim().length > 0;
  const canStartGenerate = seedMode && !busy && draft.trim().length > 0;

  // 直接写入正文（不走差异确认弹窗），并展示 toast
  const handleInsert = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    ensureChapterViewBeforeInsert?.();
    onInsertToCursor(t + "\n\n");
    toast.success(`已插入正文 · 约 ${t.length.toLocaleString()} 字`);
    setJustInsertedKind("insert");
    if (justInsertedTimerRef.current) window.clearTimeout(justInsertedTimerRef.current);
    justInsertedTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
    }, 600);
  }, [draft, ensureChapterViewBeforeInsert, onInsertToCursor, onOpenChange]);

  const handleAppend = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    ensureChapterViewBeforeInsert?.();
    onAppendToEnd("\n\n" + t + "\n");
    toast.success(`已追加到章尾 · 约 ${t.length.toLocaleString()} 字`);
    setJustInsertedKind("append");
    if (justInsertedTimerRef.current) window.clearTimeout(justInsertedTimerRef.current);
    justInsertedTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
    }, 600);
  }, [draft, ensureChapterViewBeforeInsert, onAppendToEnd, onOpenChange]);

  const handleReplaceSelect = useCallback(() => {
    const t = draft.trim();
    const before = selectedText.trim();
    if (!t || !before) return;
    ensureChapterViewBeforeInsert?.();
    onReplaceSelection(t);
  }, [draft, selectedText, ensureChapterViewBeforeInsert, onReplaceSelection]);

  // Cmd/Ctrl+Enter 快捷键 → 插入正文
  useEffect(() => {
    if (!open || !canActOnDraft) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleInsert();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canActOnDraft, handleInsert]);

  // 生成中点 × 关闭：先确认是否取消并关闭
  const handleOpenChange = useCallback(
    async (next: boolean) => {
      if (!next && busy) {
        const ok = await confirm("正在生成中，是否取消并关闭？");
        if (!ok) return;
        onAbort();
      }
      onOpenChange(next);
    },
    [busy, confirm, onAbort, onOpenChange],
  );

  const phaseUi = GEN_PHASE_UI[phase];
  const statusUi = seedMode
    ? { label: "待生成正文", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", pulsing: false }
    : phaseUi;
  const insertLabel = justInsertedKind === "insert" ? "已插入 ✓" : "插入正文";
  const appendLabel = justInsertedKind === "append" ? "已追加 ✓" : "追加章尾";
  const outputChars = useMemo(() => (seedMode ? 0 : draft.replace(/\s+/g, "").length), [draft, seedMode]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="work-form-modal-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "z-[var(--z-modal-app-content)] max-h-[min(85vh,800px)] w-full max-w-[min(1200px,calc(100vw-3rem))] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg sm:max-w-[min(1200px,calc(100vw-3rem))]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/40 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 shrink-0">
              <DialogTitle className="text-left text-lg font-semibold">本章正文生成</DialogTitle>
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  statusUi.cls,
                )}
              >
                {statusUi.pulsing && (
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
                {statusUi.label}
              </span>
            </div>
            <div
              className="muted small"
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem 0.9rem" }}
            >
              <span>细纲来源：<strong>{OUTLINE_SOURCE_LABEL[outlineSource]}</strong></span>
              <span>本次输出：<strong>{outputChars.toLocaleString()}</strong> 字（含标点符号）</span>
              <span>当前模型：<strong>{providerLabel}</strong></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                正文字数设定
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={targetWordCount > 0 ? targetWordCount : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onTargetWordCountChange(0);
                      return;
                    }
                    const n = Number.parseInt(raw, 10);
                    onTargetWordCountChange(Number.isFinite(n) && n > 0 ? n : 0);
                  }}
                  placeholder="自定义"
                  title="期望生成的本章正文字数（含标点）。留空表示不约束。"
                  style={{
                    width: 90,
                    padding: "2px 6px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "0.8rem",
                    lineHeight: 1.2,
                  }}
                />
              </span>
            </div>
          </div>
          <button type="button" className="icon-btn" title="关闭" onClick={() => handleOpenChange(false)}>
            ×
          </button>
        </div>

        <div className="p-4 sm:p-5" style={{ overflow: "auto" }}>
          {seedMode ? (
            <div
              className="muted small"
              style={{
                marginBottom: 8,
                padding: "6px 10px",
                border: "1px dashed var(--border)",
                borderRadius: 6,
                background: "var(--muted)",
              }}
            >
              已自动带入细纲，可先手动修改；确认后点击左下角「生成正文」开始流式生成。
            </div>
          ) : null}
          <label className="ai-panel-field ai-panel-field--draft">
            <textarea
              ref={textareaRef}
              name="aiDraft"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={12}
              style={
                seedMode
                  ? {
                      background: "color-mix(in srgb, var(--muted) 42%, var(--background))",
                      borderColor: "color-mix(in srgb, var(--ring) 35%, var(--border))",
                    }
                  : undefined
              }
            />
          </label>

          {error ? (
            <div style={{ marginTop: 10 }}>
              <AiInlineErrorNotice message={error} />
            </div>
          ) : null}

          <div
            className="ai-panel-actions"
            style={{ justifyContent: "space-between", marginTop: 10, gap: 8, flexWrap: "wrap" }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={cn("btn", seedMode ? "primary" : undefined)}
                disabled={seedMode ? !canStartGenerate : !busy}
                title={seedMode ? "用当前细纲开始生成正文" : (busy ? "中止当前生成" : "当前未在生成")}
                onClick={seedMode ? onStartGenerate : onAbort}
              >
                {seedMode ? "生成正文" : "取消生成"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={seedMode || busy || !canRetry}
                title={seedMode ? "开始生成后可重试" : (canRetry ? "用相同上下文重新生成一次" : "尚无可重试的请求")}
                onClick={onRetry}
              >
                重试
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                disabled={!canActOnDraft || justInsertedKind !== null}
                title="把生成结果追加到本章末尾"
                onClick={handleAppend}
              >
                {appendLabel}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!canActOnDraft || !selectedText.trim() || justInsertedKind !== null}
                title={selectedText.trim() ? "用生成结果替换当前选区（弹差异确认）" : "请先选中要替换的文本"}
                onClick={handleReplaceSelect}
              >
                替换选区
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!canActOnDraft || justInsertedKind !== null}
                title={
                  canActOnDraft
                    ? "把生成结果插入到中间正文编辑区（光标处）"
                    : seedMode
                      ? "请先在上方点击「生成正文」，完成流式输出后再插入（当前大框是细纲，0 字时尚无可插入的正文）"
                      : "生成完成且上方有输出时可插入；若正停留在「章纲」侧栏，插入会自动切到「章节正文」"
                }
                onClick={handleInsert}
              >
                {insertLabel}
              </button>
            </div>
          </div>

          {extraSlot}
        </div>
      </DialogContent>
    </Dialog>
  );
});
