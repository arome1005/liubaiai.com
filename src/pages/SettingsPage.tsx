import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronLeft,
  Database,
  FileDown,
  Keyboard,
  Lightbulb,
  Moon,
  Monitor,
  Palette,
  PenTool,
  Save,
  Settings,
  Shield,
  Sun,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/button";
import {
  clearAllReferenceLibraryData,
  rebuildAllReferenceSearchIndex,
  snapshotAllChaptersInLibrary,
} from "../db/repo";
import { buildBackupZip, parseBackupZip } from "../storage/backup";
import type { LineEndingMode } from "../util/lineEnding";
import { readFictionCreationAcknowledged, writeFictionCreationAcknowledged } from "../ai/fiction-ack";
import {
  readLifetimeApproxTokens,
  readSessionApproxTokens,
  resetLifetimeApproxTokens,
  resetSessionApproxTokens,
} from "../ai/sidepanel-session-tokens";
import { listRecentDailyApproxTokens, readTodayApproxTokens, resetTodayApproxTokens } from "../ai/daily-approx-tokens";
import { loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiProviderConfig, AiSettings } from "../ai/types";
import { BackendModelConfigModal } from "../components/BackendModelConfigModal";
import { OwnerModeSection } from "../components/OwnerModeSection";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { persistThemePreference, readThemePreference, type ThemePreference } from "../theme";
import {
  BACKUP_NUDGE_INTERVAL_MS,
  formatBackupNudgeDetail,
  readBackupReminderEnabled,
  readLastBackupExportMs,
  recordBackupExportSuccess,
  writeBackupReminderEnabled,
} from "../util/backup-reminder";
import {
  applyEditorTypographyCssVars,
  dispatchEditorTypographyChanged,
  loadEditorTypography,
  saveEditorTypography,
  type EditorFontFamily,
  type EditorLineHeightPreset,
  type EditorPaperTint,
  type EditorTypographyState,
} from "../util/editor-typography";
import {
  ACCENT_COLORS,
  persistAndApplyAccentColor,
  readAccentColor,
  type AccentColorId,
} from "../util/accent-color";
import {
  applyEditorExperience,
  loadEditorExperience,
  saveEditorExperience,
  type EditorExperienceState,
} from "../util/editor-experience";
import {
  defaultLiuguangQuickCaptureHotkey,
  defaultZenToggleHotkey,
  hotkeyConflictWith,
  hotkeyToLabel,
  readLiuguangQuickCaptureHotkey,
  readZenToggleHotkey,
  writeLiuguangQuickCaptureHotkey,
  writeZenToggleHotkey,
  type HotkeyCombo,
} from "../util/hotkey-config";
import { detectHotkeyConflicts } from "../util/hotkey-conflicts";

const FONT_KEY = "liubai:fontSizePx";
const LINE_ENDING_KEY = "liubai:exportLineEnding";
const DIAGNOSTIC_KEY = "liubai:diagnostic";
// AI 配置由 src/ai/storage.ts 管理（localStorage）

function readFontSize(): number {
  const n = Number(localStorage.getItem(FONT_KEY));
  if (!Number.isNaN(n) && n >= 12 && n <= 28) return n;
  return 16;
}

function readLineEnding(): LineEndingMode {
  try {
    return localStorage.getItem(LINE_ENDING_KEY) === "crlf" ? "crlf" : "lf";
  } catch {
    return "lf";
  }
}

function readDiagnostic(): boolean {
  try {
    return localStorage.getItem(DIAGNOSTIC_KEY) === "1";
  } catch {
    return false;
  }
}

const SETTINGS_NAV: readonly {
  id: string;
  label: string;
  hint: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    id: "settings-appearance",
    label: "外观",
    hint: "主题与显示",
    description: "主题与显示",
    icon: Palette,
  },
  {
    id: "settings-editor",
    label: "编辑器",
    hint: "字号与排版",
    description: "写作界面与排版偏好",
    icon: PenTool,
  },
  {
    id: "settings-export",
    label: "导出",
    hint: "换行符",
    description: "纯文本与 Markdown 导出换行",
    icon: FileDown,
  },
  {
    id: "settings-privacy",
    label: "隐私",
    hint: "诊断与协议",
    description: "诊断模式与法律文档",
    icon: Shield,
  },
  {
    id: "settings-storage",
    label: "存储",
    hint: "浏览器配额",
    description: "IndexedDB 占用与配额",
    icon: Database,
  },
  {
    id: "backup-data",
    label: "数据",
    hint: "备份与恢复",
    description: "本机备份与导入",
    icon: Save,
  },
  {
    id: "settings-reference",
    label: "参考库",
    hint: "索引维护",
    description: "参考库索引与自救",
    icon: BookOpen,
  },
  {
    id: "fiction-creation",
    label: "虚构创作",
    hint: "AI 声明",
    description: "虚构创作与合规说明",
    icon: Lightbulb,
  },
  {
    id: "ai-privacy",
    label: "AI 配置",
    hint: "本机与隐私",
    description: "本机 AI、用量与高危确认",
    icon: Brain,
  },
];

