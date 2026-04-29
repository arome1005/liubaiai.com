import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ShengHuiRoughEstimate } from "./useShengHuiGenerationLifecycle";
import { formatShengHuiIllustrativeYuan } from "../util/sheng-hui-ui-display";

export type ShengHuiGenerationCompletePayload = {
  /** 本段主稿无空白字数增量 */
  newCharCount: number;
  /** 与 peakGenElapsedRef 对齐的秒数 */
  seconds: number;
  /** 本请求 output 粗估，若本机未粗估到则为 null */
  outTokApprox: number | null;
  totalTokApprox: number | null;
  illustrativeYuan: string;
};

const HIDE_MS = 7500;

/**
 * 主稿区底部「一次生成完成」总结卡：busy true→false 且未报错时出一次，N 秒自动关。
 * 不区分用户点「停止」：仍有部分内容则照常提示。
 */
export function useShengHuiGenerationCompleteCard(args: {
  busy: boolean;
  error: string | null;
  output: string;
  peakGenElapsedRef: MutableRefObject<number>;
  lastRoughEstimate: ShengHuiRoughEstimate | null;
}): {
  completePayload: ShengHuiGenerationCompletePayload | null;
  dismissCompleteCard: () => void;
} {
  const { busy, error, output, peakGenElapsedRef, lastRoughEstimate } = args;
  const prevBusy = useRef(false);
  const charsAtBusyStart = useRef(0);
  const [completePayload, setCompletePayload] = useState<ShengHuiGenerationCompletePayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissCompleteCard = useCallback(() => {
    clearTimer();
    setCompletePayload(null);
  }, [clearTimer]);

  useEffect(() => {
    if (busy) {
      charsAtBusyStart.current = output.replace(/\s/g, "").length;
    }

    if (prevBusy.current && !busy && !error) {
      const sec = Math.max(0, peakGenElapsedRef.current);
      const nowChars = output.replace(/\s/g, "").length;
      const newCharCount = Math.max(0, nowChars - charsAtBusyStart.current);
      const r = lastRoughEstimate;
      const outTok = r && r.outputEstimateApprox > 0 ? r.outputEstimateApprox : null;
      const totTok = r && r.totalApprox > 0 ? r.totalApprox : null;
      const ill = totTok != null ? formatShengHuiIllustrativeYuan(totTok) : "—";
      if (sec > 0 || newCharCount > 0 || (totTok != null && totTok > 0)) {
        setCompletePayload({
          newCharCount,
          seconds: sec,
          outTokApprox: outTok,
          totalTokApprox: totTok,
          illustrativeYuan: ill,
        });
        clearTimer();
        timerRef.current = setTimeout(() => setCompletePayload(null), HIDE_MS);
      }
    }
    prevBusy.current = busy;
  }, [busy, error, output, lastRoughEstimate, peakGenElapsedRef, clearTimer]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { completePayload, dismissCompleteCard };
}
