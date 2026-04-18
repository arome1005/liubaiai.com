import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  ChevronRight,
  Database,
  FileDown,
  Lightbulb,
  Palette,
  PenTool,
  Save,
  Settings,
  Shield,
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
import type { AiSettings } from "../ai/types";
import { BackendModelConfigModal } from "../components/BackendModelConfigModal";
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
    <div
      className={cn(
        "settings-page settings-page-v0 flex w-full max-w-none flex-col",
        "-mx-4 -my-6 lg:-mx-6",
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0",
          "md:min-h-[calc(100dvh-var(--masthead-h)-var(--shell-topbar-h)-3rem)] md:flex-row",
        )}
      >
        <aside
          className={cn(
            "w-full shrink-0 border-border/40 bg-card/30 md:w-64 md:border-r",
            "border-b md:sticky md:top-0 md:self-start md:border-b-0",
            "md:max-h-[calc(100dvh-var(--masthead-h)-var(--shell-topbar-h)-3rem)] md:overflow-y-auto",
          )}
          aria-label="设置分区"
        >
          <div className="p-4">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
              <Settings className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              设置
            </h2>
            <div className="space-y-1">
              {SETTINGS_NAV.map((n) => {
                const Icon = n.icon;
                const isActive = navKey === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => goSettingsSection(n.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.label}</p>
                      <p className="text-xs opacity-60">{n.hint}</p>
                    </div>
                    <ChevronRight
                      className={cn("h-4 w-4 shrink-0 transition-transform", isActive && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-4 border-t border-border/40 pt-4">
              <Link
                to="/"
                className="text-muted-foreground hover:text-foreground text-sm font-medium no-underline transition-colors"
              >
                ← 返回首页
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-3xl p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">{activeMeta.label}</h1>
              <p className="text-muted-foreground">{activeMeta.description}</p>
            </div>
            <div className="settings-main">
              {(() => {
                switch (navKey) {
                  case "settings-appearance":
                    return (
      <section id="settings-appearance" className="settings-section settings-section-card">
        <h2>外观</h2>
        <label className="row">
          <span>主题</span>
          <select
            name="theme"
            value={theme}
            onChange={(e) => {
              const v = e.target.value;
              setTheme(v === "dark" ? "dark" : v === "system" ? "system" : "light");
            }}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">设备</option>
          </select>
        </label>
        <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
          「设备」跟随系统外观（含日出/日落或定时自动深色等）；系统切换后本页会随之更新。
        </p>
      </section>
                    );
                  case "settings-editor":
                    return (
      <section id="settings-editor" className="settings-section settings-section-card">
        <h2>编辑器</h2>
        <h3 className="settings-subheading">字号</h3>
        <label className="row">
          <span>{fontSize}px</span>
          <input
            name="fontSize"
            type="range"
            min={12}
            max={28}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </label>
        <h3 className="settings-subheading">正文字体与行距</h3>
        <label className="row">
          <span>字体</span>
          <select
            name="editorFontFamily"
            value={typography.fontFamily}
            onChange={(e) =>
              setTypography((t) => ({ ...t, fontFamily: e.target.value as EditorFontFamily }))
            }
          >
            <optgroup label="通用">
              <option value="system">系统无衬线</option>
              <option value="mono">等宽</option>
            </optgroup>
            <optgroup label="宋体 / 衬线">
              <option value="serif">思源宋体</option>
              <option value="songti">宋体-简</option>
              <option value="stSong">华文宋体</option>
              <option value="zhongSong">华文中宋</option>
            </optgroup>
            <optgroup label="仿宋 / 楷体">
              <option value="kaiti">楷体</option>
              <option value="stKaiti">华文楷体</option>
              <option value="fangSong">仿宋</option>
              <option value="stFangSong">华文仿宋</option>
            </optgroup>
            <optgroup label="黑体 / 圆体">
              <option value="msYahei">微软雅黑</option>
              <option value="lantingHei">兰亭黑-繁</option>
              <option value="hiragino">冬青黑字体</option>
              <option value="xihei">华文细黑</option>
              <option value="yuanti">圆体-简</option>
            </optgroup>
            <optgroup label="艺术字体">
              <option value="xingkai">华文行楷</option>
              <option value="hannotate">手札体-简</option>
              <option value="wawati">娃娃体-简</option>
              <option value="liti">华文隶书</option>
              <option value="caiyun">华文彩云</option>
            </optgroup>
          </select>
        </label>
        <label className="row">
          <span>行高</span>
          <select
            name="editorLineHeight"
            value={typography.lineHeight}
            onChange={(e) =>
              setTypography((t) => ({ ...t, lineHeight: e.target.value as EditorLineHeightPreset }))
            }
          >
            <option value="1.5">紧凑 1.5</option>
            <option value="1.65">标准 1.65</option>
            <option value="1.8">默认 1.8</option>
            <option value="2">宽松 2</option>
          </select>
        </label>
        <h3 className="settings-subheading">纸面背景（写作页）</h3>
        <label className="row">
          <span>护眼底色</span>
          <select
            name="editorPaperTint"
            value={typography.paperTint}
            onChange={(e) =>
              setTypography((t) => ({ ...t, paperTint: e.target.value as EditorPaperTint }))
            }
          >
            <option value="none">默认（随主题）</option>
            <option value="sepia">暖黄</option>
            <option value="green">淡绿</option>
          </select>
        </label>
        <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
          字体与行高通过 CSS 作用于正文编辑器；纸面色仅覆盖写作页稿纸区域；沉浸写作为浏览器全屏 + 轻微主区样式，不隐藏顶栏与章栏。数据存于本机。
        </p>

        <h3 className="settings-subheading" style={{ marginTop: 18 }}>快捷键</h3>
        <p className="muted small" style={{ marginTop: 6 }}>
          可配置热键修改后立即生效；保存前会检测应用内冲突与常见系统/浏览器保留键。
        </p>

        {/* 流光速记 */}
        <div className="card" style={{ padding: 12, marginTop: 8 }}>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>流光速记</span>
            <span className="muted small">当前：<strong>{hotkeyToLabel(liuguangHotkey)}</strong></span>
          </div>
          <div className="row" style={{ flexWrap: "wrap" as const, gap: 12, marginTop: 10 }}>
            {(["alt", "shift", "ctrl", "meta"] as const).map((mod) => (
              <label key={mod} className="row row--check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={liuguangHotkey[mod]}
                  onChange={(e) => setLiuguangHotkey((h) => ({ ...h, [mod]: e.target.checked }))}
                />
                <span>{{ alt: "Alt/⌥", shift: "Shift/⇧", ctrl: "Ctrl", meta: "⌘/Meta" }[mod]}</span>
              </label>
            ))}
            <label className="row" style={{ margin: 0, gap: 6 }}>
              <span>+</span>
              <select
                value={liuguangHotkey.code}
                onChange={(e) => setLiuguangHotkey((h) => ({ ...h, code: e.target.value }))}
              >
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => (
                  <option key={ch} value={`Key${ch}`}>{ch}</option>
                ))}
                {"0123456789".split("").map((d) => (
                  <option key={d} value={`Digit${d}`}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          {(() => {
            const sys = detectHotkeyConflicts(liuguangHotkey);
            const cross = hotkeyConflictWith(liuguangHotkey, [{ id: "zenToggle", label: "沉浸写作", combo: zenHotkey }]);
            const all = [...sys, ...(cross ? [{ level: "error" as const, message: `与应用内快捷键冲突：${cross}` }] : [])];
            return all.length ? (
              <div style={{ marginTop: 8 }}>
                {all.map((c, i) => (
                  <p key={i} className="muted small" style={{ color: c.level === "error" ? "#b91c1c" : "#92400e", margin: "2px 0" }}>
                    {c.level === "error" ? "冲突：" : "提示："}{c.message}
                  </p>
                ))}
              </div>
            ) : null;
          })()}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              setHotkeyMsg(null);
              const d = defaultLiuguangQuickCaptureHotkey();
              setLiuguangHotkey(d);
              writeLiuguangQuickCaptureHotkey(d);
            }}>恢复默认</Button>
            <Button type="button" size="sm" onClick={() => {
              setHotkeyMsg(null);
              const r = writeLiuguangQuickCaptureHotkey(liuguangHotkey);
              setHotkeyMsg(r.ok ? "已保存。" : r.error);
            }}>保存</Button>
            {hotkeyMsg ? <span className="muted small" style={{ alignSelf: "center" }}>{hotkeyMsg}</span> : null}
          </div>
        </div>

        {/* 沉浸写作 */}
        <div className="card" style={{ padding: 12, marginTop: 8 }}>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>沉浸写作</span>
            <span className="muted small">当前：<strong>{hotkeyToLabel(zenHotkey)}</strong></span>
          </div>
          <div className="row" style={{ flexWrap: "wrap" as const, gap: 12, marginTop: 10 }}>
            {(["alt", "shift", "ctrl", "meta"] as const).map((mod) => (
              <label key={mod} className="row row--check" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={zenHotkey[mod]}
                  onChange={(e) => setZenHotkey((h) => ({ ...h, [mod]: e.target.checked }))}
                />
                <span>{{ alt: "Alt/⌥", shift: "Shift/⇧", ctrl: "Ctrl", meta: "⌘/Meta" }[mod]}</span>
              </label>
            ))}
            <label className="row" style={{ margin: 0, gap: 6 }}>
              <span>+</span>
              <select
                value={zenHotkey.code}
                onChange={(e) => setZenHotkey((h) => ({ ...h, code: e.target.value }))}
              >
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => (
                  <option key={ch} value={`Key${ch}`}>{ch}</option>
                ))}
                {"0123456789".split("").map((d) => (
                  <option key={d} value={`Digit${d}`}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          {(() => {
            const sys = detectHotkeyConflicts(zenHotkey);
            const cross = hotkeyConflictWith(zenHotkey, [{ id: "liuguangQuickCapture", label: "流光速记", combo: liuguangHotkey }]);
            const all = [...sys, ...(cross ? [{ level: "error" as const, message: `与应用内快捷键冲突：${cross}` }] : [])];
            return all.length ? (
              <div style={{ marginTop: 8 }}>
                {all.map((c, i) => (
                  <p key={i} className="muted small" style={{ color: c.level === "error" ? "#b91c1c" : "#92400e", margin: "2px 0" }}>
                    {c.level === "error" ? "冲突：" : "提示："}{c.message}
                  </p>
                ))}
              </div>
            ) : null;
          })()}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              setZenHotkeyMsg(null);
              const d = defaultZenToggleHotkey();
              setZenHotkey(d);
              writeZenToggleHotkey(d);
            }}>恢复默认</Button>
            <Button type="button" size="sm" onClick={() => {
              setZenHotkeyMsg(null);
              const r = writeZenToggleHotkey(zenHotkey);
              setZenHotkeyMsg(r.ok ? "已保存。" : r.error);
            }}>保存</Button>
            {zenHotkeyMsg ? <span className="muted small" style={{ alignSelf: "center" }}>{zenHotkeyMsg}</span> : null}
          </div>
        </div>

        {/* 固定快捷键（只读参考） */}
        <div className="card" style={{ padding: 12, marginTop: 8 }}>
          <p className="muted small" style={{ marginBottom: 8 }}>以下快捷键为系统固定，不可修改：</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {[
                { label: "全局命令面板", key: "Mod+K" },
                { label: "写作页保存/快照", key: "Mod+S" },
              ].map(({ label, key }) => (
                <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", color: "var(--muted-foreground)" }}>{label}</td>
                  <td style={{ padding: "6px 0", textAlign: "right" }}>
                    <kbd style={{ background: "var(--secondary)", borderRadius: 4, padding: "1px 6px", fontSize: 12 }}>{key}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ marginTop: 6 }}>Mod = Mac 上为 ⌘，其余为 Ctrl。</p>
        </div>
      </section>
                    );
                  case "settings-export":
                    return (
      <section id="settings-export" className="settings-section settings-section-card">
        <h2>导出换行</h2>
        <p className="muted small">纯文本与 Markdown 导出时使用。</p>
        <label className="row">
          <span>换行符</span>
          <select
            name="exportLineEnding"
            value={lineEnding}
            onChange={(e) => setLineEnding(e.target.value === "crlf" ? "crlf" : "lf")}
          >
            <option value="lf">LF（Unix / macOS）</option>
            <option value="crlf">CRLF（Windows）</option>
          </select>
        </label>
      </section>
                    );
                  case "settings-privacy":
                    return (
      <section id="settings-privacy" className="settings-section settings-section-card">
        <h2>隐私与诊断</h2>
        <label className="row row--check">
          <input
            name="diagnosticMode"
            type="checkbox"
            checked={diagnostic}
            onChange={(e) => setDiagnostic(e.target.checked)}
          />
          <span>诊断模式（开启后错误边界可在控制台输出更完整堆栈；默认关闭）</span>
        </label>
        <p className="muted small" style={{ marginTop: 8 }}>
          <Link to="/privacy">查看隐私政策</Link> · <Link to="/terms">查看用户协议</Link>
        </p>
      </section>
                    );
                  case "settings-storage":
                    return (
      <section id="settings-storage" className="settings-section settings-section-card">
        <h2>存储配额（IndexedDB）</h2>
        <p className="muted small">
          浏览器为当前站点分配的上限；接近或占满时可能无法保存，请导出备份并考虑清理章节历史。
        </p>
        {storageBytes && storageBytes.quota > 0 ? (
          <div
            className={`storage-quota-bar-wrap${storageBytes.usage / storageBytes.quota > 0.8 ? " storage-quota-bar-wrap--warn" : ""}`}
          >
            <div className="storage-quota-label">
              <strong>
                已用 {((storageBytes.usage / storageBytes.quota) * 100).toFixed(0)}%
              </strong>
              <span className="muted small">
                {storageEstimate}
              </span>
            </div>
            <div className="storage-quota-track" aria-hidden>
              <div
                className="storage-quota-fill"
                style={{
                  width: `${Math.min(100, (storageBytes.usage / storageBytes.quota) * 100)}%`,
                }}
              />
            </div>
            {storageBytes.usage / storageBytes.quota > 0.8 ? (
              <p className="storage-quota-warn">已使用超过 80%，建议尽快导出备份或清理章节快照。</p>
            ) : null}
          </div>
        ) : (
          <p className="muted small">{storageEstimate ?? "…"}</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => refreshStorageQuota()}>
          刷新占用
        </Button>
      </section>
                    );
                  case "backup-data":
                    return (
      <section id="backup-data" className="settings-section settings-section-card">
        <h2>数据</h2>
        <label className="row row--check" style={{ marginBottom: 10 }}>
          <input
            name="backupReminder"
            type="checkbox"
            checked={backupReminderOn}
            onChange={(e) => {
              const on = e.target.checked;
              setBackupReminderOn(on);
              writeBackupReminderEnabled(on);
            }}
          />
          <span className="muted small">开启备份周期提醒（约 30 天未记录导出时在本页提示）</span>
        </label>
        {backupNudge ? (
          <div className="settings-backup-nudge" role="status">
            <strong className="small" style={{ display: "block", marginBottom: 4 }}>
              备份提醒
            </strong>
            <span className="muted small">{formatBackupNudgeDetail(Date.now(), lastBackupExportMs)}</span>
          </div>
        ) : null}
        <div className="settings-callout" role="alert">
          <strong>重要</strong>
          <p>
            作品与正文<strong>仅保存在本机当前浏览器</strong>的 IndexedDB 中，不会上传到服务器。
            换浏览器、清站点数据、卸载浏览器会<strong>丢失</strong>未备份的内容。
            换电脑或重装前，请务必使用下方「导出备份 zip」并妥善保存文件。
          </p>
        </div>
        <div className="row gap">
          <Button type="button" variant="default" onClick={() => void downloadBackup()}>
            导出备份（zip）
          </Button>
          <Button type="button" variant="outline" onClick={() => pickRestore("replace")}>
            从备份恢复（覆盖）
          </Button>
          <Button type="button" variant="outline" onClick={() => pickRestore("merge")}>
            合并导入备份
          </Button>
        </div>
        <p className="muted small">
          覆盖：清空当前库后写入备份。合并：追加备份中的作品（新 id），不删除当前数据。
        </p>
        <p className="muted small">发布前自检可参考：`docs/发布检查清单.md`</p>
      </section>
                    );
                  case "settings-reference":
                    return (
      <section id="settings-reference" className="settings-section settings-section-card">
        <h2>参考库（自救）</h2>
        <p className="muted small">
          仅作用于<strong>参考库</strong>（导入的原著与摘录），<strong>不会</strong>删除作品正文。若升级后检索异常，可先重建索引；仍异常再考虑清空参考库后重新导入。
        </p>
        <div className="row gap">
          <Button
            type="button"
            variant="outline"
            disabled={refMaintainPct !== null}
            onClick={() => {
              void (async () => {
                setRefMaintainPct(0);
                setRefMaintainLabel("准备…");
                try {
                  await rebuildAllReferenceSearchIndex((p) => {
                    setRefMaintainPct(p.percent);
                    setRefMaintainLabel(p.label ?? "");
                  });
                  setMsg("参考库索引已重建。");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "重建失败");
                } finally {
                  setRefMaintainPct(null);
                  setRefMaintainLabel(null);
                }
              })();
            }}
          >
            重建参考库索引
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={refMaintainPct !== null}
            onClick={() => {
              if (
                !window.confirm(
                  "将清空全部参考库数据（原著、索引、摘录），不影响作品正文。不可撤销。确定？",
                )
              ) {
                return;
              }
              void (async () => {
                try {
                  await clearAllReferenceLibraryData();
                  setMsg("已清空参考库。");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "清空失败");
                }
              })();
            }}
          >
            清空参考库
          </Button>
        </div>
        {refMaintainPct !== null ? (
          <div className="settings-ref-progress">
            <div className="reference-heavy-bar" role="progressbar">
              <div
                className="reference-heavy-bar-fill"
                style={{ width: `${Math.min(100, refMaintainPct)}%` }}
              />
            </div>
            <p className="muted small">{refMaintainLabel ?? ""}</p>
          </div>
        ) : null}
      </section>
                    );
                  case "fiction-creation":
                    return (
      <section id="fiction-creation" className="settings-section settings-section-card">
        <h2>虚构创作与 AI</h2>
        <p className="muted small">
          本工具用于小说等<strong>虚构创作</strong>辅助。请勿将生成内容用于违法用途、现实伤害、冒充身份等。使用云端模型时，发送内容需符合各提供方政策。
        </p>
        <p className="muted small" style={{ marginTop: 8 }}>
          <Link to="/terms">用户协议</Link> · <Link to="/privacy">隐私政策</Link>
        </p>
        <label className="row row--check" style={{ marginTop: 12 }}>
          <input
            name="fictionCreationAck"
            type="checkbox"
            checked={fictionAck}
            onChange={(e) => {
              const on = e.target.checked;
              setFictionAck(on);
              writeFictionCreationAcknowledged(on);
            }}
          />
          <span>
            我已阅读并理解上述说明（可选记录、便于留痕）。<strong>首次</strong>在任意入口使用 AI 生成前会有一次弹窗确认；与本勾选无关。未勾选本项<strong>不会</strong>额外禁止生成。
          </span>
        </label>
      </section>
                    );
                  case "ai-privacy":
                    return (
      <section id="ai-privacy" className="settings-section settings-section-card">
        <h2>AI（本机）</h2>
        <p className="muted small">
          当前为浏览器本机存储（localStorage）。直连第三方模型可能遇到 CORS（浏览器限制）；Ollama 默认本机
          `http://localhost:11434` 通常可用。
        </p>

        <div className="settings-ai-usage" role="region" aria-label="AI 粗估用量">
          <h3 className="settings-ai-usage-title">AI · 粗估 token（本地）</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            与写作页右侧 AI 面板「本会话」统计同源；按请求与输出<strong>粗算</strong>，非厂商计费、
            <strong>不会上传</strong>。详见
            <Link to="/privacy">隐私政策</Link> 中云端 AI 与提示词相关说明。
          </p>
          <ul className="settings-ai-usage-list muted small" style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
            <li>
              本会话（当前标签页）：约{" "}
              <strong>{sessionApproxDisplay.toLocaleString()}</strong> tokens
            </li>
            <li>
              今日累计（本机）：约 <strong>{todayApproxDisplay.toLocaleString()}</strong> tokens
            </li>
            <li>
              本机累计（此浏览器）：约{" "}
              <strong>{lifetimeApproxDisplay.toLocaleString()}</strong> tokens
            </li>
          </ul>
          <p className="muted small" style={{ marginTop: 6, fontSize: "0.72rem" }}>
            刷新：切换回页签或等待数秒。关闭标签页后「本会话」清零；「本机累计」保留直至清除站点数据或手动清零。
          </p>
          <div className="row gap" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetSessionApproxTokens();
                setSidepanelUsageTick((n) => n + 1);
              }}
            >
              清零本会话累计
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetTodayApproxTokens();
                setSidepanelUsageTick((n) => n + 1);
              }}
            >
              清零今日累计
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  !window.confirm(
                    "将清零「本机累计」粗估 tokens（仅本机显示，不影响作品数据）。确定？",
                  )
                ) {
                  return;
                }
                resetLifetimeApproxTokens();
                setSidepanelUsageTick((n) => n + 1);
              }}
            >
              清零本机累计
            </Button>
          </div>
        </div>

        <div className="row gap" style={{ marginTop: 8 }}>
          <Button type="button" variant="outline" onClick={() => setBackendOpen(true)}>
            后端模型配置
          </Button>
        </div>

        {/* P1-04：成本预算 */}
        <div className="settings-ai-usage" role="region" aria-label="成本预算" style={{ marginTop: 14 }}>
          <h3 className="settings-ai-usage-title">成本预算 · 门控阈值</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            以粗估 token 数为单位设置预警阈值。超出后在写作侧栏弹出确认弹窗（可强行继续，非硬性拦截）。数值仅本机记录，不上传。
          </p>

          <label className="settings-label" style={{ display: "block", marginTop: 12 }}>
            <span className="small" style={{ display: "block", marginBottom: 4 }}>
              日预算（tokens）<span className="muted small" style={{ marginLeft: 6 }}>0 = 不限制</span>
            </span>
            <input
              type="number"
              className="input"
              min={0}
              max={10_000_000}
              step={10_000}
              value={aiSettings.dailyTokenBudget}
              style={{ width: 160 }}
              onChange={(e) => {
                const v = Math.max(0, Math.min(10_000_000, Math.floor(Number(e.target.value) || 0)));
                const next = { ...aiSettings, dailyTokenBudget: v };
                setAiSettings(next);
                try { saveAiSettings(next); setMsg("已保存 AI 设置。"); } catch { setMsg("保存失败。"); }
              }}
            />
          </label>

          <label className="settings-label" style={{ display: "block", marginTop: 10 }}>
            <span className="small" style={{ display: "block", marginBottom: 4 }}>
              单次调用预警（tokens）<span className="muted small" style={{ marginLeft: 6 }}>0 = 不预警</span>
            </span>
            <input
              type="number"
              className="input"
              min={0}
              max={500_000}
              step={1_000}
              value={aiSettings.singleCallWarnTokens}
              style={{ width: 160 }}
              onChange={(e) => {
                const v = Math.max(0, Math.min(500_000, Math.floor(Number(e.target.value) || 0)));
                const next = { ...aiSettings, singleCallWarnTokens: v };
                setAiSettings(next);
                try { saveAiSettings(next); setMsg("已保存 AI 设置。"); } catch { setMsg("保存失败。"); }
              }}
            />
          </label>

          <p className="muted small" style={{ marginTop: 8, fontSize: "0.74rem" }}>
            写作侧栏底部始终显示「今日已用 N tokens」，方便实时感知消耗。
            粗估仅供参考，非厂商计费凭证。
          </p>
        </div>

        {/* P2-1：预算预警 + 趋势统计（轻量可视化） */}
        <div className="settings-ai-usage" role="region" aria-label="预算与趋势" style={{ marginTop: 14 }}>
          <h3 className="settings-ai-usage-title">预算与趋势（最近 7 天）</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            基于「日累计粗估 tokens」的本机统计，不上传。用于帮助你感知消耗与预算压力。
          </p>

          <div style={{ marginTop: 10 }}>
            <div className="muted small">
              今日占用：{" "}
              {dailyBudget > 0 ? (
                <>
                  <strong style={{ color: todayApproxDisplay > dailyBudget ? "var(--destructive)" : undefined }}>
                    {todayApproxDisplay.toLocaleString()}
                  </strong>{" "}
                  / {dailyBudget.toLocaleString()} tokens（约 {Math.round(dailyBudgetPct)}%）
                </>
              ) : (
                <>
                  <strong>{todayApproxDisplay.toLocaleString()}</strong> tokens（未设置日预算）
                </>
              )}
            </div>
            {dailyBudget > 0 ? (
              <div
                className="reference-heavy-bar"
                role="progressbar"
                aria-valuenow={Math.min(100, Math.round(dailyBudgetPct))}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{ marginTop: 6 }}
              >
                <div
                  className="reference-heavy-bar-fill"
                  style={{
                    width: `${Math.min(100, dailyBudgetPct)}%`,
                    background: todayApproxDisplay > dailyBudget ? "var(--destructive)" : undefined,
                  }}
                />
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              最近 7 天（日累计）
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, alignItems: "end" }}>
              {recentDailyApprox.map((d) => {
                const h = Math.max(2, Math.round((d.tokens / recentDailyMax) * 52));
                const isToday = d.date === recentDailyApprox[recentDailyApprox.length - 1]!.date;
                return (
                  <div key={d.date} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      title={`${d.date}：${d.tokens.toLocaleString()} tokens`}
                      style={{
                        height: 56,
                        borderRadius: 8,
                        border: "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
                        background: "color-mix(in oklab, var(--card) 55%, transparent)",
                        display: "flex",
                        alignItems: "flex-end",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: h,
                          width: "100%",
                          background: isToday ? "var(--primary)" : "color-mix(in oklab, var(--muted-foreground) 22%, transparent)",
                          opacity: isToday ? 0.9 : 0.8,
                        }}
                      />
                    </div>
                    <div className="muted small" style={{ fontSize: "0.68rem", textAlign: "center" }}>
                      {d.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="settings-ai-usage" role="region" aria-label="高危操作始终确认" style={{ marginTop: 14 }}>
          <h3 className="settings-ai-usage-title">高危操作 · 始终确认（步 48）</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            用于整卷/多章/批量类操作（如全书语义扫描、流光五段扩容等）。开启后，这些操作会在发起前弹出"清单 + 数字确认"，避免误触与高额消耗。
          </p>
          <label className="row row--check" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={aiSettings.highRiskAlwaysConfirm}
              onChange={(e) => {
                const on = e.target.checked;
                const next = { ...aiSettings, highRiskAlwaysConfirm: on };
                setAiSettings(next);
                try {
                  saveAiSettings(next);
                  setMsg("已保存 AI 设置。");
                } catch {
                  setMsg("保存失败。");
                }
              }}
            />
            <span>高危操作始终确认（建议开启）</span>
          </label>
        </div>
      </section>
                    );
                  default:
                    return null;
                }
              })()}

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

      {msg ? <p className="settings-msg settings-section-card">{msg}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
