import { lineDiffRows } from "../../util/text-line-diff";
import type { Chapter } from "../../db/types";
import type { ShengHuiSnapshotBucket } from "../../util/sheng-hui-snapshots";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

type SnapshotRow = ShengHuiSnapshotBucket["snapshots"][number];

export function ShengHuiRightVersionsBlock(props: {
  snapshotsNewestFirst: SnapshotRow[];
  snapshotBucket: ShengHuiSnapshotBucket;
  selectedSnapshotId: string | null;
  onSelectSnapshot: (s: SnapshotRow) => void;
  selectedChapter: Chapter | undefined;
  compareSnapshotId: string | null;
  onCompareSnapshotIdChange: (id: string | null) => void;
  showDiff: boolean;
  onShowDiffChange: (v: boolean) => void;
  formatRelativeUpdateMs: (ms: number) => string;
  busy: boolean;
  onMarkAdopted: () => void;
  onRemoveSelected: () => void;
}) {
  const {
    snapshotsNewestFirst,
    snapshotBucket,
    selectedSnapshotId,
    onSelectSnapshot,
    selectedChapter,
    compareSnapshotId,
    onCompareSnapshotIdChange,
    showDiff,
    onShowDiffChange,
    formatRelativeUpdateMs,
    busy,
    onMarkAdopted,
    onRemoveSelected,
  } = props;

  const bSel = selectedSnapshotId
    ? snapshotBucket.snapshots.find((s) => s.id === selectedSnapshotId)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">版本历史</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">每次生成自动保存快照（本机·按章节）</p>

      {snapshotsNewestFirst.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60">尚无快照</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {snapshotsNewestFirst.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSnapshot(s)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors",
                selectedSnapshotId === s.id ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-accent",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{formatRelativeUpdateMs(s.createdAt)}</span>
                {snapshotBucket.adoptedId === s.id ? (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    采纳
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-2 text-foreground/70">{s.outlinePreview}</p>
              <p className="mt-0.5 text-muted-foreground/55">{s.prose.replace(/\s/g, "").length} 字</p>
            </button>
          ))}
        </div>
      )}

      {(snapshotsNewestFirst.length >= 2 || (snapshotsNewestFirst.length >= 1 && selectedChapter?.content)) && (
        <div className="border-t border-border/40 pt-2">
          <p className="mb-1 text-[10px] text-muted-foreground">版本对比</p>
          <select
            className="input wence-select w-full text-xs"
            value={compareSnapshotId ?? ""}
            onChange={(e) => {
              onCompareSnapshotIdChange(e.target.value || null);
              onShowDiffChange(!!e.target.value);
            }}
          >
            <option value="">选择对比对象…</option>
            {selectedChapter?.content ? <option value="__chapter__">当前正文（章节内容）</option> : null}
            {snapshotsNewestFirst
              .filter((s) => s.id !== selectedSnapshotId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {formatRelativeUpdateMs(s.createdAt)} · {s.prose.replace(/\s/g, "").length}字
                </option>
              ))}
          </select>
          {showDiff && compareSnapshotId && selectedSnapshotId && bSel && (() => {
            const aText =
              compareSnapshotId === "__chapter__"
                ? (selectedChapter?.content ?? "")
                : (snapshotBucket.snapshots.find((s) => s.id === compareSnapshotId)?.prose ?? "");
            const bText = bSel.prose;
            if (!aText || !bText) return null;
            const rows = lineDiffRows(aText, bText);
            if (!rows) {
              return <p className="mt-1 text-[10px] text-muted-foreground/60">内容过长，无法对比。</p>;
            }
            return (
              <div className="mt-1.5 max-h-64 overflow-y-auto rounded border border-border/40 bg-background/60 p-1.5 text-[10px] leading-relaxed">
                {rows.map((r, i) => (
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
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {selectedSnapshotId && bSel ? (
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-3">
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={onMarkAdopted} disabled={busy}>
            标为当前采纳
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            onClick={onRemoveSelected}
            disabled={busy}
          >
            删除此快照
          </Button>
          <p className="text-[10px] leading-relaxed text-muted-foreground/60">
            「写回侧栏草稿」后前往写作页合并，采纳标记仅本页辨认用。
          </p>
        </div>
      ) : null}
    </div>
  );
}