function navIdFromHash(hash: string): string {
  const h = hash.replace(/^#/, "");
  return SETTINGS_NAV.some((n) => n.id === h) ? h : "settings-appearance";
}

/** 每个 nav 项对应的图标背景色（Tailwind bg-* 类） */
const NAV_ICON_BG: Record<string, string> = {
  "settings-appearance": "bg-blue-500",
  "settings-editor":     "bg-emerald-500",
  "settings-export":     "bg-amber-500",
  "settings-privacy":    "bg-rose-500",
  "settings-storage":    "bg-indigo-500",
  "backup-data":         "bg-purple-500",
  "settings-reference":  "bg-orange-500",
  "fiction-creation":    "bg-cyan-500",
  "ai-privacy":          "bg-violet-500",
};

/** 章节卡片容器 */
function SCard({
  children, className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/30 p-5", className)}>
      {children}
    </div>
  );
}

/** 章节标题行 */
function SHead({
  title, sub, badge,
}: { title: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {badge}
    </div>
  );
}

/** 单行设置项 — 图标 + 标题 + 描述 + 右侧控件 */
function SRow({
  iconBg = "bg-muted/60",
  icon,
  title,
  desc,
  children,
}: {
  iconBg?: string;
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-3">
      {icon && (
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white", iconBg)}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        {desc && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** 药丸形开关 */
function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        checked ? "bg-primary" : "bg-muted",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

function scrollAppMainToTop() {
  document.querySelector("main.app-main")?.scrollTo({ top: 0, behavior: "smooth" });
}

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(readFontSize);
  const [typography, setTypography] = useState<EditorTypographyState>(() => loadEditorTypography());
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference());
  const [lineEnding, setLineEnding] = useState(readLineEnding);
  const [diagnostic, setDiagnostic] = useState(readDiagnostic);
  const [storageEstimate, setStorageEstimate] = useState<string | null>(null);
  const [storageBytes, setStorageBytes] = useState<{ usage: number; quota: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refMaintainPct, setRefMaintainPct] = useState<number | null>(null);
  const [refMaintainLabel, setRefMaintainLabel] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [accentColor, setAccentColor] = useState<AccentColorId>(() => readAccentColor());
  const [editorExp, setEditorExp] = useState<EditorExperienceState>(() => loadEditorExperience());
  const [backendOpen, setBackendOpen] = useState(false);
  const [fictionAck, setFictionAck] = useState(() => readFictionCreationAcknowledged());
  const [backupReminderOn, setBackupReminderOn] = useState(() => readBackupReminderEnabled());
  const [lastBackupExportMs, setLastBackupExportMs] = useState<number | null>(() => readLastBackupExportMs());
  const [activeNav, setActiveNav] = useState<string>(() => navIdFromHash(location.hash));
  const [sidepanelUsageTick, setSidepanelUsageTick] = useState(0);
  const [liuguangHotkey, setLiuguangHotkey] = useState<HotkeyCombo>(() => readLiuguangQuickCaptureHotkey());
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null);
  const [zenHotkey, setZenHotkey] = useState<HotkeyCombo>(() => readZenToggleHotkey());
  const [zenHotkeyMsg, setZenHotkeyMsg] = useState<string | null>(null);
  const { authUser } = useAuthUserState();
  const currentEmail =
    authUser && typeof authUser === "object" && "email" in authUser
      ? (authUser as { email: string }).email
      : null;

  useEffect(() => {
    const bump = () => setSidepanelUsageTick((n) => n + 1);
    const id = window.setInterval(bump, 2500);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const sessionApproxDisplay = useMemo(() => readSessionApproxTokens(), [sidepanelUsageTick]);
  const lifetimeApproxDisplay = useMemo(() => readLifetimeApproxTokens(), [sidepanelUsageTick]);
  const todayApproxDisplay = useMemo(() => readTodayApproxTokens(), [sidepanelUsageTick]);
  const recentDailyApprox = useMemo(() => listRecentDailyApproxTokens(7), [sidepanelUsageTick]);
  const recentDailyMax = useMemo(
    () => Math.max(1, ...recentDailyApprox.map((d) => d.tokens)),
    [recentDailyApprox],
  );
  const dailyBudget = aiSettings.dailyTokenBudget ?? 0;
  const dailyBudgetPct =
    dailyBudget > 0 ? Math.min(999, (todayApproxDisplay / Math.max(1, dailyBudget)) * 100) : 0;

  useEffect(() => {
    const h = location.hash.replace(/^#/, "");
    if (!h || !SETTINGS_NAV.some((n) => n.id === h)) return;
    setActiveNav(h);
    const t = window.setTimeout(() => {
      scrollAppMainToTop();
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  function goSettingsSection(id: string) {
    setActiveNav(id);
    navigate({ pathname: "/settings", hash: id }, { replace: true });
    window.requestAnimationFrame(() => {
      scrollAppMainToTop();
    });
  }

  const updateEditorExp = useCallback((patch: Partial<EditorExperienceState>) => {
    setEditorExp((prev) => {
      const next = { ...prev, ...patch };
      saveEditorExperience(next);
      applyEditorExperience(next);
      return next;
    });
  }, []);

  function refreshStorageQuota() {
    if (!navigator.storage?.estimate) {
      setStorageEstimate("（无法估算）");
      setStorageBytes(null);
      return;
    }
    void navigator.storage.estimate().then((est) => {
      const rawU = est.usage;
      const rawQ = est.quota;
      const usage = typeof rawU === "number" && Number.isFinite(rawU) && rawU >= 0 ? rawU : NaN;
      const quota = typeof rawQ === "number" && Number.isFinite(rawQ) && rawQ > 0 ? rawQ : NaN;
      if (!Number.isFinite(usage) || !Number.isFinite(quota)) {
        setStorageBytes(null);
        setStorageEstimate("（浏览器未返回有效占用/配额）");
        return;
      }
      setStorageBytes({ usage, quota });
      const fmt = (n: number) =>
        n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`;
      setStorageEstimate(`${fmt(usage)} / 约 ${fmt(quota)}`);
    });
  }

  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    saveEditorTypography(typography);
    applyEditorTypographyCssVars(typography);
    dispatchEditorTypographyChanged();
  }, [typography]);

  useEffect(() => {
    persistThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LINE_ENDING_KEY, lineEnding);
  }, [lineEnding]);

  useEffect(() => {
    localStorage.setItem(DIAGNOSTIC_KEY, diagnostic ? "1" : "0");
  }, [diagnostic]);

  useEffect(() => {
    refreshStorageQuota();
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") refreshStorageQuota();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function downloadBackup() {
    setMsg(null);
    try {
      await snapshotAllChaptersInLibrary();
      const blob = await buildBackupZip();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `liubai-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      recordBackupExportSuccess();
      setLastBackupExportMs(Date.now());
      setMsg("已下载备份 zip。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "备份失败");
    }
  }

  function pickRestore(mode: "replace" | "merge") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const confirmMsg =
        mode === "replace"
          ? "从备份恢复会覆盖当前库内全部数据。确定继续？"
          : "合并导入将保留现有数据，并追加备份中的作品（生成新 id）。确定继续？";
      if (!window.confirm(confirmMsg)) {
        return;
      }
      void (async () => {
        setMsg(null);
        try {
          await parseBackupZip(file, mode);
          setMsg(mode === "replace" ? "恢复成功，请刷新页面。" : "合并导入成功，请刷新页面。");
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "恢复失败");
        }
      })();
    };
    input.click();
  }

  const backupNudge =
    backupReminderOn &&
    (lastBackupExportMs == null || Date.now() - lastBackupExportMs >= BACKUP_NUDGE_INTERVAL_MS);

  const navKey = useMemo(
    () => (SETTINGS_NAV.some((n) => n.id === activeNav) ? activeNav : SETTINGS_NAV[0].id),
    [activeNav],
  );

  const activeMeta = useMemo(
    () => SETTINGS_NAV.find((n) => n.id === navKey) ?? SETTINGS_NAV[0],
    [navKey],
  );

  return (
    <div className={cn("settings-page settings-page-v0 flex w-full max-w-none flex-col", "-mx-4 -my-6 lg:-mx-6")}>
      <div className={cn("flex min-h-0 flex-1 flex-col gap-0", "md:min-h-[calc(100dvh-var(--masthead-h)-var(--shell-topbar-h)-3rem)] md:flex-row")}>

        {/* ── 左侧导航 ── */}
        <aside
          className={cn(
            "w-full shrink-0 border-border/30 md:w-60 md:border-r",
            "border-b md:sticky md:top-0 md:self-start md:border-b-0",
            "md:max-h-[calc(100dvh-var(--masthead-h)-var(--shell-topbar-h)-3rem)] md:overflow-y-auto",
            "bg-card/20",
          )}
          aria-label="设置分区"
        >
          <div className="px-3 py-4">
            <div className="mb-3 flex items-center gap-2 px-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">设置</span>
            </div>
            <div className="space-y-0.5">
              {SETTINGS_NAV.map((n) => {
                const Icon = n.icon;
                const isActive = navKey === n.id;
                const iconBg = NAV_ICON_BG[n.id] ?? "bg-muted";
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => goSettingsSection(n.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white", isActive ? iconBg : "bg-muted/60")}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{n.label}</p>
                      <p className="text-[10px] leading-tight opacity-60">{n.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 border-t border-border/30 pt-3">
              <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground no-underline transition-colors hover:text-foreground">
                <ChevronLeft className="h-3 w-3" /> 返回首页
              </Link>
            </div>
          </div>
        </aside>

        {/* ── 主内容区 ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-2xl px-6 py-6">
            {/* 页头 */}
            <div className="mb-6 flex items-center gap-3">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-white", NAV_ICON_BG[navKey] ?? "bg-muted/60")}>
                {React.createElement(activeMeta.icon, { className: "h-4 w-4" })}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{activeMeta.label}</h1>
                <p className="text-xs text-muted-foreground">{activeMeta.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {(() => {
                switch (navKey) {
                  case "settings-appearance":
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
              <button key={value} type="button" onClick={() => setTheme(value)}
                className={cn("flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition-all",
                  theme === value ? "border-primary bg-primary/8 text-primary" : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60 hover:bg-background/40")}>
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
              <button key={c.id} type="button" title={c.label}
                onClick={() => { persistAndApplyAccentColor(c.id); setAccentColor(c.id); }}
                className={cn("flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-medium transition-all",
                  accentColor === c.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border/40")}>
                <span className={cn("h-3.5 w-3.5 rounded-full", c.tailwindClass)} />
                {c.label}
              </button>
            ))}
          </div>
        </SCard>

        {/* 布局 */}
        <SCard>
          <SHead title="布局" />
          <SRow iconBg="bg-slate-500" icon={<Monitor className="h-4 w-4" />} title="紧凑模式" desc="减少页面间距，在较小屏幕上显示更多内容。">
            <Toggle checked={editorExp.compactMode} onChange={(v) => updateEditorExp({ compactMode: v })} />
          </SRow>
        </SCard>
      </div>
                    );
                  case "settings-editor":
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
              <input name="fontSize" type="range" min={12} max={28} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">行高</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([["1.5","紧凑"],["1.65","标准"],["1.8","默认"],["2","宽松"]] as const).map(([v,l]) => (
                  <button key={v} type="button"
                    onClick={() => setTypography((t) => ({ ...t, lineHeight: v as EditorLineHeightPreset }))}
                    className={cn("rounded-lg border py-2 text-xs font-medium transition-colors",
                      typography.lineHeight === v ? "border-primary bg-primary/10 text-primary" : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60"
                    )}
                  >{l} {v}</button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border/20 bg-background/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "var(--editor-font-family, inherit)", fontSize, lineHeight: typography.lineHeight }}>
              这是一段预览文字。The quick brown fox jumps over the lazy dog. 天地玄黄，宇宙洪荒。
            </div>
          </div>
        </SCard>

        {/* 编辑体验 */}
        <SCard>
          <SHead title="写作页纸面" sub="仅覆盖写作页稿纸区域的背景底色，不影响整体主题。" />
          <div className="grid grid-cols-3 gap-2">
            {([["none","默认（随主题）","bg-background"],["sepia","暖黄护眼","bg-amber-100/20"],["green","淡绿舒适","bg-green-100/20"]] as const).map(([v,l,dot]) => (
              <button key={v} type="button"
                onClick={() => setTypography((t) => ({ ...t, paperTint: v as EditorPaperTint }))}
                className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-colors",
                  typography.paperTint === v ? "border-primary bg-primary/8 text-primary" : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60"
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
                {(["alt","shift","ctrl","meta"] as const).map((mod) => (
                  <label key={mod} className="flex cursor-pointer items-center gap-1.5 rounded border border-border/30 bg-background/30 px-2 py-1 text-xs">
                    <input type="checkbox" checked={liuguangHotkey[mod]} onChange={(e) => setLiuguangHotkey((h) => ({ ...h, [mod]: e.target.checked }))} />
                    {{ alt:"Alt/⌥",shift:"Shift/⇧",ctrl:"Ctrl",meta:"⌘/Meta" }[mod]}
                  </label>
                ))}
                <select value={liuguangHotkey.code} className="input rounded text-xs h-7 px-1"
                  onChange={(e) => setLiuguangHotkey((h) => ({ ...h, code: e.target.value }))}>
                  {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => <option key={ch} value={`Key${ch}`}>{ch}</option>)}
                  {"0123456789".split("").map((d) => <option key={d} value={`Digit${d}`}>{d}</option>)}
                </select>
              </div>
              {(() => { const sys = detectHotkeyConflicts(liuguangHotkey); const cross = hotkeyConflictWith(liuguangHotkey,[{id:"zenToggle",label:"沉浸写作",combo:zenHotkey}]); const all=[...sys,...(cross?[{level:"error" as const,message:`与沉浸写作冲突`}]:[])]; return all.length ? <div className="mt-2 space-y-0.5">{all.map((c,i)=><p key={i} className={cn("text-[10px]",c.level==="error"?"text-destructive":"text-amber-500")}>{c.level==="error"?"⚠ ":"ℹ "}{c.message}</p>)}</div> : null; })()}
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setHotkeyMsg(null); const d=defaultLiuguangQuickCaptureHotkey(); setLiuguangHotkey(d); writeLiuguangQuickCaptureHotkey(d); }}>恢复默认</Button>
                <Button type="button" size="sm" className="h-7 text-xs" onClick={() => { setHotkeyMsg(null); const r=writeLiuguangQuickCaptureHotkey(liuguangHotkey); setHotkeyMsg(r.ok?"已保存。":r.error); }}>保存</Button>
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
                {(["alt","shift","ctrl","meta"] as const).map((mod) => (
                  <label key={mod} className="flex cursor-pointer items-center gap-1.5 rounded border border-border/30 bg-background/30 px-2 py-1 text-xs">
                    <input type="checkbox" checked={zenHotkey[mod]} onChange={(e) => setZenHotkey((h) => ({ ...h, [mod]: e.target.checked }))} />
                    {{ alt:"Alt/⌥",shift:"Shift/⇧",ctrl:"Ctrl",meta:"⌘/Meta" }[mod]}
                  </label>
                ))}
                <select value={zenHotkey.code} className="input rounded text-xs h-7 px-1"
                  onChange={(e) => setZenHotkey((h) => ({ ...h, code: e.target.value }))}>
                  {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => <option key={ch} value={`Key${ch}`}>{ch}</option>)}
                  {"0123456789".split("").map((d) => <option key={d} value={`Digit${d}`}>{d}</option>)}
                </select>
              </div>
              {(() => { const sys = detectHotkeyConflicts(zenHotkey); const cross = hotkeyConflictWith(zenHotkey,[{id:"liuguangQuickCapture",label:"流光速记",combo:liuguangHotkey}]); const all=[...sys,...(cross?[{level:"error" as const,message:`与流光速记冲突`}]:[])]; return all.length ? <div className="mt-2 space-y-0.5">{all.map((c,i)=><p key={i} className={cn("text-[10px]",c.level==="error"?"text-destructive":"text-amber-500")}>{c.level==="error"?"⚠ ":"ℹ "}{c.message}</p>)}</div> : null; })()}
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setZenHotkeyMsg(null); const d=defaultZenToggleHotkey(); setZenHotkey(d); writeZenToggleHotkey(d); }}>恢复默认</Button>
                <Button type="button" size="sm" className="h-7 text-xs" onClick={() => { setZenHotkeyMsg(null); const r=writeZenToggleHotkey(zenHotkey); setZenHotkeyMsg(r.ok?"已保存。":r.error); }}>保存</Button>
                {zenHotkeyMsg && <span className="self-center text-xs text-muted-foreground">{zenHotkeyMsg}</span>}
              </div>
            </div>
            {/* 固定快捷键 */}
            <div className="rounded-lg border border-border/20 bg-muted/10 p-3">
              <p className="mb-2 text-xs text-muted-foreground">系统固定快捷键（不可修改）</p>
              <div className="space-y-1.5">
                {[{label:"全局命令面板",key:"Mod+K"},{label:"写作页保存/快照",key:"Mod+S"}].map(({label,key}) => (
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
                  case "settings-export":
                    return (
      <div id="settings-export" className="space-y-4">
        <SCard>
          <SHead title="导出格式" sub="纯文本与 Markdown 导出时使用的换行符。" />
          <div className="grid grid-cols-2 gap-3">
            {([["lf","LF（Unix / macOS）"],["crlf","CRLF（Windows）"]] as const).map(([v,l]) => (
              <button key={v} type="button"
                onClick={() => setLineEnding(v)}
                className={cn("flex flex-col items-start gap-0.5 rounded-xl border-2 px-4 py-3 text-left transition-all",
                  lineEnding === v ? "border-primary bg-primary/8 text-primary" : "border-border/30 bg-background/20 text-muted-foreground hover:border-border/60"
                )}
              >
                <span className="font-mono text-sm font-semibold">{v.toUpperCase()}</span>
                <span className="text-[11px]">{l}</span>
              </button>
            ))}
          </div>
        </SCard>
      </div>
                    );
                  case "settings-privacy":
                    return (
      <div id="settings-privacy" className="space-y-4">
        <SCard>
          <SHead title="诊断与隐私" />
          <SRow iconBg="bg-rose-500" icon={<Shield className="h-4 w-4" />} title="诊断模式" desc="开启后错误边界在控制台输出完整堆栈，便于排查问题；默认关闭。">
            <Toggle checked={diagnostic} onChange={setDiagnostic} />
          </SRow>
          <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
            <Link to="/privacy" className="text-primary no-underline hover:underline">隐私政策</Link>
            <span>·</span>
            <Link to="/terms" className="text-primary no-underline hover:underline">用户协议</Link>
          </div>
        </SCard>
      </div>
                    );
                  case "settings-storage":
                    return (
      <div id="settings-storage" className="space-y-4">
        <SCard>
          <SHead title="存储配额（IndexedDB）" sub="浏览器为当前站点分配的上限，接近或占满时无法保存，请及时导出备份。" />
          {storageBytes && storageBytes.quota > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-foreground">
                  {((storageBytes.usage / storageBytes.quota) * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">{storageEstimate}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn("h-full rounded-full transition-all", storageBytes.usage / storageBytes.quota > 0.8 ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${Math.min(100, (storageBytes.usage / storageBytes.quota) * 100)}%` }}
                />
              </div>
              {storageBytes.usage / storageBytes.quota > 0.8 && (
                <p className="text-xs text-destructive">已使用超过 80%，建议尽快导出备份或清理章节快照。</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{storageEstimate ?? "…"}</p>
          )}
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refreshStorageQuota()}>刷新占用</Button>
        </SCard>
      </div>
                    );
                  case "backup-data":
                    return (
      <div id="backup-data" className="space-y-4">
        {backupNudge && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-500">备份提醒</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatBackupNudgeDetail(Date.now(), lastBackupExportMs)}</p>
            </div>
          </div>
        )}
        <SCard>
          <SHead title="本机备份" />
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">重要：</strong>作品与正文<strong>仅保存在本机浏览器</strong> IndexedDB 中，不会上传到服务器。换浏览器、清站点数据会<strong>丢失</strong>未备份的内容。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="default" onClick={() => void downloadBackup()}>导出备份（zip）</Button>
            <Button type="button" variant="outline" onClick={() => pickRestore("replace")}>从备份恢复（覆盖）</Button>
            <Button type="button" variant="outline" onClick={() => pickRestore("merge")}>合并导入备份</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">覆盖：清空当前库后写入备份。合并：追加备份中的作品（新 id），不删除当前数据。</p>
        </SCard>
        <SCard>
          <SRow iconBg="bg-purple-500" icon={<Save className="h-4 w-4" />} title="备份周期提醒" desc="约 30 天未记录导出时，在本页顶部显示提醒。">
            <Toggle checked={backupReminderOn} onChange={(on) => { setBackupReminderOn(on); writeBackupReminderEnabled(on); }} />
          </SRow>
        </SCard>
      </div>
                    );
                  case "settings-reference":
                    return (
      <div id="settings-reference" className="space-y-4">
        <SCard>
          <SHead title="参考库维护" sub="仅作用于参考库（导入的原著与摘录），不会删除作品正文。" />
          <p className="mb-3 text-xs text-muted-foreground">若升级后检索异常，可先重建索引；仍异常再考虑清空参考库后重新导入。</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={refMaintainPct !== null}
              onClick={() => { void (async () => { setRefMaintainPct(0); setRefMaintainLabel("准备…"); try { await rebuildAllReferenceSearchIndex((p) => { setRefMaintainPct(p.percent); setRefMaintainLabel(p.label ?? ""); }); setMsg("参考库索引已重建。"); } catch (e) { setMsg(e instanceof Error ? e.message : "重建失败"); } finally { setRefMaintainPct(null); setRefMaintainLabel(null); } })(); }}>
              重建参考库索引
            </Button>
            <Button type="button" variant="destructive" disabled={refMaintainPct !== null}
              onClick={() => { if (!window.confirm("将清空全部参考库数据，不影响作品正文。不可撤销。确定？")) return; void (async () => { try { await clearAllReferenceLibraryData(); setMsg("已清空参考库。"); } catch (e) { setMsg(e instanceof Error ? e.message : "清空失败"); } })(); }}>
              清空参考库
            </Button>
          </div>
          {refMaintainPct !== null && (
            <div className="mt-3 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, refMaintainPct)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{refMaintainLabel ?? ""}</p>
            </div>
          )}
        </SCard>
      </div>
                    );
                  case "fiction-creation":
                    return (
      <div id="fiction-creation" className="space-y-4">
        <SCard>
          <SHead title="虚构创作声明" />
          <div className="rounded-lg border border-border/20 bg-background/20 p-3 text-xs leading-relaxed text-muted-foreground">
            本工具用于小说等<strong className="text-foreground">虚构创作</strong>辅助。请勿将生成内容用于违法用途、现实伤害、冒充身份等。使用云端模型时，发送内容需符合各提供方政策。
          </div>
          <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
            <Link to="/terms" className="text-primary no-underline hover:underline">用户协议</Link>
            <span>·</span>
            <Link to="/privacy" className="text-primary no-underline hover:underline">隐私政策</Link>
          </div>
        </SCard>
        <SCard>
          <SRow iconBg="bg-cyan-500" icon={<Lightbulb className="h-4 w-4" />} title="我已阅读并理解上述声明" desc="可选记录、便于留痕。未勾选不会禁止 AI 生成；首次生成前仍有弹窗确认。">
            <Toggle checked={fictionAck} onChange={(on) => { setFictionAck(on); writeFictionCreationAcknowledged(on); }} />
          </SRow>
        </SCard>
      </div>
                    );
                  case "ai-privacy":
                    return (
      <div id="ai-privacy" className="space-y-4">
        {/* 当前模型 */}
        {(() => {
          const pCfg = (aiSettings as unknown as Record<string, AiProviderConfig>)[aiSettings.provider];
          const pLabel = pCfg?.label ?? aiSettings.provider;
          const pModel = pCfg?.model?.trim();
          return (
            <SCard>
              <SRow iconBg="bg-violet-500" icon={<Brain className="h-4 w-4" />} title="当前模型" desc={`${pLabel}${pModel ? ` · ${pModel}` : " · 未配置"}`}>
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setBackendOpen(true)}>配置</Button>
              </SRow>
              <p className="mt-2 px-1 text-[11px] text-muted-foreground/60">配置存于本机 localStorage。直连第三方模型可能遇到 CORS；Ollama 默认本机 11434 端口通常可用。</p>
            </SCard>
          );
        })()}

        {/* Token 用量统计 */}
        <SCard>
          <SHead title="粗估用量" sub="按请求与输出粗算，非厂商计费、不会上传。" badge={<Zap className="h-4 w-4 text-muted-foreground/40" />} />
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "本会话", value: sessionApproxDisplay, onClear: () => { resetSessionApproxTokens(); setSidepanelUsageTick((n) => n + 1); }, highlight: false },
              { label: "今日累计", value: todayApproxDisplay, onClear: () => { resetTodayApproxTokens(); setSidepanelUsageTick((n) => n + 1); }, highlight: true },
              { label: "本机累计", value: lifetimeApproxDisplay, onClear: () => { if (!window.confirm("将清零「本机累计」粗估 tokens（仅本机显示，不影响作品数据）。确定？")) return; resetLifetimeApproxTokens(); setSidepanelUsageTick((n) => n + 1); }, highlight: false },
            ].map(({ label, value, onClear, highlight }) => (
              <div key={label} className={cn("relative rounded-xl border p-3", highlight ? "border-primary/30 bg-primary/5" : "border-border/30 bg-background/20")}>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={cn("mt-1 text-xl font-bold tabular-nums", highlight ? "text-primary" : "text-foreground")}>
                  {value >= 10_000 ? `${(value / 1_000).toFixed(0)}k` : value.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground/60">tokens</p>
                <button type="button" onClick={onClear} className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground">清零</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/50">切换标签页自动刷新 · 关闭标签页后「本会话」清零 · 「本机累计」保留至手动清零</p>
        </SCard>

        {/* 成本预算门控 */}
        <SCard>
          <SHead title="成本预算 · 门控阈值" sub="超出后在写作侧栏弹出确认弹窗（可继续，非硬性拦截），数值仅本机记录。" />
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">日预算 <span className="opacity-60">（0 = 不限制）</span></span>
                <span className="text-xs font-medium">{aiSettings.dailyTokenBudget === 0 ? "不限制" : `${(aiSettings.dailyTokenBudget / 10_000).toFixed(1)}万 tokens`}</span>
              </div>
              <div className="flex gap-2">
                <input type="number" className="input flex-1 text-sm" min={0} max={10_000_000} step={10_000} value={aiSettings.dailyTokenBudget}
                  onChange={(e) => { const v = Math.max(0,Math.min(10_000_000,Math.floor(Number(e.target.value)||0))); const next={...aiSettings,dailyTokenBudget:v}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }} />
                <span className="flex items-center text-xs text-muted-foreground">tokens</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([0,50_000,100_000,500_000] as const).map((v) => (
                  <button key={v} type="button"
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", aiSettings.dailyTokenBudget===v?"border-primary bg-primary/10 text-primary":"border-border/30 text-muted-foreground hover:border-border/60")}
                    onClick={() => { const next={...aiSettings,dailyTokenBudget:v}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }}>
                    {v===0?"不限制":v>=10_000?`${v/10_000}万`:String(v)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">单次调用预警 <span className="opacity-60">（0 = 不预警）</span></span>
                <span className="text-xs font-medium">{aiSettings.singleCallWarnTokens === 0 ? "不预警" : `${(aiSettings.singleCallWarnTokens/1_000).toFixed(0)}k tokens`}</span>
              </div>
              <div className="flex gap-2">
                <input type="number" className="input flex-1 text-sm" min={0} max={500_000} step={1_000} value={aiSettings.singleCallWarnTokens}
                  onChange={(e) => { const v=Math.max(0,Math.min(500_000,Math.floor(Number(e.target.value)||0))); const next={...aiSettings,singleCallWarnTokens:v}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }} />
                <span className="flex items-center text-xs text-muted-foreground">tokens</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([0,5_000,20_000,100_000] as const).map((v) => (
                  <button key={v} type="button"
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", aiSettings.singleCallWarnTokens===v?"border-primary bg-primary/10 text-primary":"border-border/30 text-muted-foreground hover:border-border/60")}
                    onClick={() => { const next={...aiSettings,singleCallWarnTokens:v}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }}>
                    {v===0?"不预警":v>=10_000?`${v/10_000}万`:`${v/1_000}k`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SCard>

        {/* 预算趋势 */}
        <SCard>
          <SHead title="最近 7 天趋势" sub="日累计粗估 tokens，不上传，帮助感知消耗节奏。" />
          {dailyBudget > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">今日占用</span>
                <span className={cn("font-medium", todayApproxDisplay > dailyBudget ? "text-destructive" : "text-foreground")}>
                  {todayApproxDisplay.toLocaleString()} / {dailyBudget.toLocaleString()} tokens（{Math.round(dailyBudgetPct)}%）
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div className={cn("h-full rounded-full transition-all", todayApproxDisplay>dailyBudget?"bg-destructive":"bg-primary")} style={{width:`${Math.min(100,dailyBudgetPct)}%`}} />
              </div>
            </div>
          )}
          <div className="relative">
            {dailyBudget > 0 && recentDailyMax > 0 && (
              <div className="ai-bar-budget-line" style={{ bottom: `calc(1.4rem + ${Math.min(52, Math.round((dailyBudget / recentDailyMax) * 52))}px)` }} />
            )}
            <div className="grid grid-cols-7 gap-1.5" style={{ alignItems: "end" }}>
              {recentDailyApprox.map((d) => {
                const h = Math.max(2, Math.round((d.tokens / recentDailyMax) * 52));
                const isToday = d.date === recentDailyApprox[recentDailyApprox.length - 1]!.date;
                const isOver = dailyBudget > 0 && d.tokens > dailyBudget;
                return (
                  <div key={d.date} className="flex flex-col gap-1">
                    <div title={`${d.date}：${d.tokens.toLocaleString()} tokens`} className="flex items-end overflow-hidden rounded-md border border-border/30 bg-card/40" style={{ height: 56 }}>
                      <div className="w-full transition-all" style={{ height: h, background: isOver ? "var(--destructive)" : isToday ? "var(--primary)" : "color-mix(in oklab, var(--muted-foreground) 22%, transparent)", opacity: isToday || isOver ? 0.9 : 0.7 }} />
                    </div>
                    <p className="text-center text-[9px] text-muted-foreground/60">{d.date.slice(5)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </SCard>

        {/* 超阈值验证级别 */}
        <SCard>
          <SHead title="超阈值强制验证" sub="高危操作（整卷/多章/批量）发起前的确认方式。" badge={<span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">安全保护</span>} />
          <div className="space-y-2">
            {([
              { value: "off",     label: "关闭",     desc: "不进行任何验证提示" },
              { value: "warn",    label: "仅提示",   desc: "显示消耗预估，用户可选择继续" },
              { value: "confirm", label: "强制确认", desc: "必须通过清单确认才能继续执行" },
            ] as const).map(({ value, label, desc }) => {
              const current = aiSettings.highRiskConfirmMode ?? (aiSettings.highRiskAlwaysConfirm ? "confirm" : "off");
              const active = current === value;
              return (
                <button key={value} type="button"
                  onClick={() => { const next={...aiSettings,highRiskConfirmMode:value,highRiskAlwaysConfirm:value==="confirm"}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }}
                  className={cn("flex w-full items-start gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all",
                    active ? "border-primary bg-primary/5" : "border-border/20 bg-background/10 hover:border-border/40")}>
                  <div className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-border/50")}>
                    {active && <div className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium", active ? "text-primary" : "text-foreground")}>{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  {value === "confirm" && <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">推荐</span>}
                </button>
              );
            })}
          </div>
        </SCard>

        {/* 进阶防误触 */}
        <SCard>
          <SHead title="进阶防误触" sub="额外安全机制，增加操作步骤但有效防止意外消耗。" badge={<span className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground">可选</span>} />
          <div className="space-y-2">
            <SRow iconBg="bg-blue-500" icon={<Keyboard className="h-4 w-4" />} title="数字确认" desc="超阈值时需输入屏幕显示的验证码才能继续执行。">
              <Toggle checked={!!aiSettings.numericConfirm} onChange={(on) => { const next={...aiSettings,numericConfirm:on}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }} />
            </SRow>
            <SRow iconBg="bg-violet-500" icon={<AlertTriangle className="h-4 w-4" />} title="操作冷却" desc="同一高危操作间隔至少 5 秒，防止连续误触。">
              <Toggle checked={!!aiSettings.operationCooldown} onChange={(on) => { const next={...aiSettings,operationCooldown:on}; setAiSettings(next); try{saveAiSettings(next);setMsg("已保存。");}catch{setMsg("保存失败。");} }} />
            </SRow>
          </div>
        </SCard>

        {/* 高级接入 (OwnerModeSection) */}
        <OwnerModeSection currentEmail={currentEmail} />
      </div>
                    );
                  default:
                    return null;
                }
              })()}
            </div>

            {msg && (
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>

      <BackendModelConfigModal
        open={backendOpen}
        settings={aiSettings}
        onChange={setAiSettings}
        onClose={() => setBackendOpen(false)}
        onSave={() => {
          try {
            saveAiSettings(aiSettings);
            setMsg("已保存 AI 设置。");
          } catch {
            setMsg("保存失败。");
          }
        }}
      />
    </div>
  );
}
