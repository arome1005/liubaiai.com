/**
 * 写作设置抽屉：从编辑页右上角齿轮按钮打开，无需跳转到全局设置页。
 * 覆盖字号、字体、行高、护眼底色、稿纸宽度、主题等所有常用写作设置。
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  applyEditorTypographyCssVars,
  dispatchEditorTypographyChanged,
  loadEditorTypography,
  saveEditorTypography,
  FONT_LABELS,
  FONT_GROUPS,
  type EditorFontFamily,
  type EditorLineHeightPreset,
  type EditorPaperTint,
  type EditorTypographyState,
} from "../util/editor-typography";
import {
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  type ThemePreference,
} from "../theme";

// ── localStorage keys ────────────────────────────────────────────────────────
const FONT_KEY = "liubai:fontSizePx";
const EDITOR_WIDTH_KEY = "liubai:editorMaxWidthPx";
const EDITOR_AUTO_WIDTH_KEY = "liubai:editorAutoWidth";

const EDITOR_DEFAULT_MAX_WIDTH_PX = 1200;
const WIDTH_PRESETS = [
  { label: "自适应", auto: true, px: EDITOR_DEFAULT_MAX_WIDTH_PX },
  { label: "窄列", auto: false, px: 760 },
  { label: "标准", auto: false, px: 960 },
  { label: "宽版", auto: false, px: 1200 },
] as const;

// ── localStorage helpers ─────────────────────────────────────────────────────
function readFontSize(): number {
  const n = Number(localStorage.getItem(FONT_KEY));
  return !Number.isNaN(n) && n >= 12 && n <= 28 ? n : 16;
}
function saveFontSize(px: number) {
  try { localStorage.setItem(FONT_KEY, String(px)); } catch { /* quota */ }
  document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
  window.dispatchEvent(new Event("liubai-font-size"));
}

function readEditorWidth(): { auto: boolean; px: number } {
  try {
    const auto = localStorage.getItem(EDITOR_AUTO_WIDTH_KEY) !== "0";
    const px = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
    return { auto, px: Number.isFinite(px) && px >= 720 ? px : EDITOR_DEFAULT_MAX_WIDTH_PX };
  } catch { return { auto: true, px: EDITOR_DEFAULT_MAX_WIDTH_PX }; }
}
function saveEditorWidth(auto: boolean, px: number) {
  try {
    localStorage.setItem(EDITOR_AUTO_WIDTH_KEY, auto ? "1" : "0");
    localStorage.setItem(EDITOR_WIDTH_KEY, String(px));
  } catch { /* quota */ }
  window.dispatchEvent(new Event("liubai-editor-width"));
}

// ── UI primitives ────────────────────────────────────────────────────────────

/** 单行：左标签 + 右控件 */
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-h-[2.75rem] items-center justify-between gap-2 py-1">
      <div className="shrink-0">
        <span className="text-sm text-foreground/85">{label}</span>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground/70">{hint}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

/** 分隔线 */
function Divider() {
  return <div className="my-0.5 h-px bg-border/40" />;
}

