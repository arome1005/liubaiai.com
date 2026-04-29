import { useCallback, type Dispatch, type SetStateAction } from "react";
import { updateShengHuiSnapshotMeta, type ShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";

type Patch = { shortLabel?: string | null; starred?: boolean };

/**
 * 更新单条快照的短名/收藏并写回 state（W5）。
 */
export function useShengHuiSnapshotMeta(
  workId: string | null,
  chapterId: string | null,
  setSnapshotBucket: Dispatch<SetStateAction<ShengHuiSnapshotBucket>>,
) {
  return useCallback(
    (snapshotId: string, patch: Patch) => {
      if (!workId) return;
      setSnapshotBucket(() => updateShengHuiSnapshotMeta(workId, chapterId, snapshotId, patch));
    },
    [workId, chapterId, setSnapshotBucket],
  );
}
