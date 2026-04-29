import type { Chapter } from "../../db/types";
import type { ShengHuiSnapshotBucket } from "../../util/sheng-hui-snapshots";
import type { ShengHuiTextHunk } from "../../util/sheng-hui-token-diff";
import { Button } from "../ui/button";
import { ShengHuiSnapshotListItem } from "./ShengHuiSnapshotListItem";
import { ShengHuiSnapshotDiffPanel } from "./ShengHuiSnapshotDiffPanel";
import { ShengHuiSelfReviewSection } from "./ShengHuiSelfReviewSection";

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
  onUpdateSnapshotMeta: (snapshotId: string, patch: { shortLabel?: string | null; starred?: boolean }) => void;
  compareIsChapterVsSelected: boolean;
  onApplySnapshotHunkToChapter: (h: ShengHuiTextHunk) => void | Promise<void>;
  selfReviewBusy: boolean;
  selfReviewCanRun: boolean;
  onSelfReviewRun: () => void;
  onSelfReviewStop: () => void;
  selfReviewText: string | null;
  selfReviewError: string | null;
  onSelfReviewDismissError: () => void;
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
    onUpdateSnapshotMeta,
    compareIsChapterVsSelected,
    onApplySnapshotHunkToChapter,
    selfReviewBusy,
    selfReviewCanRun,
    onSelfReviewRun,
    onSelfReviewStop,
    selfReviewText,
    selfReviewError,
    onSelfReviewDismissError,
  } = props;

  const bSel = selectedSnapshotId
    ? snapshotBucket.snapshots.find((s) => s.id === selectedSnapshotId)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="sheng-hui-eyebrow">版本历史</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        每次生成自动保存快照（本机·按章节）。可起 8 字短名、点星标收藏，收藏项会排在列表前。
      </p>

      {snapshotsNewestFirst.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60">尚无快照</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {snapshotsNewestFirst.map((s) => (
            <ShengHuiSnapshotListItem
              key={s.id}
              s={s}
              selected={selectedSnapshotId === s.id}
              adopted={snapshotBucket.adoptedId === s.id}
              formatRelativeUpdateMs={formatRelativeUpdateMs}
              onSelect={() => onSelectSnapshot(s)}
              onUpdateMeta={(patch) => onUpdateSnapshotMeta(s.id, patch)}
              busy={busy}
            />
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
              .map((s) => {
                const label = s.shortLabel?.trim();
                return (
                  <option key={s.id} value={s.id}>
                    {label ? `${label} · ` : ""}
                    {formatRelativeUpdateMs(s.createdAt)} · {s.prose.replace(/\s/g, "").length}字
                  </option>
                );
              })}
          </select>
          {showDiff && compareSnapshotId && selectedSnapshotId && bSel
            ? (() => {
                const aText =
                  compareSnapshotId === "__chapter__"
                    ? (selectedChapter?.content ?? "")
                    : (snapshotBucket.snapshots.find((s) => s.id === compareSnapshotId)?.prose ?? "");
                const bText = bSel.prose;
                if (!aText && !bText) return <p className="mt-1 text-[10px] text-muted-foreground/60">无内容可对比。</p>;
                return (
                  <ShengHuiSnapshotDiffPanel
                    aText={aText}
                    bText={bText}
                    leftLabel={compareSnapshotId === "__chapter__" ? "左 · 当前正文" : "左 · 对比稿"}
                    rightLabel="右 · 选中版本（基准）"
                    showHunkApply={compareIsChapterVsSelected}
                    busy={busy}
                    onApplyHunk={onApplySnapshotHunkToChapter}
                  />
                );
              })()
            : null}
        </div>
      )}

      <ShengHuiSelfReviewSection
        busy={selfReviewBusy}
        canRun={selfReviewCanRun}
        onRun={onSelfReviewRun}
        onStop={onSelfReviewStop}
        text={selfReviewText}
        error={selfReviewError}
        onDismissError={onSelfReviewDismissError}
      />

      {selectedSnapshotId && bSel ? (
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border/40 pt-3">
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={onMarkAdopted} disabled={busy}
            title="若主稿已手改，将自动另存为新快照后再标采纳">
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
