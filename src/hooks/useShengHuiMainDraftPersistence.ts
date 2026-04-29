import { useEffect, useRef, useState } from "react";
import { readShengHuiMainDraft, writeShengHuiMainDraft } from "../util/sheng-hui-main-draft-storage";

const PERSIST_DEBOUNCE_MS = 400;

/**
 * 主稿 `output`：debounce 写 localStorage；切作品/切章时 flush 旧目标，并在本机有草稿时恢复
 *（在快照桶 `useEffect` 之后挂载，可覆盖为「上次手改」）。
 */
export function useShengHuiMainDraftPersistence(args: {
  workId: string | null;
  chapterId: string | null;
  output: string;
  setOutput: (v: string) => void;
  /** 全页 loading 未完成时不从草稿「恢复」覆盖，避免与初载打架；flush 仍随 cleanup 落盘。 */
  loading: boolean;
  /**
   * 由页面快照 `useEffect` 在按章 setOutput 后自增。两章正文字符串相同时仍驱动 debounce 用最新 ref
   * 对应当前章节，避免把上一章手改误存到新章 key。
   */
  snapshotContentEpoch: number;
}) {
  const { workId, chapterId, output, setOutput, loading, snapshotContentEpoch } = args;
  const outputRef = useRef(output);
  outputRef.current = output;
  const workIdRef = useRef(workId);
  const chapterIdRef = useRef(chapterId);
  workIdRef.current = workId;
  chapterIdRef.current = chapterId;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 在「快照已跑完 + 本机草稿已尝试恢复」后 +1，驱动 debounce 在切章后至少再评估一次
   *（缓释「新章 output 与上一章字符串相同、React 跳过渲染」的极端情况）。
   */
  const [draftAlignEpoch, setDraftAlignEpoch] = useState(0);

  const key = workId ? `${workId}:${chapterId ?? "none"}` : null;

  // 切走目标时 flush 当前 ref；进入新目标时若本机有主稿则恢复（`read === null` 不覆盖快照）
  useEffect(() => {
    if (!loading && workId) {
      const d = readShengHuiMainDraft(workId, chapterId);
      if (d !== null) {
        setOutput(d);
      }
    }
    setDraftAlignEpoch((n) => n + 1);
    return () => {
      if (workId) {
        writeShengHuiMainDraft(workId, chapterId, outputRef.current);
      }
    };
  }, [workId, chapterId, loading, setOutput]);

  // debounce 持久化
  useEffect(() => {
    if (loading || !key) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      return;
    }
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      const w = workIdRef.current;
      const c = chapterIdRef.current;
      if (w) {
        writeShengHuiMainDraft(w, c, outputRef.current);
      }
      debounceTimer.current = null;
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [key, output, loading, draftAlignEpoch, snapshotContentEpoch]);
}
