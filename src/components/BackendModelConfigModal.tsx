import { useMemo, useState } from "react";
import type { AiProviderId, AiProviderConfig, AiSettings } from "../ai/types";

type ProviderTestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "err"; message: string };

type NavId = "privacy" | "defaults" | AiProviderId;

type GeminiModelVerdict = "ok" | "err";
type GeminiModelHealth = Record<string, { verdict: GeminiModelVerdict; testedAt: number }>;

const GEMINI_HEALTH_KEY = "liubai:geminiModelHealth";

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

function loadGeminiModelHealth(): GeminiModelHealth {
  try {
    const raw = localStorage.getItem(GEMINI_HEALTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GeminiModelHealth;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveGeminiModelHealth(next: GeminiModelHealth) {
  try {
    localStorage.setItem(GEMINI_HEALTH_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function getCfg(s: AiSettings, id: AiProviderId): AiProviderConfig {
  if (id === "openai") return s.openai;
  if (id === "anthropic") return s.anthropic;
  if (id === "gemini") return s.gemini;
  if (id === "doubao") return s.doubao;
  return s.ollama;
}

function setCfg(s: AiSettings, id: AiProviderId, patch: Partial<AiProviderConfig>): AiSettings {
  const cur = getCfg(s, id);
  const next = { ...cur, ...patch };
  if (id === "openai") return { ...s, openai: next };
  if (id === "anthropic") return { ...s, anthropic: next };
  if (id === "gemini") return { ...s, gemini: next };
  if (id === "doubao") return { ...s, doubao: next };
  return { ...s, ollama: next };
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

async function testGeminiModel(args: { cfg: AiProviderConfig }): Promise<string> {
  const baseUrl = (args.cfg.baseUrl ?? "").trim() || "https://generativelanguage.googleapis.com";
  const key = (args.cfg.apiKey ?? "").trim();
  if (!key) throw new Error("请先填写 API Key");
  const model = (args.cfg.model ?? "").trim();
  if (!model) throw new Error("请先选择/填写 Model");
  const url = joinUrl(
    baseUrl,
    `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
  );
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((raw as any)?.error?.message ?? `HTTP ${resp.status}`);
  const text =
    (raw as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("")?.trim() ?? "";
  return text ? "连接成功（该模型可用）" : "连接成功（该模型可用）";
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
  const [nav, setNav] = useState<NavId>("privacy");
  const [geminiHealth, setGeminiHealth] = useState<GeminiModelHealth>(() => loadGeminiModelHealth());
  const [geminiHealthDirty, setGeminiHealthDirty] = useState(false);
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

  const providers = useMemo(() => {
    return [
      { id: "openai" as const, label: "见山", title: "OpenAI（见山）" },
      { id: "anthropic" as const, label: "听雨", title: "Claude（听雨）" },
      { id: "gemini" as const, label: "观云", title: "Gemini（观云）" },
      { id: "doubao" as const, label: "燎原", title: "豆包（燎原）" },
      { id: "ollama" as const, label: "潜龙", title: "Ollama（潜龙）" },
    ] satisfies Array<{ id: AiProviderId; label: string; title: string }>;
  }, []);

  const geminiPresetModels = useMemo(
    () => ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"],
    [],
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
            <div className="muted small">保存在本机 localStorage；纯前端直连可能遇到 CORS。</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                // Persist model-version test results only when user saves.
                if (geminiHealthDirty) {
                  saveGeminiModelHealth(geminiHealth);
                  setGeminiHealthDirty(false);
                }
                props.onSave();
              }}
            >
              保存
            </button>
            <button type="button" className="btn ghost" onClick={props.onClose}>
              关闭
            </button>
          </div>
        </div>

        <div className="backend-modal-layout">
          <aside className="backend-nav" aria-label="高级后端配置导航">
            <button
              type="button"
              className={"backend-nav-item" + (nav === "privacy" ? " active" : "")}
              onClick={() => setNav("privacy")}
            >
              <span className="backend-nav-title">隐私与上传</span>
              <span className="backend-nav-sub muted small">云端调用范围</span>
            </button>
            <button
              type="button"
              className={"backend-nav-item" + (nav === "defaults" ? " active" : "")}
              onClick={() => setNav("defaults")}
            >
              <span className="backend-nav-title">默认与上下文</span>
              <span className="backend-nav-sub muted small">默认提供方 / 上限</span>
            </button>

            <div className="backend-nav-sep" aria-hidden />

            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={"backend-nav-item" + (nav === p.id ? " active" : "")}
                onClick={() => setNav(p.id)}
              >
                <span className="backend-nav-title">{p.label}</span>
                <span className="backend-nav-sub muted small">{p.id}</span>
              </button>
            ))}
          </aside>

          <main className="backend-main" aria-label="高级后端配置内容">
            {nav === "privacy" ? (
              <section className="backend-panel">
                <h3 style={{ margin: 0 }}>AI 隐私与上传范围</h3>
                <p className="muted small" style={{ marginTop: 6 }}>
                  只要你点击「生成」，本次提示词会发送到你选择的提供方。选择 OpenAI / Claude / Gemini / 豆包 即代表会通过网络发送内容到第三方服务。
                </p>

                <label className="row row--check" style={{ marginTop: 10 }}>
                  <input
                    name="aiPrivacyConsentAccepted"
                    type="checkbox"
                    checked={settings.privacy.consentAccepted}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        privacy: {
                          ...settings.privacy,
                          consentAccepted: e.target.checked,
                          consentAcceptedAt: e.target.checked ? Date.now() : undefined,
                        },
                      })
                    }
                  />
                  <span>我已阅读并理解：使用云端模型会上传提示词内容</span>
                </label>

                <label className="row row--check">
                  <input
                    name="aiPrivacyAllowCloudProviders"
                    type="checkbox"
                    checked={settings.privacy.allowCloudProviders}
                    onChange={(e) => onChange({ ...settings, privacy: { ...settings.privacy, allowCloudProviders: e.target.checked } })}
                  />
                  <span>允许使用云端提供方（OpenAI / Claude / Gemini / 豆包）</span>
                </label>

                <details className="backend-details" style={{ marginTop: 10 }}>
                  <summary>上传范围（仅对云端提供方生效）</summary>
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {(
                      [
                        ["allowMetadata", "作品名 / 章节名等元数据"],
                        ["allowChapterContent", "当前章正文（全文或截断）"],
                        ["allowSelection", "当前选区"],
                        ["allowRecentSummaries", "最近章节概要"],
                        ["allowBible", "创作圣经（导出 Markdown）"],
                        ["allowLinkedExcerpts", "本章关联摘录（参考库）"],
                        ["allowRagSnippets", "参考库检索片段（RAG 注入）"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className="row row--check">
                        <input
                          type="checkbox"
                          checked={(settings.privacy as any)[k] as boolean}
                          onChange={(e) => onChange({ ...settings, privacy: { ...(settings.privacy as any), [k]: e.target.checked } })}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="muted small" style={{ marginTop: 10 }}>
                    说明：这些开关只控制“是否把对应内容拼进 prompt”。即使关闭，也不影响你在本地查看/编辑这些内容。
                  </p>
                </details>
              </section>
            ) : null}

            {nav === "defaults" ? (
              <section className="backend-panel">
                <h3 style={{ margin: 0 }}>默认与上下文</h3>
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <label className="row">
                    <span>默认提供方</span>
                    <select
                      name="aiProvider"
                      value={settings.provider}
                      onChange={(e) => onChange({ ...settings, provider: e.target.value as AiProviderId })}
                    >
                      <option value="openai">见山</option>
                      <option value="anthropic">听雨</option>
                      <option value="gemini">观云</option>
                      <option value="doubao">燎原</option>
                      <option value="ollama">潜龙</option>
                    </select>
                  </label>

                  <label className="row row--check">
                    <input
                      name="aiIncludeBibleDefault"
                      type="checkbox"
                      checked={settings.includeBible}
                      onChange={(e) => onChange({ ...settings, includeBible: e.target.checked })}
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
                      value={settings.maxContextChars}
                      onChange={(e) => onChange({ ...settings, maxContextChars: Number(e.target.value) || 24000 })}
                    />
                    <span className="muted small">字符</span>
                  </label>
                </div>
              </section>
            ) : null}

            {providers.some((p) => p.id === nav) ? (
              (() => {
                const id = nav as AiProviderId;
                const cfg = getCfg(settings, id);
                const s = testState[id];
                const keyShown = showKey[id];
                return (
                  <section className="backend-panel">
                    <div className="backend-panel-head">
                      <div>
                        <h3 style={{ margin: 0 }}>{providers.find((p) => p.id === id)?.title ?? id}</h3>
                        <div className="muted small" style={{ marginTop: 4 }}>
                          {id === "ollama" ? "本机模型（默认不需要 API Key）" : "云端模型（需 API Key；可能遇到 CORS）"}
                        </div>
                      </div>
                      <div className="backend-provider-actions">
                        <button
                          type="button"
                          className="btn small"
                          disabled={s.status === "testing"}
                          onClick={() => {
                            setTestState((prev) => ({ ...prev, [id]: { status: "testing" } }));
                            void (async () => {
                              try {
                                const msg = await testProviderConnection({ provider: id, cfg });
                                setTestState((prev) => ({ ...prev, [id]: { status: "ok", message: msg } }));
                              } catch (e) {
                                const msg = e instanceof Error ? e.message : "连接失败";
                                setTestState((prev) => ({ ...prev, [id]: { status: "err", message: msg } }));
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

                    <div className="backend-form">
                      <label className="backend-field">
                        <div className="backend-label muted small">Base URL</div>
                        <input
                          value={cfg.baseUrl ?? ""}
                          onChange={(e) => onChange(setCfg(settings, id, { baseUrl: e.target.value }))}
                          placeholder={
                            id === "openai"
                              ? "https://api.openai.com/v1"
                              : id === "anthropic"
                                ? "https://api.anthropic.com"
                                : id === "gemini"
                                  ? "https://generativelanguage.googleapis.com"
                                  : id === "doubao"
                                    ? "https://ark.cn-beijing.volces.com/api/v3"
                                    : "http://localhost:11434"
                          }
                        />
                      </label>

                      <label className="backend-field">
                        <div className="backend-label muted small">API Key</div>
                        <div className="backend-key-row">
                          <input
                            type={keyShown ? "text" : "password"}
                            value={cfg.apiKey ?? ""}
                            onChange={(e) => onChange(setCfg(settings, id, { apiKey: e.target.value }))}
                            placeholder={id === "ollama" ? "（Ollama 通常不需要）" : ""}
                            disabled={id === "ollama"}
                          />
                          {id !== "ollama" ? (
                            <EyeToggle
                              shown={keyShown}
                              onToggle={() => setShowKey((m) => ({ ...m, [id]: !m[id] }))}
                              label={keyShown ? "🙈" : "👁"}
                            />
                          ) : null}
                        </div>
                      </label>

                      <label className="backend-field">
                        <div className="backend-label muted small">Model</div>
                        {id === "gemini" ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <select
                              value={cfg.model}
                              onChange={(e) => onChange(setCfg(settings, id, { model: e.target.value }))}
                            >
                              {geminiPresetModels.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                              <option value={cfg.model}>{cfg.model}</option>
                            </select>
                            <div className="backend-provider-actions">
                              <button
                                type="button"
                                className="btn small"
                                onClick={() => {
                                  setTestState((prev) => ({ ...prev, gemini: { status: "testing" } }));
                                  void (async () => {
                                    try {
                                      const msg = await testGeminiModel({ cfg: getCfg(settings, "gemini") });
                                      setTestState((prev) => ({ ...prev, gemini: { status: "ok", message: msg } }));
                                      setGeminiHealth((h) => ({
                                        ...h,
                                        [getCfg(settings, "gemini").model]: { verdict: "ok", testedAt: Date.now() },
                                      }));
                                      setGeminiHealthDirty(true);
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "连接失败";
                                      setTestState((prev) => ({ ...prev, gemini: { status: "err", message: msg } }));
                                      setGeminiHealth((h) => ({
                                        ...h,
                                        [getCfg(settings, "gemini").model]: { verdict: "err", testedAt: Date.now() },
                                      }));
                                      setGeminiHealthDirty(true);
                                    }
                                  })();
                                }}
                              >
                                测试该模型版本
                              </button>
                              {testState.gemini.status === "ok" ? (
                                <span className="backend-test backend-test--ok">可用</span>
                              ) : null}
                            </div>
                            <p className="muted small">
                              你也可以手动输入其它模型字符串（直接粘贴覆盖上方下拉所选值）。
                            </p>
                            <input
                              value={cfg.model}
                              onChange={(e) => onChange(setCfg(settings, id, { model: e.target.value }))}
                              placeholder="例如：gemini-3.1-pro-preview"
                            />

                            <div className="backend-health">
                              <div className="backend-health-head">
                                <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                <div className="muted small">
                                  {geminiHealthDirty ? "（未保存）" : "（已保存）"}
                                </div>
                              </div>
                              <div className="backend-health-list">
                                {geminiPresetModels.map((m) => {
                                  const r = geminiHealth[m];
                                  const mark = r?.verdict === "ok" ? "✅" : r?.verdict === "err" ? "❌" : "—";
                                  return (
                                    <div key={m} className="backend-health-row">
                                      <span className="backend-health-model">{m}</span>
                                      <span className="backend-health-mark" aria-label={mark}>
                                        {mark}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="muted small" style={{ marginTop: 8 }}>
                                说明：结果来源于你点击“测试该模型版本”的实时请求；点击右上角“保存”后会被记住。
                              </p>
                            </div>
                          </div>
                        ) : (
                          <input
                            value={cfg.model}
                            onChange={(e) => onChange(setCfg(settings, id, { model: e.target.value }))}
                          />
                        )}
                      </label>
                    </div>
                  </section>
                );
              })()
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