/** 分组标题 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 first:mt-2">
      {children}
    </p>
  );
}

/** 胶囊切换按钮 */
function Cap({
  active,
  onClick,
  children,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active && !danger && "bg-primary text-primary-foreground",
        active && danger && "bg-destructive text-destructive-foreground",
        !active && "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

/** A− / value / A+ 步进控件 */
function Stepper({
  value,
  onDecrement,
  onIncrement,
  display,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  display?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onDecrement}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="减小"
      >
        −
      </button>
      <span className="w-12 text-center text-sm font-medium tabular-nums text-foreground">
        {display ?? value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="增大"
      >
        +
      </button>
    </div>
  );
}

// ── Line height presets ───────────────────────────────────────────────────────
const LH_PRESETS: { value: EditorLineHeightPreset; label: string }[] = [
  { value: "1.5", label: "1.5" },
  { value: "1.65", label: "1.65" },
  { value: "1.8", label: "1.8" },
  { value: "2", label: "2.0" },
];

const PAPER_PRESETS: { value: EditorPaperTint; label: string }[] = [
  { value: "none", label: "默认" },
  { value: "sepia", label: "暖黄" },
  { value: "green", label: "淡绿" },
];

const THEME_PRESETS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随" },
];

// ── Main ─────────────────────────────────────────────────────────────────────

export function EditorWritingSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [fontSize, setFontSizeState] = useState<number>(readFontSize);
  const [typography, setTypographyState] = useState<EditorTypographyState>(loadEditorTypography);
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference);
  const [editorWidth, setEditorWidthState] = useState(readEditorWidth);

  // Re-sync when sheet opens
  useEffect(() => {
    if (open) {
      setFontSizeState(readFontSize());
      setTypographyState(loadEditorTypography());
      setThemeState(readThemePreference());
      setEditorWidthState(readEditorWidth());
    }
  }, [open]);

  // ── setters ────────────────────────────────────────────────────────────────

  function setFontSize(px: number) {
    const v = Math.max(12, Math.min(28, px));
    setFontSizeState(v);
    saveFontSize(v);
  }

  function setTypography(patch: Partial<EditorTypographyState>) {
    setTypographyState((prev) => {
      const next = { ...prev, ...patch };
      saveEditorTypography(next);
      applyEditorTypographyCssVars(next);
      dispatchEditorTypographyChanged();
      return next;
    });
  }

  function setTheme(pref: ThemePreference) {
    setThemeState(pref);
    persistThemePreference(pref);
    applyThemePreference(pref);
  }

  function applyWidthPreset(auto: boolean, px: number) {
    setEditorWidthState({ auto, px });
    saveEditorWidth(auto, px);
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[280px] flex-col overflow-y-auto px-4 py-4 sm:max-w-[280px]"
      >
        <SheetHeader className="mb-1 p-0">
          <SheetTitle className="text-[15px] font-semibold">写作设置</SheetTitle>
        </SheetHeader>

        {/* ── 外观 ── */}
        <SectionTitle>外观</SectionTitle>

        <Row label="主题">
          {THEME_PRESETS.map(({ value, label }) => (
            <Cap key={value} active={theme === value} onClick={() => setTheme(value)}>{label}</Cap>
          ))}
        </Row>
        <Divider />
        <Row label="护眼底色">
          {PAPER_PRESETS.map(({ value, label }) => (
            <Cap key={value} active={typography.paperTint === value} onClick={() => setTypography({ paperTint: value })}>{label}</Cap>
          ))}
        </Row>

        {/* ── 排版 ── */}
        <SectionTitle>排版</SectionTitle>

        <Row label="字号">
          <Stepper
            value={fontSize}
            display={`${fontSize}px`}
            onDecrement={() => setFontSize(fontSize - 1)}
            onIncrement={() => setFontSize(fontSize + 1)}
          />
        </Row>
        <Divider />
        <Row label="字体">
          <select
            value={typography.fontFamily}
            onChange={(e) => setTypography({ fontFamily: e.target.value as EditorFontFamily })}
            className="w-[148px] rounded-lg border border-border/50 bg-muted px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {FONT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.fonts.map((f) => (
                  <option key={f} value={f}>{FONT_LABELS[f]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Row>
        <Divider />
        <Row label="行高">
          {LH_PRESETS.map(({ value, label }) => (
            <Cap
              key={value}
              active={typography.lineHeight === value}
              onClick={() => setTypography({ lineHeight: value })}
            >
              {label}
            </Cap>
          ))}
        </Row>

        {/* ── 稿纸 ── */}
        <SectionTitle>稿纸</SectionTitle>

        <Row label="稿纸宽度" hint="仅影响编辑区横向占宽">
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              {WIDTH_PRESETS.slice(0, 2).map(({ label, auto, px }) => {
                const active = auto ? editorWidth.auto : (!editorWidth.auto && editorWidth.px === px);
                return (
                  <Cap key={label} active={active} onClick={() => applyWidthPreset(auto, px)}>{label}</Cap>
                );
              })}
            </div>
            <div className="flex gap-1">
              {WIDTH_PRESETS.slice(2).map(({ label, auto, px }) => {
                const active = auto ? editorWidth.auto : (!editorWidth.auto && editorWidth.px === px);
                return (
                  <Cap key={label} active={active} onClick={() => applyWidthPreset(auto, px)}>{label}</Cap>
                );
              })}
            </div>
          </div>
        </Row>

        {/* ── 底部链接 ── */}
        <div className="mt-auto pt-5">
          <Divider />
          <Link
            to="/settings"
            onClick={() => onOpenChange(false)}
            className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            更多设置（快捷键、AI 配置、隐私…）
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
