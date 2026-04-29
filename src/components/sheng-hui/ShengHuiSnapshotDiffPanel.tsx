import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  lineDiffOrNull,
  type TextLineDiffRow,
  buildShengHuiTokenDiffOps,
  buildShengHuiTokenSideBySideLines,
  mergeShengHuiHunksFromOps,
  tokenizeShengHuiProse,
  type ShengHuiTextHunk,
} from "../../util/sheng-hui-token-diff";

type Props = {
  aText: string;
  bText: string;
  leftLabel: string;
  rightLabel: string;
  /** 与「当前正文」对比时展示按块应用 */
  showHunkApply: boolean;
  busy: boolean;
  onApplyHunk: (h: ShengHuiTextHunk) => void | Promise<void>;
};

/**
 * 版本对比：词元级并排 + 行级回退；支持将单块应用回左侧（章节正文）原文。
 */
export function ShengHuiSnapshotDiffPanel(props: Props) {
  const { aText, bText, leftLabel, rightLabel, showHunkApply, busy, onApplyHunk } = props;
  const [view, setView] = useState<"word" | "line">("word");

  const { ops, lineRows, sideLines, tooLong, hunks } = useMemo(() => {
    if (!aText || !bText) {
      return {
        ops: null as null,
        lineRows: null as TextLineDiffRow[] | null,
        sideLines: [] as ReturnType<typeof buildShengHuiTokenSideBySideLines>,
        tooLong: false,
        hunks: [] as ShengHuiTextHunk[],
      };
    }
    const long =
      tokenizeShengHuiProse(aText) === null || tokenizeShengHuiProse(bText) === null;
    const o = long ? null : buildShengHuiTokenDiffOps(aText, bText);
    if (o === null) {
      return {
        ops: null as null,
        lineRows: lineDiffOrNull(aText, bText),
        sideLines: [] as ReturnType<typeof buildShengHuiTokenSideBySideLines>,
        tooLong: long,
        hunks: [] as ShengHuiTextHunk[],
      };
    }
    return {
      ops: o,
      lineRows: null as TextLineDiffRow[] | null,
      sideLines: buildShengHuiTokenSideBySideLines(o),
      tooLong: false,
      hunks: mergeShengHuiHunksFromOps(aText, o),
    };
  }, [aText, bText]);

  const canWord = view === "word" && ops;

  if (!aText || !bText) {
    return <p className="mt-1 text-[10px] text-muted-foreground/60">无内容可对比。</p>;
  }

  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[9px] text-muted-foreground/70">对比模式</p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={view === "word" ? "secondary" : "ghost"}
            className="h-6 px-1.5 text-[9px]"
            onClick={() => setView("word")}
          >
            词元 · 并排
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "line" ? "secondary" : "ghost"}
            className="h-6 px-1.5 text-[9px]"
            onClick={() => setView("line")}
          >
            行内联
          </Button>
        </div>
      </div>
      {view === "word" && !canWord && (tooLong || !ops) ? (
        <p className="text-[9px] text-amber-600/90 dark:text-amber-500/80">
          因篇幅过长，已回退为行内联 diff。
        </p>
      ) : null}

      {view === "line" || !canWord ? (
        <div className="max-h-64 overflow-y-auto rounded border border-border/40 bg-background/60 p-1.5 text-[10px] leading-relaxed">
          {lineRows
            ? lineRows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    r.kind === "del" && "bg-red-500/10 text-red-600 dark:text-red-400",
                    r.kind === "ins" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    r.kind === "same" && "text-muted-foreground/60",
                  )}
                >
                  {r.kind === "del" ? "− " : r.kind === "ins" ? "+ " : "  "}
                  {r.line || "\u00a0"}
                </div>
              ))
            : (
            <p className="text-[10px] text-muted-foreground/60">内容过长，无法对比。</p>
            )}
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded border border-border/40 bg-background/60 p-1">
          <div className="mb-0.5 grid grid-cols-2 gap-px text-[8px] font-medium text-muted-foreground/80">
            <div className="border-b border-border/30 bg-muted/30 px-1 py-0.5">{leftLabel}</div>
            <div className="border-b border-border/30 bg-muted/30 px-1 py-0.5">{rightLabel}</div>
          </div>
          {sideLines.map((line) => (
            <div
              key={line.key}
              className={cn(
                "grid grid-cols-2 gap-px border-b border-border/20",
                !line.isChange && "text-muted-foreground/75",
              )}
            >
              <div
                className={cn(
                  "min-h-[1.1rem] whitespace-pre-wrap break-words px-0.5 py-0.5",
                  line.isChange && "bg-red-500/8 text-foreground/95",
                )}
              >
                {line.left || "\u00a0"}
              </div>
              <div
                className={cn(
                  "min-h-[1.1rem] whitespace-pre-wrap break-words px-0.5 py-0.5",
                  line.isChange && "bg-emerald-500/8 text-foreground/95",
                )}
              >
                {line.right || "\u00a0"}
              </div>
            </div>
          ))}
        </div>
      )}

      {showHunkApply && canWord && hunks.length > 0 ? (
        <div className="space-y-1 border-t border-border/30 pt-1.5">
          <p className="text-[9px] text-muted-foreground/80">将快照差异按块写回「当前正文」</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {hunks.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-1 rounded border border-border/30 bg-card/30 p-1">
                <p className="line-clamp-2 min-w-0 text-[9px] text-muted-foreground/80">
                  <span className="text-[8px] text-foreground/70">{h.id}</span> 删 {h.oldText.length} 字
                  {h.newText ? ` → 换 ${h.newText.length} 字` : "（删除块）"}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="h-6 shrink-0 px-1.5 text-[8px]"
                  disabled={busy}
                  onClick={() => void onApplyHunk(h)}
                >
                  写回
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
