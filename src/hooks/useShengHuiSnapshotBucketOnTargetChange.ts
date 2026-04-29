import { useEffect } from "react";
import { loadShengHuiSnapshotBucket, type ShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";
import type { Dispatch, SetStateAction } from "react";

/**
 * `workId` / `chapterId` 目标变化时重载快照桶并镜像主稿/选中等状态（在 `useShengHuiMainDraftPersistence` 之前）。
 */
export function useShengHuiSnapshotBucketOnTargetChange(
  workId: string | null,
  chapterId: string | null,
  setSnapshotBucket: Dispatch<SetStateAction<ShengHuiSnapshotBucket>>,
  setOutput: Dispatch<SetStateAction<string>>,
  setSelectedSnapshotId: Dispatch<SetStateAction<string | null>>,
  setShengHuiMainContentEpoch: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    if (!workId) return;
    const b = loadShengHuiSnapshotBucket(workId, chapterId);
    setSnapshotBucket(b);
    if (b.adoptedId) {
      const adopted = b.snapshots.find((s) => s.id === b.adoptedId);
      if (adopted) {
        setOutput(adopted.prose);
        setSelectedSnapshotId(adopted.id);
        setShengHuiMainContentEpoch((n) => n + 1);
        return;
      }
    }
    if (b.snapshots.length) {
      const latest = [...b.snapshots].sort((x, y) => y.createdAt - x.createdAt)[0]!;
      setOutput(latest.prose);
      setSelectedSnapshotId(latest.id);
    } else {
      setOutput("");
      setSelectedSnapshotId(null);
    }
    setShengHuiMainContentEpoch((n) => n + 1);
  }, [workId, chapterId, setOutput, setSelectedSnapshotId, setShengHuiMainContentEpoch, setSnapshotBucket]);
}
