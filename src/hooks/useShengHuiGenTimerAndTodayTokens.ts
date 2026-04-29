import { useEffect, type MutableRefObject } from "react";
import { readTodayApproxTokens } from "../ai/daily-approx-tokens";
import type { Dispatch, SetStateAction } from "react";

/**
 * 主稿区「预计用时」与「今日约 token」的展示：随生成 busy、窗口 focus 刷新。
 * `peakGenElapsedRef` 供「生成完成卡」在 busy 变 false 后仍读到最后一秒数（`genElapsedSec` 会立即归零）。
 */
export function useShengHuiGenTimerAndTodayTokens(
  busy: boolean,
  setGenElapsedSec: Dispatch<SetStateAction<number>>,
  setTodayTokensSnapshot: Dispatch<SetStateAction<number>>,
  peakGenElapsedRef: MutableRefObject<number>,
) {
  useEffect(() => {
    setTodayTokensSnapshot(readTodayApproxTokens());
  }, [busy, setTodayTokensSnapshot]);

  useEffect(() => {
    const sync = () => setTodayTokensSnapshot(readTodayApproxTokens());
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [setTodayTokensSnapshot]);

  useEffect(() => {
    if (!busy) {
      setGenElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    setGenElapsedSec(0);
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      peakGenElapsedRef.current = s;
      setGenElapsedSec(s);
    }, 1000);
    return () => clearInterval(id);
  }, [busy, setGenElapsedSec, peakGenElapsedRef]);
}
