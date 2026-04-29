import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { loadShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";
import { readShengHuiMainDraft } from "../util/sheng-hui-main-draft-storage";

/**
 * 某章在生辉侧**从未生成过快照**、且本机亦无主稿草稿时，用**写作章节正文**预填主稿，
 * 与左栏字数、写作页一致；避免「左栏有字、主稿 0 字」的割裂感。
 *
 * 必须在 `useShengHuiSnapshotBucketOnTargetChange` 与 `useShengHuiMainDraftPersistence` **之后**注册。
 */
export function useShengHuiSeedOutputFromChapterWhenNoSnapshot(args: {
  loading: boolean;
  workId: string | null;
  chapterId: string | null;
  chapterContent: string | undefined;
  output: string;
  setOutput: (v: string) => void;
  setShengHuiMainContentEpoch: Dispatch<SetStateAction<number>>;
}) {
  const { loading, workId, chapterId, chapterContent, output, setOutput, setShengHuiMainContentEpoch } = args;
  const keyRef = useRef<string | null>(null);
  const seededForKeyRef = useRef(false);

  useEffect(() => {
    if (loading || !workId || !chapterId) return;
    const key = `${workId}:${chapterId}`;
    if (keyRef.current !== key) {
      keyRef.current = key;
      seededForKeyRef.current = false;
    }
    if (readShengHuiMainDraft(workId, chapterId) !== null) return;
    const b = loadShengHuiSnapshotBucket(workId, chapterId);
    if (b.snapshots.length > 0 || b.adoptedId) return;
    const c = (chapterContent ?? "").trim();
    if (!c) return;
    if (output.trim() !== "") return;
    if (seededForKeyRef.current) return;
    setOutput(chapterContent ?? "");
    setShengHuiMainContentEpoch((n) => n + 1);
    seededForKeyRef.current = true;
  }, [
    loading,
    workId,
    chapterId,
    chapterContent,
    output,
    setOutput,
    setShengHuiMainContentEpoch,
  ]);
}
