import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearAllReferenceLibraryData,
  rebuildAllReferenceSearchIndex,
  snapshotAllChaptersInLibrary,
} from "../db/repo";
import { buildBackupZip, parseBackupZip } from "../storage/backup";
import type { LineEndingMode } from "../util/lineEnding";
import { loadAiSettings, saveAiSettings } from "../ai/storage";
import type { AiProviderId, AiSettings } from "../ai/types";

const FONT_KEY = "liubai:fontSizePx";
const THEME_KEY = "liubai:theme";
const LINE_ENDING_KEY = "liubai:exportLineEnding";
const DIAGNOSTIC_KEY = "liubai:diagnostic";
// AI 配置由 src/ai/storage.ts 管理（localStorage）

function readFontSize(): number {
  const n = Number(localStorage.getItem(FONT_KEY));
  if (!Number.isNaN(n) && n >= 12 && n <= 28) return n;
  return 16;
}

function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
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

export function SettingsPage() {
  const [fontSize, setFontSize] = useState(readFontSize);
  const [theme, setTheme] = useState(readTheme);
  const [lineEnding, setLineEnding] = useState(readLineEnding);
  const [diagnostic, setDiagnostic] = useState(readDiagnostic);
  const [storageEstimate, setStorageEstimate] = useState<string | null>(null);
  const [storageBytes, setStorageBytes] = useState<{ usage: number; quota: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refMaintainPct, setRefMaintainPct] = useState<number | null>(null);
  const [refMaintainLabel, setRefMaintainLabel] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  function refreshStorageQuota() {
    if (!navigator.storage?.estimate) {
      setStorageEstimate("（无法估算）");
      setStorageBytes(null);
      return;
    }
    void navigator.storage.estimate().then((est) => {
      const usage = est.usage ?? 0;
      const quota = est.quota ?? 0;
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
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
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

  return (
    <div className="page settings-page">
      <header className="page-header">
        <Link to="/" className="back-link">
          ← 作品库
        </Link>
        <h1>设置</h1>
      </header>

      <section className="settings-section">
        <h2>外观</h2>
        <label className="row">
          <span>主题</span>
          <select
            name="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value === "dark" ? "dark" : "light")}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
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

      <section className="settings-section">
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

      <section className="settings-section">
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
      </section>

      <section className="settings-section">
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
        <button type="button" className="btn small" onClick={() => refreshStorageQuota()}>
          刷新占用
        </button>
      </section>

      <section className="settings-section">
        <h2>数据</h2>
        <div className="settings-callout" role="alert">
          <strong>重要</strong>
          <p>
            作品与正文<strong>仅保存在本机当前浏览器</strong>的 IndexedDB 中，不会上传到服务器。
            换浏览器、清站点数据、卸载浏览器会<strong>丢失</strong>未备份的内容。
            换电脑或重装前，请务必使用下方「导出备份 zip」并妥善保存文件。
          </p>
        </div>
        <div className="row gap">
          <button type="button" className="btn primary" onClick={() => void downloadBackup()}>
            导出备份（zip）
          </button>
          <button type="button" className="btn" onClick={() => pickRestore("replace")}>
            从备份恢复（覆盖）
          </button>
          <button type="button" className="btn" onClick={() => pickRestore("merge")}>
            合并导入备份
          </button>
        </div>
        <p className="muted small">
          覆盖：清空当前库后写入备份。合并：追加备份中的作品（新 id），不删除当前数据。
        </p>
      </section>

      <section className="settings-section">
        <h2>参考库（自救）</h2>
        <p className="muted small">
          仅作用于<strong>参考库</strong>（导入的原著与摘录），<strong>不会</strong>删除作品正文。若升级后检索异常，可先重建索引；仍异常再考虑清空参考库后重新导入。
        </p>
        <div className="row gap">
          <button
            type="button"
            className="btn"
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
          </button>
          <button
            type="button"
            className="btn danger"
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
          </button>
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

      <section className="settings-section">
        <h2>AI（本机）</h2>
        <p className="muted small">
          当前为浏览器本机存储（localStorage）。直连第三方模型可能遇到 CORS（浏览器限制）；Ollama 默认本机
          `http://localhost:11434` 通常可用。
        </p>
        <label className="row">
          <span>默认提供方</span>
          <select
            name="aiProvider"
            value={aiSettings.provider}
            onChange={(e) => setAiSettings((s) => ({ ...s, provider: e.target.value as AiProviderId }))}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
          </select>
        </label>

        <label className="row row--check">
          <input
            name="aiIncludeBibleDefault"
            type="checkbox"
            checked={aiSettings.includeBible}
            onChange={(e) => setAiSettings((s) => ({ ...s, includeBible: e.target.checked }))}
          />
          <span>默认注入创作圣经</span>
        </label>

        <label className="row">
          <span>上下文上限</span>
          <input
            name="aiMaxContextChars"
            type="number"
            min={4000}
            max={200000}
            value={aiSettings.maxContextChars}
            onChange={(e) => setAiSettings((s) => ({ ...s, maxContextChars: Number(e.target.value) || 24000 }))}
          />
          <span className="muted small">字符</span>
        </label>

        <details className="settings-ai-provider">
          <summary>OpenAI 配置</summary>
          <label className="row">
            <span>Base URL</span>
            <input
              name="openaiBaseUrl"
              value={aiSettings.openai.baseUrl ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, openai: { ...s.openai, baseUrl: e.target.value } }))}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="row">
            <span>Model</span>
            <input
              name="openaiModel"
              value={aiSettings.openai.model}
              onChange={(e) => setAiSettings((s) => ({ ...s, openai: { ...s.openai, model: e.target.value } }))}
            />
          </label>
          <label className="row">
            <span>API Key</span>
            <input
              name="openaiApiKey"
              type="password"
              value={aiSettings.openai.apiKey ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, openai: { ...s.openai, apiKey: e.target.value } }))}
            />
          </label>
        </details>

        <details className="settings-ai-provider">
          <summary>Claude 配置</summary>
          <label className="row">
            <span>Base URL</span>
            <input
              name="anthropicBaseUrl"
              value={aiSettings.anthropic.baseUrl ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, anthropic: { ...s.anthropic, baseUrl: e.target.value } }))}
              placeholder="https://api.anthropic.com"
            />
          </label>
          <label className="row">
            <span>Model</span>
            <input
              name="anthropicModel"
              value={aiSettings.anthropic.model}
              onChange={(e) => setAiSettings((s) => ({ ...s, anthropic: { ...s.anthropic, model: e.target.value } }))}
            />
          </label>
          <label className="row">
            <span>API Key</span>
            <input
              name="anthropicApiKey"
              type="password"
              value={aiSettings.anthropic.apiKey ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, anthropic: { ...s.anthropic, apiKey: e.target.value } }))}
            />
          </label>
        </details>

        <details className="settings-ai-provider">
          <summary>Gemini 配置</summary>
          <label className="row">
            <span>Base URL</span>
            <input
              name="geminiBaseUrl"
              value={aiSettings.gemini.baseUrl ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, gemini: { ...s.gemini, baseUrl: e.target.value } }))}
              placeholder="https://generativelanguage.googleapis.com"
            />
          </label>
          <label className="row">
            <span>Model</span>
            <input
              name="geminiModel"
              value={aiSettings.gemini.model}
              onChange={(e) => setAiSettings((s) => ({ ...s, gemini: { ...s.gemini, model: e.target.value } }))}
            />
          </label>
          <label className="row">
            <span>API Key</span>
            <input
              name="geminiApiKey"
              type="password"
              value={aiSettings.gemini.apiKey ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, gemini: { ...s.gemini, apiKey: e.target.value } }))}
            />
          </label>
        </details>

        <details className="settings-ai-provider">
          <summary>Ollama 配置</summary>
          <label className="row">
            <span>Base URL</span>
            <input
              name="ollamaBaseUrl"
              value={aiSettings.ollama.baseUrl ?? ""}
              onChange={(e) => setAiSettings((s) => ({ ...s, ollama: { ...s.ollama, baseUrl: e.target.value } }))}
              placeholder="http://localhost:11434"
            />
          </label>
          <label className="row">
            <span>Model</span>
            <input
              name="ollamaModel"
              value={aiSettings.ollama.model}
              onChange={(e) => setAiSettings((s) => ({ ...s, ollama: { ...s.ollama, model: e.target.value } }))}
            />
          </label>
          <p className="muted small">Ollama 通常不需要 API Key。</p>
        </details>

        <div className="row gap">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAiMsg(null);
              try {
                saveAiSettings(aiSettings);
                setAiMsg("已保存 AI 设置。");
              } catch {
                setAiMsg("保存失败。");
              }
            }}
          >
            保存 AI 设置
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setAiSettings(loadAiSettings());
              setAiMsg("已从本机重新载入。");
            }}
          >
            重新载入
          </button>
        </div>
        {aiMsg ? <p className="muted small">{aiMsg}</p> : null}
      </section>

      {msg && <p className="settings-msg">{msg}</p>}
    </div>
  );
}
