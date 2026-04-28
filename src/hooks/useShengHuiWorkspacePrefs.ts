import { useCallback, useEffect, useState } from "react";
import { useMinWidthMedia } from "./useMinWidthMedia";

const LS_LEFT = "liubai:shengHuiLeftOpen:v1";
const LS_STEP = "liubai:shengHuiStepHintDismissed:v1";

/** 生辉「毛坯升级」：左侧素材栏展开、三步引导已关闭，持久化本机。 */
export function useShengHuiWorkspacePrefs() {
  const isLg = useMinWidthMedia(1024);
  const [leftOpen, setLeftOpenState] = useState(true);
  const [stepHintDismissed, setStepHintDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_LEFT) === "0") setLeftOpenState(false);
      if (localStorage.getItem(LS_STEP) === "1") setStepHintDismissed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setLeftOpen = useCallback((v: boolean) => {
    setLeftOpenState(v);
    try {
      localStorage.setItem(LS_LEFT, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const dismissStepHint = useCallback(() => {
    setStepHintDismissed(true);
    try {
      localStorage.setItem(LS_STEP, "1");
    } catch {
      /* ignore */
    }
  }, []);

  /** 小屏不折叠左栏，避免找不着素材。 */
  const leftExpanded = !isLg || leftOpen;

  return {
    prefsHydrated: hydrated,
    isLg,
    leftOpen,
    setLeftOpen,
    leftExpanded,
    stepHintDismissed,
    dismissStepHint,
  };
}
