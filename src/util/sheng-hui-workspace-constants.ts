import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";

export const LS_SHENG_HUI_LAST_WORK = "liubai:lastWorkId";
export const LS_SHENG_HUI_OUTLINE_PREFIX = "liubai:shengHuiOutline:v1:";
export const LS_SHENG_HUI_RIGHT_PANEL_TAB = "liubai:shengHuiRightPanelTab:v1";
export const LS_SHENG_HUI_RIGHT_TAB_LEGACY = "liubai:shengHuiRightTab:v1";
export const LS_SHENG_HUI_RIGHT_COLLAPSED = "liubai:shengHuiRightCollapsed:v1";

export function shengHuiOutlineStorageKey(workId: string | null): string {
  return LS_SHENG_HUI_OUTLINE_PREFIX + (workId ?? "none");
}

/** 场景卡按「作品 + 章」分桶，与 `ShengHuiPage` / `useShengHuiSceneStateSessionForPage` 一致。 */
export function shengHuiSceneStateStorageKey(workId: string | null, chapterId: string | null): string {
  return `liubai:shengHuiSceneState:v1:${workId ?? "none"}:${chapterId ?? "none"}`;
}

export function readInitialShengHuiRightPanelTab(): ShengHuiRightPanelTab {
  try {
    const v = localStorage.getItem(LS_SHENG_HUI_RIGHT_PANEL_TAB);
    if (v === "compose" || v === "materials" || v === "versions" || v === "help") return v;
  } catch {
    /* ignore */
  }
  try {
    const leg = localStorage.getItem(LS_SHENG_HUI_RIGHT_TAB_LEGACY);
    if (leg === "settings") return "help";
    if (leg === "versions") return "versions";
  } catch {
    /* ignore */
  }
  return "compose";
}

export function readShengHuiRightPanelCollapsedFromStorage(): boolean {
  try {
    return localStorage.getItem(LS_SHENG_HUI_RIGHT_COLLAPSED) === "1";
  } catch {
    return false;
  }
}

/** 与推演页 `/logic` 根容器一致：独立全屏工作台底色。 */
export const SHENG_HUI_PAGE_WORKSPACE_BG =
  "bg-[radial-gradient(1200px_520px_at_10%_-20%,rgba(99,102,241,0.12),transparent),radial-gradient(900px_420px_at_95%_0%,rgba(16,185,129,0.08),transparent)] bg-background";
