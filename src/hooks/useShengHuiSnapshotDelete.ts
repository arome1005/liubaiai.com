import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { deleteShengHuiSnapshot, type ShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";

type SetSnapshot = Dispatch<SetStateAction<ShengHuiSnapshotBucket>>;

/**
 * 本机「版本历史」中删除单条快照：受控确认框状态 + 删除后桶与主稿/选中项收敛逻辑。
 * UI 用 `ShengHuiDeleteSnapshotDialog`，不要再用 `window.confirm`。
 */
export function useShengHuiSnapshotDelete(
  workId: string | null,
  chapterId: string | null,
  selectedSnapshotId: string | null,
  setOutput: (v: string) => void,
  setSelectedSnapshotId: (v: string | null) => void,
  setSnapshotBucket: SetSnapshot,
) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const requestDeleteSelectedSnapshot = useCallback(() => {
    if (!workId || !selectedSnapshotId) return;
    setDialogOpen(true);
  }, [workId, selectedSnapshotId]);

  const confirmDeleteSelectedSnapshot = useCallback(() => {
    if (!workId || !selectedSnapshotId) {
      setDialogOpen(false);
      return;
    }
    const b = deleteShengHuiSnapshot(workId, chapterId, selectedSnapshotId);
    setSnapshotBucket(b);
    if (b.snapshots.length === 0) {
      setOutput("");
      setSelectedSnapshotId(null);
      setDialogOpen(false);
      return;
    }
    if (b.adoptedId) {
      const ad = b.snapshots.find((s) => s.id === b.adoptedId);
      if (ad) {
        setOutput(ad.prose);
        setSelectedSnapshotId(ad.id);
        setDialogOpen(false);
        return;
      }
    }
    const latest = [...b.snapshots].sort((a, b2) => b2.createdAt - a.createdAt)[0]!;
    setOutput(latest.prose);
    setSelectedSnapshotId(latest.id);
    setDialogOpen(false);
  }, [workId, chapterId, selectedSnapshotId, setOutput, setSelectedSnapshotId, setSnapshotBucket]);

  /** 与 Radix 受控模式一致；勿在外部直接 `setState`，请用此回调或 `requestDeleteSelectedSnapshot`。 */
  const onDeleteSnapshotDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
  }, []);

  return {
    deleteSnapshotDialogOpen: dialogOpen,
    onDeleteSnapshotDialogOpenChange,
    requestDeleteSelectedSnapshot,
    confirmDeleteSelectedSnapshot,
  };
}
