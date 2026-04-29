import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { ShengHuiManuscriptReadView } from "./ShengHuiManuscriptReadView";
import { ShengHuiManuscriptPaperGrain } from "./ShengHuiManuscriptPaperGrain";
import type { ShengHuiParagraphToolbarAction } from "../../ai/sheng-hui-paragraph-toolbar-messages";

type Props = {
  output: string;
  onOutputChange: (v: string) => void;
  busy: boolean;
  modeDesc: string;
  paperTint: string;
  focusMode: boolean;
  emotionLabel: string;
  isEditing: boolean;
  onRequestEdit: () => void;
  onRequestRead: () => void;
  paragraphToolbar?: {
    onAction: (action: ShengHuiParagraphToolbarAction, index: number) => void;
    disabled: boolean;
    busyIndex: number | null;
  };
};

/**
 * N1：阅读态（`ShengHuiManuscriptReadView`）与编辑态 textarea 二选一；编辑/阅读切换在父级工具栏（见 `ShengHuiCenterManuscriptColumn`）。
 */
export function ShengHuiManuscriptDualModeBody(props: Props) {
  const {
    output,
    onOutputChange,
    busy,
    modeDesc,
    paperTint,
    focusMode,
    emotionLabel,
    isEditing,
    onRequestEdit,
    onRequestRead,
    paragraphToolbar,
  } = props;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const showRead = !busy && !isEditing;

  useEffect(() => {
    if (isEditing && !busy) {
      const id = requestAnimationFrame(() => {
        areaRef.current?.focus();
        const el = areaRef.current;
        if (el) {
          const n = el.value.length;
          el.setSelectionRange(n, n);
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isEditing, busy]);

  const body = showRead ? (
    <ShengHuiManuscriptReadView
      className="min-h-0 flex-1"
      text={output}
      paperTint={paperTint}
      focusMode={focusMode}
      emptyLabel={`主稿为空。点工具栏「编辑主稿」或在此双击开始（${modeDesc}）`}
      onRequestEdit={onRequestEdit}
      paragraphToolbar={paragraphToolbar}
    />
  ) : (
    <textarea
      ref={areaRef}
      className={cn(
        "sheng-hui-paper sheng-hui-paper-typography sheng-hui-latin-mixed min-h-0 flex-1 resize-none overflow-y-auto rounded-xl border border-border/40 p-4 text-foreground placeholder:text-muted-foreground/40 focus:border-primary/35 focus:outline-none focus:ring-2 focus:ring-primary/15",
        paperTint,
        focusMode && "text-[17px] leading-[1.9] sm:text-[18px]",
        !focusMode && "bg-background/80",
        focusMode && "bg-background/90",
      )}
      placeholder={busy ? "生成中…" : `在此编辑正文（${modeDesc} · 情绪${emotionLabel}）`}
      value={output}
      onChange={(e) => onOutputChange(e.target.value)}
      aria-label="生辉主稿"
      disabled={busy}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          onRequestRead();
        }
      }}
    />
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl",
        busy && "sheng-hui-manuscript-surface--streaming",
      )}
    >
      <ShengHuiManuscriptPaperGrain />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
      </div>
    </div>
  );
}
