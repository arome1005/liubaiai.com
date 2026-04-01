import { useMemo, useState } from "react";
import type { AiProviderId, AiProviderConfig, AiSettings } from "../ai/types";

type ProviderTestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "err"; message: string };

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

async function testProviderConnection(args: { provider: AiProviderId; cfg: AiProviderConfig }): Promise<string> {
  const { provider, cfg } = args;
  const baseUrl = (cfg.baseUrl ?? "").trim();

  if (provider === "ollama") {
    const url = joinUrl(baseUrl || "http://localhost:11434", "/api/tags");
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json().catch(() => ({}));
    const n = Array.isArray((raw as any)?.models) ? (raw as any).models.length : 0;
    return n ? `连接成功（发现 ${n} 个本地模型）` : "连接成功";
  }

  const key = (cfg.apiKey ?? "").trim();
  if (!key) throw new Error("请先填写 API Key");

  if (provider === "gemini") {
    const base = baseUrl || "https://generativelanguage.googleapis.com";
    const url = joinUrl(base, `/v1beta/models?key=${encodeURIComponent(key)}`);
    const resp = await fetch(url, { method: "GET" });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((raw as any)?.error?.message ?? `HTTP ${resp.status}`);
    const n = Array.isArray((raw as any)?.models) ? (raw as any).models.length : 0;
    return n ? `连接成功（可用模型 ${n} 个）` : "连接成功";
  }

  if (provider === "anthropic") {
    const url = joinUrl(baseUrl || "https://api.anthropic.com", "/v1/models");
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((raw as any)?.error?.message ?? `HTTP ${resp.status}`);
    const n = Array.isArray((raw as any)?.data) ? (raw as any).data.length : 0;
    return n ? `连接成功（可用模型 ${n} 个）` : "连接成功";
  }

  // openai / doubao (OpenAI-compatible)
  const url = joinUrl(baseUrl || "https://api.openai.com/v1", "/models");
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((raw as any)?.error?.message ?? `HTTP ${resp.status}`);
  const n = Array.isArray((raw as any)?.data) ? (raw as any).data.length : 0;
  return n ? `连接成功（可用模型 ${n} 个）` : "连接成功";
}

function EyeToggle(props: { shown: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn" onClick={props.onToggle} title={props.shown ? "隐藏" : "显示"}>
      {props.label ?? (props.shown ? "🙈" : "👁")}
    </button>
  );
}

export function BackendModelConfigModal(props: {
  open: boolean;
  settings: AiSettings;
  onChange: (next: AiSettings) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { open, settings, onChange } = props;
  const [showKey, setShowKey] = useState<Record<AiProviderId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    doubao: false,
    ollama: false,
  });
  const [testState, setTestState] = useState<Record<AiProviderId, ProviderTestState>>({
    openai: { status: "idle" },
    anthropic: { status: "idle" },
    gemini: { status: "idle" },
    doubao: { status: "idle" },
    ollama: { status: "idle" },
  });

  const providers = useMemo(
    () =>
      [
        { id: "openai" as const, title: "OpenAI（见山）", cfg: settings.openai },
        { id: "anthropic" as const, title: "Claude（听雨）", cfg: settings.anthropic },
        { id: "gemini" as const, title: "Gemini（观云）", cfg: settings.gemini },
        { id: "doubao" as const, title: "豆包（燎原）", cfg: settings.doubao },
        { id: "ollama" as const, title: "Ollama（潜龙）", cfg: settings.ollama },
      ] satisfies Array<{ id: AiProviderId; title: string; cfg: AiProviderConfig }>,
    [settings],
  );

  if (!open) return null;

  return (
    <div
      className="backend-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="高级后端配置"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="backend-modal">
        <div className="backend-modal-head">
          <div>
            <div className="backend-modal-title">高级后端配置</div>
            <div className="muted small">Base URL 与 API Key 仅保存在本机 localStorage。</div>
          </div>
          <button type="button" className="icon-btn" title="关闭" onClick={props.onClose}>
            ×
          </button>
        </div>

        <div className="backend-modal-body">
          {providers.map((p) => {
            const s = testState[p.id];
            const keyShown = showKey[p.id];
            return (
              <section key={p.id} className="backend-provider">
                <div className="backend-provider-head">
                  <div style={{ fontWeight: 800 }}>{p.title}</div>
                  <div className="backend-provider-actions">
                    <button
                      type="button"
                      className="btn small"
                      disabled={s.status === "testing"}
                      onClick={() => {
                        setTestState((prev) => ({ ...prev, [p.id]: { status: "testing" } }));
                        void (async () => {
                          try {
                            const msg = await testProviderConnection({ provider: p.id, cfg: (settings as any)[p.id] });
                            setTestState((prev) => ({ ...prev, [p.id]: { status: "ok", message: msg } }));
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "连接失败";
                            setTestState((prev) => ({ ...prev, [p.id]: { status: "err", message: msg } }));
                          }
                        })();
                      }}
                    >
                      测试连接
                    </button>
                    {s.status === "ok" ? <span className="backend-test backend-test--ok">连接成功</span> : null}
                    {s.status === "err" ? <span className="backend-test backend-test--err">{s.message}</span> : null}
                    {s.status === "testing" ? <span className="backend-test muted small">测试中…</span> : null}
                  </div>
                </div>

                <label className="row">
                  <span>Base URL</span>
                  <input
                    value={(p.cfg.baseUrl ?? "") as string}
                    onChange={(e) => onChange({ ...settings, [p.id]: { ...p.cfg, baseUrl: e.target.value } } as any)}
                    placeholder={
                      p.id === "openai"
                        ? "https://api.openai.com/v1"
                        : p.id === "anthropic"
                          ? "https://api.anthropic.com"
                          : p.id === "gemini"
                            ? "https://generativelanguage.googleapis.com"
                            : p.id === "doubao"
                              ? "https://ark.cn-beijing.volces.com/api/v3"
                              : "http://localhost:11434"
                    }
                  />
                </label>

                <label className="row">
                  <span>API Key</span>
                  <div className="backend-key-row">
                    <input
                      type={keyShown ? "text" : "password"}
                      value={(p.cfg.apiKey ?? "") as string}
                      onChange={(e) => onChange({ ...settings, [p.id]: { ...p.cfg, apiKey: e.target.value } } as any)}
                      placeholder={p.id === "ollama" ? "（Ollama 通常不需要）" : ""}
                      disabled={p.id === "ollama"}
                    />
                    {p.id !== "ollama" ? (
                      <EyeToggle shown={keyShown} onToggle={() => setShowKey((m) => ({ ...m, [p.id]: !m[p.id] }))} />
                    ) : null}
                  </div>
                </label>
              </section>
            );
          })}
        </div>

        <div className="backend-modal-foot">
          <button type="button" className="btn" onClick={props.onSave}>
            保存
          </button>
          <button type="button" className="btn ghost" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

