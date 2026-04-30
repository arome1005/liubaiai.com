import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Chapter, Volume } from "../../db/types";
import { estimateExtractInputPreview } from "../../util/ai-bulk-extract-prompt";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

function formatChars(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`;
  return n.toLocaleString();
}

export function StudyImportChapterLinkDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: Chapter[];
  volumes: Volume[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { open, onOpenChange, chapters, volumes, selectedIds, onConfirm, disabled } = props;

  const sortedValid = useMemo(() => {
    return [...chapters]
      .filter((c) => (c.content ?? "").trim())
      .sort((a, b) => a.order - b.order);
  }, [chapters]);

  const volumeTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of volumes) m.set(v.id, v.title || "未命名卷");
    return m;
  }, [volumes]);

  const [localIds, setLocalIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setLocalIds(new Set(selectedIds.length > 0 ? selectedIds : sortedValid.slice(0, 50).map((c) => c.id)));
    }
  }, [open, selectedIds, sortedValid]);

  const [orderFrom, setOrderFrom] = useState("");
  const [orderTo, setOrderTo] = useState("");

  const preview = useMemo(
    () => estimateExtractInputPreview(chapters, [...localIds]),
    [chapters, localIds],
  );

  function toggle(id: string) {
    setLocalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyOrderRange() {
    const a = parseInt(orderFrom, 10);
    const b = parseInt(orderTo, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      toast.error("请输入有效的章节序号。");
      return;
    }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const ids = sortedValid.filter((c) => c.order >= lo && c.order <= hi).map((c) => c.id);
    if (ids.length === 0) {
      toast.error("该序号范围内没有可用正文章节。");
      return;
    }
    setLocalIds(new Set(ids));
  }

  function handleConfirm() {
    if (localIds.size === 0) {
      toast.error("请至少关联一章有正文的章节。");
      return;
    }
    onConfirm([...localIds]);
    onOpenChange(false);
  }

  /** 当前是否已勾选全部「有正文」章节（用于全选 / 取消全选切换） */
  const allBodySelected = useMemo(() => {
    if (sortedValid.length === 0) return false;
    if (localIds.size !== sortedValid.length) return false;
    return sortedValid.every((c) => localIds.has(c.id));
  }, [sortedValid, localIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="nested-app-dialog-2-overlay"
        showCloseButton
        className={cn(
          "z-[var(--z-modal-nested-2-content)] flex h-[min(86vh,620px)] w-full max-w-[min(48rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(48rem,calc(100vw-2rem))]",
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-border/50 px-4 py-2.5">
          <DialogTitle className="text-sm font-semibold">关联章节</DialogTitle>
          <p className="text-[11px] leading-snug text-muted-foreground">勾选正文；单章与总量超出上限时自动截断。</p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* 单行：序号区间 + 全选 / 取消全选 */}
          <div className="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[11px] shrink-0 text-muted-foreground">序号</span>
              <Input
                className="h-7 w-12 px-1.5 text-xs tabular-nums"
                type="number"
                placeholder="起"
                value={orderFrom}
                disabled={disabled}
                onChange={(e) => setOrderFrom(e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">—</span>
              <Input
                className="h-7 w-12 px-1.5 text-xs tabular-nums"
                type="number"
                placeholder="止"
                value={orderTo}
                disabled={disabled}
                onChange={(e) => setOrderTo(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                variant="secondary"
                disabled={disabled}
                onClick={() => applyOrderRange()}
              >
                应用区间
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs sm:ml-auto"
                disabled={disabled || sortedValid.length === 0}
                onClick={() => {
                  if (allBodySelected) {
                    setLocalIds(new Set());
                  } else {
                    setLocalIds(new Set(sortedValid.map((c) => c.id)));
                  }
                }}
              >
                {allBodySelected ? "取消全选" : "全选正文"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-b border-border/30 px-2">
            <ul className="divide-y divide-border/40 py-1">
              {sortedValid.map((c) => {
                const checked = localIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(c.id)}
                      />
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="font-medium">第 {c.order} 章</span>
                        <span className="text-muted-foreground"> · {c.title || "无题"}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground/90">
                          {volumeTitleById.get(c.volumeId) ?? ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="shrink-0 space-y-0.5 border-t border-border/40 bg-muted/15 px-3 py-1.5 text-[10px] leading-tight text-muted-foreground">
            <p>
              已选 <span className="font-medium text-foreground">{localIds.size}</span> 章，有效约{" "}
              <span className="font-medium text-foreground">{preview.effectiveChapters}</span> 章
              {preview.truncated ? "（已触总字数上限）" : ""} · 正文 <span className="font-medium text-foreground">{formatChars(preview.totalChars)}</span> 字 · 输入约{" "}
              <span className="font-medium text-foreground">{preview.inputTokensApprox.toLocaleString()}</span> token
            </p>
            <p className="text-[9px] opacity-90">粗算非计费凭证；输出 token 另计。</p>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/50 px-4 py-2.5">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" size="sm" disabled={disabled} onClick={() => handleConfirm()}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
