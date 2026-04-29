import { useCallback, useEffect, useState } from "react";
import type { ShengHuiGenerateMode } from "../ai/sheng-hui-generate";

const LS_KEY = "liubai:shengHuiGenerateMode:v1";

const ALL_MODES: ShengHuiGenerateMode[] = [
  "write",
  "continue",
  "rewrite",
  "polish",
  "skeleton",
  "dialogue_first",
  "segment",
];

function readInitialMode(): ShengHuiGenerateMode {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && (ALL_MODES as string[]).includes(v)) return v as ShengHuiGenerateMode;
  } catch {
    /* ignore */
  }
  return "write";
}

/**
 * 生辉主生成模式 + 两步中间稿（`skeleton` / `dialogue_first`）状态；主模式写 localStorage。
 */
export function useShengHuiGenerateMode() {
  const [generateMode, setGenerateMode] = useState<ShengHuiGenerateMode>(readInitialMode);
  const [twoStepIntermediate, setTwoStepIntermediate] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, generateMode);
    } catch {
      /* ignore */
    }
  }, [generateMode]);

  const resetTwoStep = useCallback(() => {
    setTwoStepIntermediate(null);
  }, []);

  return {
    generateMode,
    setGenerateMode,
    twoStepIntermediate,
    setTwoStepIntermediate,
    resetTwoStep,
  };
}
