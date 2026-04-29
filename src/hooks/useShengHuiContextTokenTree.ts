import { useEffect, useState } from "react";
import { computeShengHuiContextTokenBlocks, type ShengHuiContextTokenBlock } from "../ai/sheng-hui-generate";
import type { ShengHuiBuildResult } from "./useShengHuiGenerationLifecycle";

export type ShengHuiContextTokenTreeState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      systemApprox: number;
      blocks: ShengHuiContextTokenBlock[];
      userTotalApprox: number;
      totalApprox: number;
    };

/**
 * N5：与一次「按纲仿写」装配结果同步的上下文分块粗估（含截断标记）；`refreshSnapshot` 须与 `useShengHuiBuildGenerateArgs` 同频变化。
 */
export function useShengHuiContextTokenTree(
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>,
  /** 任意值，仅作 effect 依赖；建议为 `useMemo` 对象，字段与装配入参一致 */
  refreshSnapshot: unknown,
): ShengHuiContextTokenTreeState {
  const [state, setState] = useState<ShengHuiContextTokenTreeState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const b = await buildGenerateArgs();
      if (cancelled) return;
      if (!b.ok) {
        setState({ status: "error", error: b.error });
        return;
      }
      const tree = computeShengHuiContextTokenBlocks(b.args);
      if (cancelled) return;
      if (!tree.ok) setState({ status: "error", error: tree.error });
      else setState({ status: "ready", ...tree });
    })();
    return () => {
      cancelled = true;
    };
  }, [buildGenerateArgs, refreshSnapshot]);

  return state;
}
