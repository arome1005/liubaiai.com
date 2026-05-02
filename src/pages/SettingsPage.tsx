import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  ChevronLeft,
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
import { snapshotAllChaptersInLibrary } from "../db/repo";
import { buildBackupZip, parseBackupZip } from "../storage/backup";
import type { LineEndingMode } from "../util/lineEnding";
import { readFictionCreationAcknowledged } from "../ai/fiction-ack";
import { loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiSettings } from "../ai/types";
import { BackendModelConfigModal } from "../components/BackendModelConfigModal";
import { BackendAdvancedConfigGateDialog } from "../components/settings/BackendAdvancedConfigGateDialog";
import { Button } from "../components/ui/button";
import { useAuthUserState } from "../hooks/useAuthUserState";
import { useBackendAdvancedConfigGate } from "../hooks/useBackendAdvancedConfigGate";
import { persistThemePreference, readThemePreference, type ThemePreference } from "../theme";
import {
  BACKUP_NUDGE_INTERVAL_MS,
  readBackupReminderEnabled,
  readLastBackupExportMs,
  recordBackupExportSuccess,
} from "../util/backup-reminder";
import {
  applyEditorTypographyCssVars,
  dispatchEditorTypographyChanged,
  loadEditorTypography,
  saveEditorTypography,
  type EditorTypographyState,
} from "../util/editor-typography";
import {
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
  readLiuguangQuickCaptureHotkey,
  readZenToggleHotkey,
  type HotkeyCombo,
} from "../util/hotkey-config";
import { NAV_ICON_BG } from "./settings/_shared";
import { SettingsAppearanceSection } from "./settings/SettingsAppearanceSection";
import { SettingsEditorSection } from "./settings/SettingsEditorSection";
import { SettingsExportSection } from "./settings/SettingsExportSection";
import { SettingsPrivacySection } from "./settings/SettingsPrivacySection";
import { SettingsStorageSection } from "./settings/SettingsStorageSection";
import { SettingsBackupSection } from "./settings/SettingsBackupSection";
import { SettingsReferenceSection } from "./settings/SettingsReferenceSection";
import { SettingsFictionSection } from "./settings/SettingsFictionSection";
import { SettingsAiPrivacySection } from "./settings/SettingsAiPrivacySection";

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
    label: "藏经",
    hint: "索引维护",
    description: "藏经索引与自救",
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
  const [accentColor, setAccentColor] = useState<AccentColorId>(() => readAccentColor());
  const [editorExp, setEditorExp] = useState<EditorExperienceState>(() => loadEditorExperience());
  const {
    backendOpen,
    setBackendOpen,
    requestOpenBackend,
    closeBackendGate,
    confirmBackendGate,
    backendGateOpen,
    backendGatePin,
    onBackendGatePinInput,
    backendGateError,
  } = useBackendAdvancedConfigGate();
  const [fictionAck, setFictionAck] = useState(() => readFictionCreationAcknowledged());
  const [backupReminderOn, setBackupReminderOn] = useState(() => readBackupReminderEnabled());
  const [lastBackupExportMs, setLastBackupExportMs] = useState<number | null>(() => readLastBackupExportMs());
  const [activeNav, setActiveNav] = useState<string>(() => navIdFromHash(location.hash));
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
                      <SettingsAppearanceSection
                        theme={theme}
                        setTheme={setTheme}
                        accentColor={accentColor}
                        setAccentColor={setAccentColor}
                        editorExp={editorExp}
                        updateEditorExp={updateEditorExp}
                      />
                    );
                  case "settings-editor":
                    return (
                      <SettingsEditorSection
                        typography={typography}
                        setTypography={setTypography}
                        fontSize={fontSize}
                        setFontSize={setFontSize}
                        editorExp={editorExp}
                        updateEditorExp={updateEditorExp}
                        liuguangHotkey={liuguangHotkey}
                        setLiuguangHotkey={setLiuguangHotkey}
                        hotkeyMsg={hotkeyMsg}
                        setHotkeyMsg={setHotkeyMsg}
                        zenHotkey={zenHotkey}
                        setZenHotkey={setZenHotkey}
                        zenHotkeyMsg={zenHotkeyMsg}
                        setZenHotkeyMsg={setZenHotkeyMsg}
                      />
                    );
                  case "settings-export":
                    return (
                      <SettingsExportSection
                        lineEnding={lineEnding}
                        setLineEnding={setLineEnding}
                      />
                    );
                  case "settings-privacy":
                    return (
                      <SettingsPrivacySection
                        diagnostic={diagnostic}
                        setDiagnostic={setDiagnostic}
                      />
                    );
                  case "settings-storage":
                    return (
                      <SettingsStorageSection
                        storageBytes={storageBytes}
                        storageEstimate={storageEstimate}
                        refreshStorageQuota={refreshStorageQuota}
                      />
                    );
                  case "backup-data":
                    return (
                      <SettingsBackupSection
                        backupNudge={!!backupNudge}
                        lastBackupExportMs={lastBackupExportMs}
                        backupReminderOn={backupReminderOn}
                        setBackupReminderOn={setBackupReminderOn}
                        downloadBackup={downloadBackup}
                        pickRestore={pickRestore}
                      />
                    );
                  case "settings-reference":
                    return (
                      <SettingsReferenceSection
                        refMaintainPct={refMaintainPct}
                        setRefMaintainPct={setRefMaintainPct}
                        refMaintainLabel={refMaintainLabel}
                        setRefMaintainLabel={setRefMaintainLabel}
                        setMsg={setMsg}
                      />
                    );
                  case "fiction-creation":
                    return (
                      <SettingsFictionSection
                        fictionAck={fictionAck}
                        setFictionAck={setFictionAck}
                      />
                    );
                  case "ai-privacy":
                    return (
                      <SettingsAiPrivacySection
                        aiSettings={aiSettings}
                        setAiSettings={setAiSettings}
                        setMsg={setMsg}
                        requestOpenBackend={requestOpenBackend}
                        currentEmail={currentEmail}
                      />
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

      <BackendAdvancedConfigGateDialog
        open={backendGateOpen}
        onDismiss={closeBackendGate}
        pin={backendGatePin}
        onPinInput={onBackendGatePinInput}
        error={backendGateError}
        onConfirm={confirmBackendGate}
      />

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
