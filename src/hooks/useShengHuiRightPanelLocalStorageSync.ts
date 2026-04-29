import { useEffect } from "react";
import { LS_SHENG_HUI_RIGHT_COLLAPSED, LS_SHENG_HUI_RIGHT_PANEL_TAB } from "../util/sheng-hui-workspace-constants";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";

/**
 * 将右栏 Tab / 折叠态持久化到 `localStorage`，供跨会话恢复。
 */
export function useShengHuiRightPanelLocalStorageSync(
  rightPanelTab: ShengHuiRightPanelTab,
  rightCollapsed: boolean,
) {
  useEffect(() => {
    try {
      localStorage.setItem(LS_SHENG_HUI_RIGHT_PANEL_TAB, rightPanelTab);
    } catch {
      /* ignore */
    }
  }, [rightPanelTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_SHENG_HUI_RIGHT_COLLAPSED, rightCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [rightCollapsed]);
}
