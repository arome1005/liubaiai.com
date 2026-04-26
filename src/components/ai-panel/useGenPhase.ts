import { useCallback, useRef, useState } from "react";

/**
 * 「本章正文生成」可见状态机：
 * - idle 未运行
 * - preparing 已点生成、组装上下文中（弹窗已打开但请求尚未产出第一片 delta）
 * - streaming 正在流式输出
 * - done 完成
 * - error 失败（非 abort）
 * - aborted 被用户取消
 */
export type GenPhase = "idle" | "preparing" | "streaming" | "done" | "error" | "aborted";

export type GenPhaseEvent =
  | { type: "start" }
  | { type: "delta" }
  | { type: "done" }
  | { type: "abort" }
  | { type: "error" };

export interface GenPhaseLabel {
  label: string;
  /** Tailwind 类（背景 + 前景） */
  cls: string;
  /** 是否带脉冲动画（preparing/streaming） */
  pulsing: boolean;
}

export const GEN_PHASE_UI: Record<GenPhase, GenPhaseLabel> = {
  idle: { label: "未开始", cls: "bg-muted text-muted-foreground", pulsing: false },
  preparing: { label: "准备中", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", pulsing: true },
  streaming: { label: "生成中…", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", pulsing: true },
  done: { label: "已完成", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", pulsing: false },
  error: { label: "失败", cls: "bg-red-500/15 text-red-600 dark:text-red-400", pulsing: false },
  aborted: { label: "已取消", cls: "bg-muted text-muted-foreground", pulsing: false },
};

/**
 * 状态机 hook：返回当前 phase 与 dispatch。
 * 用 ref 记录「本次 run 是否已收到首片 delta」以避免每个 delta 都重新 setState。
 */
export function useGenPhase(): {
  phase: GenPhase;
  dispatch: (ev: GenPhaseEvent) => void;
  /** 重置到 idle（一般不需要主动调用） */
  reset: () => void;
} {
  const [phase, setPhase] = useState<GenPhase>("idle");
  const hasDeltaRef = useRef(false);

  const dispatch = useCallback((ev: GenPhaseEvent) => {
    switch (ev.type) {
      case "start":
        hasDeltaRef.current = false;
        setPhase("preparing");
        return;
      case "delta":
        if (!hasDeltaRef.current) {
          hasDeltaRef.current = true;
          setPhase("streaming");
        }
        return;
      case "done":
        setPhase("done");
        return;
      case "abort":
        setPhase("aborted");
        return;
      case "error":
        setPhase("error");
        return;
    }
  }, []);

  const reset = useCallback(() => {
    hasDeltaRef.current = false;
    setPhase("idle");
  }, []);

  return { phase, dispatch, reset };
}
