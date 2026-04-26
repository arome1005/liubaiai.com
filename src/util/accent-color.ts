/**
 * 强调色系统 — 6 种预设，通过修改 CSS 变量改变全局主色调。
 * 存于 localStorage；应用启动时在 AppShell useEffect 中调用 applyAccentColor()。
 */

const LS_KEY = "liubai:accentColor:v1";

export type AccentColorId = "blue" | "purple" | "green" | "amber" | "rose" | "cyan";

export type AccentColorDef = {
  id: AccentColorId;
  label: string;
  /** Tailwind 色值（用于 UI 预览圆点） */
  tailwindClass: string;
  /** light 模式下 --primary HSL (space-separated, shadcn 格式) */
  primaryLight: string;
  /** dark 模式下 --primary HSL */
  primaryDark: string;
  /** light 模式下 --accent (用于顶栏下划线等) */
  accentLight: string;
  /** dark 模式下 --accent */
  accentDark: string;
};

export const ACCENT_COLORS: AccentColorDef[] = [
  {
    id: "blue",
    label: "蓝色",
    tailwindClass: "bg-blue-500",
    primaryLight:  "217 91% 50%",
    primaryDark:   "217 91% 60%",
    accentLight:   "#1d4ed8",
    accentDark:    "#3b82f6",
  },
  {
    id: "purple",
    label: "紫色",
    tailwindClass: "bg-purple-500",
    primaryLight:  "262 83% 52%",
    primaryDark:   "262 83% 65%",
    accentLight:   "#7c3aed",
    accentDark:    "#a78bfa",
  },
  {
    id: "green",
    label: "绿色",
    tailwindClass: "bg-emerald-500",
    primaryLight:  "158 64% 36%",
    primaryDark:   "158 64% 52%",
    accentLight:   "#059669",
    accentDark:    "#34d399",
  },
  {
    id: "amber",
    label: "琥珀",
    tailwindClass: "bg-amber-500",
    primaryLight:  "38 92% 45%",
    primaryDark:   "38 92% 58%",
    accentLight:   "#d97706",
    accentDark:    "#fbbf24",
  },
  {
    id: "rose",
    label: "玫瑰",
    tailwindClass: "bg-rose-500",
    primaryLight:  "347 77% 50%",
    primaryDark:   "347 77% 62%",
    accentLight:   "#e11d48",
    accentDark:    "#fb7185",
  },
  {
    id: "cyan",
    label: "青色",
    tailwindClass: "bg-cyan-500",
    primaryLight:  "192 82% 40%",
    primaryDark:   "192 82% 55%",
    accentLight:   "#0891b2",
    accentDark:    "#22d3ee",
  },
];

export function readAccentColor(): AccentColorId {
  try {
    const v = localStorage.getItem(LS_KEY) as AccentColorId | null;
    if (v && ACCENT_COLORS.some((c) => c.id === v)) return v;
  } catch { /* ignore */ }
  return "blue";
}

export function saveAccentColor(id: AccentColorId): void {
  try { localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
}

/** 将强调色写入 :root CSS 变量，立即生效 */
export function applyAccentColor(id: AccentColorId): void {
  const def = ACCENT_COLORS.find((c) => c.id === id) ?? ACCENT_COLORS[0];
  const root = document.documentElement;
  const isDark = root.dataset.theme === "dark";
  root.style.setProperty("--primary", isDark ? def.primaryDark : def.primaryLight);
  root.style.setProperty("--accent",  isDark ? def.accentDark  : def.accentLight);
  root.dataset.accent = id;
}

export function persistAndApplyAccentColor(id: AccentColorId): void {
  saveAccentColor(id);
  applyAccentColor(id);
}
