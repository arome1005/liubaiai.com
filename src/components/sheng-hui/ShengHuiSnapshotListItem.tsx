import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX, type ShengHuiSnapshot } from "../../util/sheng-hui-snapshots";
import { cn } from "../../lib/utils";

type SnapshotRow = ShengHuiSnapshot;

export function ShengHuiSnapshotListItem({
  s,
  selected,
  adopted,
  formatRelativeUpdateMs,
  onSelect,
  onUpdateMeta,
  busy,
}: {
  s: SnapshotRow;
  selected: boolean;
  adopted: boolean;
  formatRelativeUpdateMs: (ms: number) => string;
  onSelect: () => void;
  onUpdateMeta: (patch: { shortLabel?: string | null; starred?: boolean }) => void;
  busy: boolean;
}) {
  const [labelDraft, setLabelDraft] = useState(s.shortLabel ?? "");
  useEffect(() => {
    setLabelDraft(s.shortLabel ?? "");
  }, [s.id, s.shortLabel]);

  return (
    <div
      className={cn(
        "rounded-lg border text-left text-[11px] transition-colors",
        selected ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/20 hover:bg-accent/40",
      )}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("input,button")) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          const t = e.target as HTMLElement;
          if (t.closest("input,button")) return;
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-selected={selected}
    >
      <div className="flex gap-1.5 p-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title={s.starred ? "取消收藏" : "收藏，优先展示"}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onUpdateMeta({ starred: !s.starred });
          }}
        >
          <Star
            className={cn("size-3.5", s.starred ? "fill-amber-400 text-amber-500" : "text-muted-foreground/60")}
            strokeWidth={1.75}
            aria-hidden
          />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium text-foreground/90">
              {s.shortLabel?.trim() ? s.shortLabel.trim() : formatRelativeUpdateMs(s.createdAt)}
            </span>
            {s.shortLabel?.trim() ? (
              <span className="text-muted-foreground/80">{formatRelativeUpdateMs(s.createdAt)}</span>
            ) : null}
            {adopted ? (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                采纳
              </Badge>
            ) : null}
          </div>
          <input
            type="text"
            className="input mt-1.5 w-full h-7 rounded border border-border/50 bg-background/50 px-1.5 text-[10px] placeholder:text-muted-foreground/40"
            placeholder={`短名（${SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX} 字内，可选）`}
            maxLength={SHENG_HUI_SNAPSHOT_SHORT_LABEL_MAX}
            value={labelDraft}
            disabled={busy}
            onChange={(e) => setLabelDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => {
              const next = labelDraft.trim();
              const cur = (s.shortLabel ?? "").trim();
              if (next === cur) return;
              onUpdateMeta({ shortLabel: next || null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="快照短名"
          />
          <p className="mt-1.5 line-clamp-2 text-foreground/70">{s.outlinePreview}</p>
          <p className="mt-0.5 text-muted-foreground/55">{s.prose.replace(/\s/g, "").length} 字</p>
        </div>
      </div>
    </div>
  );
}
