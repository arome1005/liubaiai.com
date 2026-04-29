import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  appendAndAdoptShengHuiSnapshot,
  setShengHuiAdoptedSnapshot,
  type ShengHuiSnapshotBucket,
} from "../util/sheng-hui-snapshots";

/**
 * 将当前选中快照标为「采纳」。
 * A.2/A.3：若主稿内容与选中快照的 prose 不同（用户手改过），
 * 自动先将当前主稿存为新快照，再将新快照标为 adoptedId，
 * 保证「采纳」反映用户眼前所见内容。
 */
export function useShengHuiMarkAdoptedSnapshot(
  workId: string | null,
  chapterId: string | null,
  selectedSnapshotId: string | null,
  setSnapshotBucket: Dispatch<SetStateAction<ShengHuiSnapshotBucket>>,
  /** 当前主稿文本（用于脏稿检测） */
  currentOutput: string,
  /** 大纲预览文本，用于新快照的 outlinePreview 字段 */
  outlinePreview: string,
) {
  const markSnapshotAdopted = useCallback(() => {
    if (!workId || !selectedSnapshotId) return;
    const { bucket } = appendAndAdoptShengHuiSnapshot(
      workId,
      chapterId,
      currentOutput,
      selectedSnapshotId,
      outlinePreview,
    );
    setSnapshotBucket(bucket);
  }, [chapterId, currentOutput, outlinePreview, selectedSnapshotId, setSnapshotBucket, workId]);

  const markSnapshotAdoptedDirect = useCallback(() => {
    if (!workId || !selectedSnapshotId) return;
    const b = setShengHuiAdoptedSnapshot(workId, chapterId, selectedSnapshotId);
    setSnapshotBucket(b);
  }, [chapterId, selectedSnapshotId, setSnapshotBucket, workId]);

  return { markSnapshotAdopted, markSnapshotAdoptedDirect };
}
