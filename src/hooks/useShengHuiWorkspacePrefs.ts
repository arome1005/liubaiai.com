import { useCallback, useEffect, useState } from "react";
import { useMinWidthMedia } from "./useMinWidthMedia";

const LS_LEFT = "liubai:shengHuiLeftOpen:v1";
const LS_STEP = "liubai:shengHuiStepHintDismissed:v1";
const LS_FOCUS = "liubai:shengHuiFocusMode:v1";

/** 生辉「毛坯升级」：左侧素材栏展开、三步引导已关闭，持久化本机。 */
export function useShengHuiWorkspacePrefs() {
  const isLg = useMinWidthMedia(1024);
  const [leftOpen, setLeftOpenState] = useState(true);
  const [stepHintDismissed, setStepHintDismissed] = useState(false);
  const [focusMode, setFocusModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_LEFT) === "0") setLeftOpenState(false);
      if (localStorage.getItem(LS_STEP) === "1") setStepHintDismissed(true);
      if (localStorage.getItem(LS_FOCUS) === "1") setFocusModeState(true);
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

  const setFocusMode = useCallback((v: boolean) => {
    setFocusModeState(v);
    try {
      localStorage.setItem(LS_FOCUS, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusModeState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_FOCUS, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }
      // 第三节：F11 切换专注，避免全屏时抢浏览器默认行为时仍用同一入口
      if (e.key === "F11") {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFocusMode]);

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
    focusMode,
    setFocusMode,
    toggleFocusMode,
  };
}
