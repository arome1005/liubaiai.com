import { useCallback, useRef, useState } from "react";
import type { TuiyanPlanningLevel } from "../db/types";
import {
  PLANNING_GEN_EXPECTED_CHARS,
  PLANNING_GEN_EXPECTED_CHARS_FALLBACK,
} from "../util/tuiyan-planning";

export interface TuiyanGenProgressControls {
  /** 当前进度 0-100，null 表示隐藏进度条 */
  genProgress: number | null;
  /**
   * 在开始生成前调用；返回 onChunk 回调，将其传给 generateTuiyanPlanning* 的 onChunk 参数。
   * 调用后立即把进度重置为 0。
   */
  makeOnChunk: (level: TuiyanPlanningLevel | "chapter_detail") => (accumulatedChars: number) => void;
  /** 生成成功后调用：进度跳到 100%，1 s 后自动隐藏 */
  completeProgress: () => void;
  /** 生成失败或中止后调用：立即隐藏进度条 */
  resetProgress: () => void;
}

export function useTuiyanGenProgress(): TuiyanGenProgressControls {
  const [genProgress, setGenProgress] = useState<number | null>(null);
  const tidRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTid = useCallback(() => {
    if (tidRef.current !== null) {
      clearTimeout(tidRef.current);
      tidRef.current = null;
    }
  }, []);

  const makeOnChunk = useCallback(
    (level: TuiyanPlanningLevel | "chapter_detail") => {
      clearPendingTid();
      const expected =
        PLANNING_GEN_EXPECTED_CHARS[level] ?? PLANNING_GEN_EXPECTED_CHARS_FALLBACK;
      setGenProgress(0);
      return (accumulated: number) => {
        const pct = Math.min(95, Math.round((accumulated / expected) * 100));
        setGenProgress(pct);
      };
    },
    [clearPendingTid],
  );

  const completeProgress = useCallback(() => {
    clearPendingTid();
    setGenProgress(100);
    tidRef.current = setTimeout(() => {
      setGenProgress(null);
      tidRef.current = null;
    }, 1000);
  }, [clearPendingTid]);

  const resetProgress = useCallback(() => {
    clearPendingTid();
    setGenProgress(null);
  }, [clearPendingTid]);

  return { genProgress, makeOnChunk, completeProgress, resetProgress };
}
