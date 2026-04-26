import { useCallback, useEffect, useRef, useState } from "react";

type PanelSide = "left" | "right";

type PanelDragState = {
  side: PanelSide;
  startX: number;
  startWidth: number;
};

const LS_TUIYAN_LEFT_OPEN = "liubai:tuiyan:leftOpen:v1";
const LS_TUIYAN_RIGHT_OPEN = "liubai:tuiyan:rightOpen:v1";
const LS_TUIYAN_LEFT_WIDTH = "liubai:tuiyan:leftWidth:v1";
const LS_TUIYAN_RIGHT_WIDTH = "liubai:tuiyan:rightWidth:v1";

const LEFT_PANEL_DEFAULT_WIDTH = 420;
const RIGHT_PANEL_DEFAULT_WIDTH = 380;
const LEFT_PANEL_MIN_WIDTH = 300;
const LEFT_PANEL_MAX_WIDTH = 640;
const RIGHT_PANEL_MIN_WIDTH = 320;
const RIGHT_PANEL_MAX_WIDTH = 700;

function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures in private mode
  }
}

function safeBool(v: string | null, fallback: boolean): boolean {
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

function clampPanelWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function useTuiyanLayoutPanels() {
  const [showLeftPanel, setShowLeftPanel] = useState(() =>
    safeBool(safeGetLocalStorage(LS_TUIYAN_LEFT_OPEN), true),
  );
  const [showRightPanel, setShowRightPanel] = useState(() =>
    safeBool(safeGetLocalStorage(LS_TUIYAN_RIGHT_OPEN), true),
  );
  const [leftPanelWidth, setLeftPanelWidth] = useState(() =>
    clampPanelWidth(Number(safeGetLocalStorage(LS_TUIYAN_LEFT_WIDTH)) || LEFT_PANEL_DEFAULT_WIDTH, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH),
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(() =>
    clampPanelWidth(Number(safeGetLocalStorage(LS_TUIYAN_RIGHT_WIDTH)) || RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH),
  );

  const panelDragRef = useRef<PanelDragState | null>(null);

  useEffect(() => {
    safeSetLocalStorage(LS_TUIYAN_LEFT_OPEN, showLeftPanel ? "1" : "0");
  }, [showLeftPanel]);

  useEffect(() => {
    safeSetLocalStorage(LS_TUIYAN_RIGHT_OPEN, showRightPanel ? "1" : "0");
  }, [showRightPanel]);

  useEffect(() => {
    safeSetLocalStorage(LS_TUIYAN_LEFT_WIDTH, String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    safeSetLocalStorage(LS_TUIYAN_RIGHT_WIDTH, String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = panelDragRef.current;
      if (!drag) return;

      if (drag.side === "left") {
        const next = clampPanelWidth(drag.startWidth + (e.clientX - drag.startX), LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH);
        setLeftPanelWidth(next);
        return;
      }

      const next = clampPanelWidth(drag.startWidth + (drag.startX - e.clientX), RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH);
      setRightPanelWidth(next);
    }

    function onUp() {
      panelDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onUp();
    };
  }, []);

  const beginPanelDrag = useCallback(
    (side: PanelSide, startX: number) => {
      const startWidth = side === "left" ? leftPanelWidth : rightPanelWidth;
      panelDragRef.current = { side, startX, startWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [leftPanelWidth, rightPanelWidth],
  );

  const resetLeftPanelWidth = useCallback(() => {
    setLeftPanelWidth(LEFT_PANEL_DEFAULT_WIDTH);
  }, []);

  const resetRightPanelWidth = useCallback(() => {
    setRightPanelWidth(RIGHT_PANEL_DEFAULT_WIDTH);
  }, []);

  return {
    showLeftPanel,
    showRightPanel,
    leftPanelWidth,
    rightPanelWidth,
    setShowLeftPanel,
    setShowRightPanel,
    beginPanelDrag,
    resetLeftPanelWidth,
    resetRightPanelWidth,
  };
}
