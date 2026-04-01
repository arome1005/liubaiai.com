/** 与设置页「外观 → 主题」一致，存于 localStorage */
export const THEME_KEY = "liubai:theme";

export type ThemePreference = "light" | "dark" | "system";

export function readThemePreference(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "system") return t;
    return "light";
  } catch {
    return "light";
  }
}

/** 将偏好应用到 `document.documentElement.dataset.theme`（仅 light / dark，供 CSS 使用） */
export function applyThemePreference(pref: ThemePreference): void {
  if (pref === "light" || pref === "dark") {
    document.documentElement.dataset.theme = pref;
    return;
  }
  document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function persistThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
  applyThemePreference(pref);
}
