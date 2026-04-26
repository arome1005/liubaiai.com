/**
 * 编辑器 section：字体/字号/行高 + 写作页纸面 + 编辑体验开关 + 快捷键。
 */
import { Keyboard, Moon, PenTool, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import {
  type EditorFontFamily,
  type EditorLineHeightPreset,
  type EditorPaperTint,
  type EditorTypographyState,
} from "../../util/editor-typography";
import type { EditorExperienceState } from "../../util/editor-experience";
import {
  defaultLiuguangQuickCaptureHotkey,
  defaultZenToggleHotkey,
  hotkeyConflictWith,
  hotkeyToLabel,
  writeLiuguangQuickCaptureHotkey,
  writeZenToggleHotkey,
  type HotkeyCombo,
} from "../../util/hotkey-config";
import { detectHotkeyConflicts } from "../../util/hotkey-conflicts";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsEditorSectionProps = {
  typography: EditorTypographyState;
  setTypography: React.Dispatch<React.SetStateAction<EditorTypographyState>>;
  fontSize: number;
  setFontSize: (n: number) => void;
  editorExp: EditorExperienceState;
  updateEditorExp: (patch: Partial<EditorExperienceState>) => void;
  liuguangHotkey: HotkeyCombo;
  setLiuguangHotkey: React.Dispatch<React.SetStateAction<HotkeyCombo>>;
  hotkeyMsg: string | null;
  setHotkeyMsg: (s: string | null) => void;
  zenHotkey: HotkeyCombo;
  setZenHotkey: React.Dispatch<React.SetStateAction<HotkeyCombo>>;
  zenHotkeyMsg: string | null;
  setZenHotkeyMsg: (s: string | null) => void;
};

const MOD_LABELS = { alt: "Alt/⌥", shift: "Shift/⇧", ctrl: "Ctrl", meta: "⌘/Meta" } as const;

export function SettingsEditorSection({
  typography,
  setTypography,
  fontSize,
  setFontSize,
  editorExp,
  updateEditorExp,
  liuguangHotkey,
  setLiuguangHotkey,
  hotkeyMsg,
  setHotkeyMsg,
  zenHotkey,
  setZenHotkey,
  zenHotkeyMsg,
  setZenHotkeyMsg,
}: SettingsEditorSectionProps) {
  return (
    <div id="settings-editor" className="space-y-4">
      {/* 字体设置 */}
      <SCard>
        <SHead title="字体设置" />
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">字体</span>
            </div>
            <select
              name="editorFontFamily"
              value={typography.fontFamily}
              className="input w-full text-sm"
              onChange={(e) => setTypography((t) => ({ ...t, fontFamily: e.target.value as EditorFontFamily }))}
            >
              <optgroup label="通用"><option value="system">系统无衬线</option><option value="mono">等宽</option></optgroup>
              <optgroup label="宋体 / 衬线"><option value="serif">思源宋体</option><option value="songti">宋体-简</option><option value="stSong">华文宋体</option><option value="zhongSong">华文中宋</option></optgroup>
              <optgroup label="仿宋 / 楷体"><option value="kaiti">楷体</option><option value="stKaiti">华文楷体</option><option value="fangSong">仿宋</option><option value="stFangSong">华文仿宋</option></optgroup>
              <optgroup label="黑体 / 圆体"><option value="msYahei">微软雅黑</option><option value="lantingHei">兰亭黑-繁</option><option value="hiragino">冬青黑字体</option><option value="xihei">华文细黑</option><option value="yuanti">圆体-简</option></optgroup>
              <optgroup label="艺术字体"><option value="xingkai">华文行楷</option><option value="hannotate">手札体-简</option><option value="wawati">娃娃体-简</option><option value="liti">华文隶书</option><option value="caiyun">华文彩云</option></optgroup>
            </select>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">字号</span>
              <span className="text-xs font-medium text-foreground">{fontSize}px</span>
            </div>
            <input
              name="fontSize"
              type="range"
              min={12}
              max={28}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">行高</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([["1.5", "紧凑"], ["1.65", "标准"], ["1.8", "默认"], ["2", "宽松"]] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTypography((t) => ({ ...t, lineHeight: v as EditorLineHeightPreset }))}
                  className={cn(
                    "rounded-lg border py-2 text-xs font-medium transition-colors",
                    typography.lineHeight === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60",
                  )}
                >
                  {l} {v}
                </button>
              ))}
            </div>
          </div>
          <div
            className="rounded-lg border border-border/20 bg-background/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground"
            style={{ fontFamily: "var(--editor-font-family, inherit)", fontSize, lineHeight: typography.lineHeight }}
          >
            这是一段预览文字。The quick brown fox jumps over the lazy dog. 天地玄黄，宇宙洪荒。
          </div>
        </div>
      </SCard>

      {/* 写作页纸面 */}
      <SCard>
        <SHead title="写作页纸面" sub="仅覆盖写作页稿纸区域的背景底色，不影响整体主题。" />
        <div className="grid grid-cols-3 gap-2">
          {([
            ["none",  "默认（随主题）", "bg-background"],
            ["sepia", "暖黄护眼",       "bg-amber-100/20"],
            ["green", "淡绿舒适",       "bg-green-100/20"],
          ] as const).map(([v, l, dot]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTypography((t) => ({ ...t, paperTint: v as EditorPaperTint }))}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors",
                typography.paperTint === v
                  ? "border-primary bg-primary/8 text-primary"
                  : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60",
              )}
            >
              <span className={cn("h-3.5 w-3.5 rounded-full border border-border/40", dot)} />
              {l}
            </button>
          ))}
        </div>
      </SCard>

      {/* 编辑体验 */}
      <SCard>
        <SHead title="编辑体验" />
        <div className="space-y-2">
          <SRow iconBg="bg-blue-500" icon={<PenTool className="h-4 w-4" />} title="打字机模式" desc="当前行保持在屏幕垂直中央，减少视线移动。">
            <Toggle checked={editorExp.typewriterMode} onChange={(v) => updateEditorExp({ typewriterMode: v })} />
          </SRow>
          <SRow iconBg="bg-indigo-500" icon={<Moon className="h-4 w-4" />} title="专注模式" desc="淡化非当前段落，减少写作干扰。">
            <Toggle checked={editorExp.focusMode} onChange={(v) => updateEditorExp({ focusMode: v })} />
          </SRow>
          <SRow iconBg="bg-emerald-500" icon={<Zap className="h-4 w-4" />} title="显示字数统计" desc="在写作页底部实时显示当前字数。">
            <Toggle checked={editorExp.showWordCount} onChange={(v) => updateEditorExp({ showWordCount: v })} />
          </SRow>
        </div>
      </SCard>

      {/* 快捷键 */}
      <SCard>
        <SHead title="快捷键" sub="修改后立即生效，保存前会检测冲突。" badge={<Keyboard className="h-4 w-4 text-muted-foreground/40" />} />
        <div className="space-y-3">
          {/* 流光速记 */}
          <div className="rounded-lg border border-border/30 bg-background/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">流光速记</span>
              <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{hotkeyToLabel(liuguangHotkey)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["alt", "shift", "ctrl", "meta"] as const).map((mod) => (
                <label key={mod} className="flex cursor-pointer items-center gap-1.5 rounded border border-border/30 bg-background/30 px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={liuguangHotkey[mod]}
                    onChange={(e) => setLiuguangHotkey((h) => ({ ...h, [mod]: e.target.checked }))}
                  />
                  {MOD_LABELS[mod]}
                </label>
              ))}
              <select
                value={liuguangHotkey.code}
                className="input rounded text-xs h-7 px-1"
                onChange={(e) => setLiuguangHotkey((h) => ({ ...h, code: e.target.value }))}
              >
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => <option key={ch} value={`Key${ch}`}>{ch}</option>)}
                {"0123456789".split("").map((d) => <option key={d} value={`Digit${d}`}>{d}</option>)}
              </select>
            </div>
            {(() => {
              const sys = detectHotkeyConflicts(liuguangHotkey);
              const cross = hotkeyConflictWith(liuguangHotkey, [{ id: "zenToggle", label: "沉浸写作", combo: zenHotkey }]);
              const all = [...sys, ...(cross ? [{ level: "error" as const, message: `与沉浸写作冲突` }] : [])];
              return all.length ? (
                <div className="mt-2 space-y-0.5">
                  {all.map((c, i) => (
                    <p key={i} className={cn("text-[10px]", c.level === "error" ? "text-destructive" : "text-amber-500")}>
                      {c.level === "error" ? "⚠ " : "ℹ "}{c.message}
                    </p>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setHotkeyMsg(null);
                  const d = defaultLiuguangQuickCaptureHotkey();
                  setLiuguangHotkey(d);
                  writeLiuguangQuickCaptureHotkey(d);
                }}
              >
                恢复默认
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setHotkeyMsg(null);
                  const r = writeLiuguangQuickCaptureHotkey(liuguangHotkey);
                  setHotkeyMsg(r.ok ? "已保存。" : r.error);
                }}
              >
                保存
              </Button>
              {hotkeyMsg && <span className="self-center text-xs text-muted-foreground">{hotkeyMsg}</span>}
            </div>
          </div>

          {/* 沉浸写作 */}
          <div className="rounded-lg border border-border/30 bg-background/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">沉浸写作</span>
              <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{hotkeyToLabel(zenHotkey)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["alt", "shift", "ctrl", "meta"] as const).map((mod) => (
                <label key={mod} className="flex cursor-pointer items-center gap-1.5 rounded border border-border/30 bg-background/30 px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={zenHotkey[mod]}
                    onChange={(e) => setZenHotkey((h) => ({ ...h, [mod]: e.target.checked }))}
                  />
                  {MOD_LABELS[mod]}
                </label>
              ))}
              <select
                value={zenHotkey.code}
                className="input rounded text-xs h-7 px-1"
                onChange={(e) => setZenHotkey((h) => ({ ...h, code: e.target.value }))}
              >
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => <option key={ch} value={`Key${ch}`}>{ch}</option>)}
                {"0123456789".split("").map((d) => <option key={d} value={`Digit${d}`}>{d}</option>)}
              </select>
            </div>
            {(() => {
              const sys = detectHotkeyConflicts(zenHotkey);
              const cross = hotkeyConflictWith(zenHotkey, [{ id: "liuguangQuickCapture", label: "流光速记", combo: liuguangHotkey }]);
              const all = [...sys, ...(cross ? [{ level: "error" as const, message: `与流光速记冲突` }] : [])];
              return all.length ? (
                <div className="mt-2 space-y-0.5">
                  {all.map((c, i) => (
                    <p key={i} className={cn("text-[10px]", c.level === "error" ? "text-destructive" : "text-amber-500")}>
                      {c.level === "error" ? "⚠ " : "ℹ "}{c.message}
                    </p>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setZenHotkeyMsg(null);
                  const d = defaultZenToggleHotkey();
                  setZenHotkey(d);
                  writeZenToggleHotkey(d);
                }}
              >
                恢复默认
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setZenHotkeyMsg(null);
                  const r = writeZenToggleHotkey(zenHotkey);
                  setZenHotkeyMsg(r.ok ? "已保存。" : r.error);
                }}
              >
                保存
              </Button>
              {zenHotkeyMsg && <span className="self-center text-xs text-muted-foreground">{zenHotkeyMsg}</span>}
            </div>
          </div>

          {/* 固定快捷键 */}
          <div className="rounded-lg border border-border/20 bg-muted/10 p-3">
            <p className="mb-2 text-xs text-muted-foreground">系统固定快捷键（不可修改）</p>
            <div className="space-y-1.5">
              {[
                { label: "全局命令面板", key: "Mod+K" },
                { label: "写作页保存/快照", key: "Mod+S" },
              ].map(({ label, key }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{key}</kbd>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/60">Mod = Mac 上为 ⌘，其余为 Ctrl。</p>
          </div>
        </div>
      </SCard>
    </div>
  );
}
