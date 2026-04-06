import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

const SETTINGS_NAV = [
  { id: "settings-appearance", label: "外观", hint: "主题与显示" },
  { id: "settings-editor", label: "编辑器", hint: "正文字号" },
  { id: "settings-export", label: "导出", hint: "换行符" },
  { id: "settings-privacy", label: "隐私", hint: "诊断与协议" },
  { id: "settings-storage", label: "存储", hint: "浏览器配额" },
  { id: "backup-data", label: "数据", hint: "备份与恢复" },
  { id: "settings-reference", label: "参考库", hint: "索引维护" },
  { id: "fiction-creation", label: "虚构创作", hint: "AI 声明" },
  { id: "ai-privacy", label: "AI 配置", hint: "本机与隐私" },
] as const;

function navIdFromHash(hash: string): string {
  const h = hash.replace(/^#/, "");
  return SETTINGS_NAV.some((n) => n.id === h) ? h : "settings-appearance";
}

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fontSize, setFontSize] = useState(readFontSize);
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

  useEffect(() => {
    const h = location.hash.replace(/^#/, "");
    if (!h || !SETTINGS_NAV.some((n) => n.id === h)) return;
    setActiveNav(h);
    const t = window.setTimeout(() => {
      document.getElementById(h)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  function goSettingsSection(id: string) {
    setActiveNav(id);
    navigate({ pathname: "/settings", hash: id }, { replace: true });
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <div className={cn("page settings-page flex flex-col gap-4")}>
      <header
        className={cn(
          "settings-page-header rounded-xl border border-border/40 bg-card/30 px-4 py-5 sm:px-6",
          "shadow-sm",
        )}
      >
        <div className="settings-page-header-text">
          <Link to="/" className="back-link settings-page-back">
            ← 首页
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">设置</h1>
          <p className="muted small settings-page-sub">外观与编辑器、数据备份、参考库维护、AI 与隐私偏好</p>
        </div>
      </header>

      <div className={cn("settings-shell gap-4 sm:gap-6")}>
        <nav className="settings-side-nav" aria-label="设置分区">
          {SETTINGS_NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={"settings-side-nav-item" + (activeNav === n.id ? " is-active" : "")}
              aria-current={activeNav === n.id ? "true" : undefined}
              onClick={() => goSettingsSection(n.id)}
            >
              <span className="settings-side-nav-label">{n.label}</span>
              <span className="settings-side-nav-hint muted small">{n.hint}</span>
            </button>
          ))}
        </nav>

        <div className="settings-main">
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

      <section id="settings-editor" className="settings-section settings-section-card">
        <h2>编辑器字号</h2>
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
      </section>

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

      <section id="ai-privacy" className="settings-section settings-section-card">
        <h2>AI（本机）</h2>
        <p className="muted small">
          当前为浏览器本机存储（localStorage）。直连第三方模型可能遇到 CORS（浏览器限制）；Ollama 默认本机
          `http://localhost:11434` 通常可用。
        </p>

        <div className="row gap" style={{ marginTop: 8 }}>
          <Button type="button" variant="outline" onClick={() => setBackendOpen(true)}>
            后端模型配置
          </Button>
        </div>
      </section>

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
  );
}
