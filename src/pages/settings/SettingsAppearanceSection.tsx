/**
 * 外观 section：主题（浅/深/跟随系统）+ 强调色（6 选 1）+ 布局紧凑模式。
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  ACCENT_COLORS,
  persistAndApplyAccentColor,
  type AccentColorId,
} from "../../util/accent-color";
import type { EditorExperienceState } from "../../util/editor-experience";
import type { ThemePreference } from "../../theme";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsAppearanceSectionProps = {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  accentColor: AccentColorId;
  setAccentColor: (id: AccentColorId) => void;
  editorExp: EditorExperienceState;
  updateEditorExp: (patch: Partial<EditorExperienceState>) => void;
};

export function SettingsAppearanceSection({
  theme,
  setTheme,
  accentColor,
  setAccentColor,
  editorExp,
  updateEditorExp,
}: SettingsAppearanceSectionProps) {
  return (
    <div id="settings-appearance" className="space-y-4">
      {/* 主题 */}
      <SCard>
        <SHead title="主题" sub="「跟随系统」可随日出日落自动切换，系统切换后本页同步更新。" />
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: "light",  label: "浅色",   Icon: Sun },
            { value: "dark",   label: "深色",   Icon: Moon },
            { value: "system", label: "跟随系统", Icon: Monitor },
          ] as const).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition-all",
                theme === value
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60 hover:bg-background/40",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </SCard>

      {/* 强调色 */}
      <SCard>
        <SHead title="强调色" sub="全局主色调，影响按钮、链接、高亮等交互元素。" />
        <div className="flex flex-wrap gap-3">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => {
                persistAndApplyAccentColor(c.id);
                setAccentColor(c.id);
              }}
              className={cn(
                "flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-medium transition-all",
                accentColor === c.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border/40",
              )}
            >
              <span className={cn("h-3.5 w-3.5 rounded-full", c.tailwindClass)} />
              {c.label}
            </button>
          ))}
        </div>
      </SCard>

      {/* 布局 */}
      <SCard>
        <SHead title="布局" />
        <SRow
          iconBg="bg-slate-500"
          icon={<Monitor className="h-4 w-4" />}
          title="紧凑模式"
          desc="减少页面间距，在较小屏幕上显示更多内容。"
        >
          <Toggle
            checked={editorExp.compactMode}
            onChange={(v) => updateEditorExp({ compactMode: v })}
          />
        </SRow>
      </SCard>
    </div>
  );
}
