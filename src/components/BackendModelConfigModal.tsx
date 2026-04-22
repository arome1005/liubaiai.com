import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import type { AiProviderId, AiProviderConfig, AiSettings } from "../ai/types";
import { getProviderConfig, patchProviderConfig } from "../ai/storage";
import { resolveOpenAiCompatibleBaseUrl } from "../ai/client";
import {
  resolveAnthropicNativeMessagesBaseUrl,
  resolveGeminiNativeApiBaseUrl,
  shouldUseRouterProtocol,
} from "../ai/providers";
import { listModelPersonas } from "../util/model-personas";
import { geminiGenerateTextFromJson, messageFromApiJsonBody } from "../util/parse-api-json";

type ProviderTestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "err"; message: string };

/** 潜龙（Ollama/MLX）合并为单独导航 `qianlong`，页内再切换具体后端 */
type NavId = "privacy" | "defaults" | "qianlong" | Exclude<AiProviderId, "ollama" | "mlx">;

type GeminiModelVerdict = "ok" | "err";
type GeminiModelHealth = Record<string, { verdict: GeminiModelVerdict; testedAt: number }>;

const GEMINI_HEALTH_KEY = "liubai:geminiModelHealth";
const HEALTH_KEY_PREFIX = "liubai:modelHealth:";

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

type ModelVerdict = "ok" | "err";
type ModelHealth = Record<string, { verdict: ModelVerdict; testedAt: number }>;

function healthKey(provider: AiProviderId) {
  return `${HEALTH_KEY_PREFIX}${provider}`;
}

function loadModelHealth(provider: AiProviderId): ModelHealth {
  try {
    const raw = localStorage.getItem(healthKey(provider));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ModelHealth;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveModelHealth(provider: AiProviderId, next: ModelHealth) {
  try {
    localStorage.setItem(healthKey(provider), JSON.stringify(next));
  } catch {
    /* ignore */
  }
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

async function testGeminiModel(args: { cfg: AiProviderConfig; modelOverride?: string }): Promise<string> {
  const baseUrl = resolveGeminiNativeApiBaseUrl(args.cfg);
  const key = (args.cfg.apiKey ?? "").trim();
  if (!key) throw new Error("请先填写 API Key");
  const model = (args.modelOverride ?? args.cfg.model ?? "").trim();
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
  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(messageFromApiJsonBody(raw) || `HTTP ${resp.status}`);
  const text = geminiGenerateTextFromJson(raw).trim();
  return text ? "连接成功（该模型可用）" : "连接成功（该模型可用）";
}

async function testOpenAICompatibleModel(args: { cfg: AiProviderConfig; model: string }): Promise<void> {
  const baseUrl = resolveOpenAiCompatibleBaseUrl(args.cfg);
  const key = (args.cfg.apiKey ?? "").trim();
  if (!key && args.cfg.id !== "mlx") throw new Error("请先填写 API Key");
  const url = joinUrl(baseUrl, "/chat/completions");
  const body: Record<string, unknown> = {
    model: args.model,
    messages: [{ role: "user", content: "ping" }],
    temperature: 0.1,
    stream: false,
  };
  // 小米 MiMo 官方文档使用 max_completion_tokens，不接受 max_tokens；否则会报 Param Incorrect
  if (args.cfg.id === "xiaomi") {
    body.max_completion_tokens = 64;
  } else {
    body.max_tokens = 8;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(messageFromApiJsonBody(raw) || `HTTP ${resp.status}`);
}

async function testAnthropicModel(args: { cfg: AiProviderConfig; model: string }): Promise<void> {
  const baseUrl = resolveAnthropicNativeMessagesBaseUrl(args.cfg);
  const key = (args.cfg.apiKey ?? "").trim();
  if (!key) throw new Error("请先填写 API Key");
  const url = joinUrl(baseUrl, "/v1/messages");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(messageFromApiJsonBody(raw) || `HTTP ${resp.status}`);
}

async function testOllamaModel(args: { cfg: AiProviderConfig; model: string }): Promise<void> {
  const baseUrl = (args.cfg.baseUrl ?? "").trim() || "http://localhost:11434";
  const url = joinUrl(baseUrl, "/api/chat");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: args.model,
      stream: false,
      messages: [{ role: "user", content: "ping" }],
      options: { temperature: 0.1 },
    }),
  });
  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(messageFromApiJsonBody(raw) || `HTTP ${resp.status}`);
}

/** GET /api/tags — 需本机 Ollama 已启动；浏览器可能受 CORS 限制 */
async function fetchOllamaModelNames(baseUrl: string): Promise<string[]> {
  const b = (baseUrl ?? "").trim() || "http://localhost:11434";
  const url = joinUrl(b, "/api/tags");
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`无法拉取模型列表（HTTP ${resp.status}）`);
  const raw = (await resp.json().catch(() => ({}))) as { models?: { name?: string }[] };
  const models = raw?.models ?? [];
  const names = models.map((m) => (m?.name ?? "").trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
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
  const [localProvider, setLocalProvider] = useState<"ollama" | "mlx">("ollama");

  useEffect(() => {
    if (!open) return;
    const p = settings.provider;
    if (p === "ollama" || p === "mlx") setLocalProvider(p);
  }, [open, settings.provider]);
  const [geminiHealth, setGeminiHealth] = useState<GeminiModelHealth>(() => loadGeminiModelHealth());
  const [geminiHealthDirty, setGeminiHealthDirty] = useState(false);
  const [geminiBatch, setGeminiBatch] = useState<{ running: boolean; idx: number; total: number }>({
    running: false,
    idx: 0,
    total: 0,
  });
  const [modelHealth, setModelHealth] = useState<Record<AiProviderId, ModelHealth>>({
    openai: loadModelHealth("openai"),
    anthropic: loadModelHealth("anthropic"),
    gemini: loadModelHealth("gemini"),
    doubao: loadModelHealth("doubao"),
    zhipu: loadModelHealth("zhipu"),
    kimi: loadModelHealth("kimi"),
    xiaomi: loadModelHealth("xiaomi"),
    ollama: loadModelHealth("ollama"),
    mlx: loadModelHealth("mlx"),
  });
  const [modelHealthDirty, setModelHealthDirty] = useState<Record<AiProviderId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    doubao: false,
    zhipu: false,
    kimi: false,
    xiaomi: false,
    ollama: false,
    mlx: false,
  });
  const [modelBatch, setModelBatch] = useState<Record<AiProviderId, { running: boolean; idx: number; total: number }>>({
    openai: { running: false, idx: 0, total: 0 },
    anthropic: { running: false, idx: 0, total: 0 },
    gemini: { running: false, idx: 0, total: 0 },
    doubao: { running: false, idx: 0, total: 0 },
    zhipu: { running: false, idx: 0, total: 0 },
    kimi: { running: false, idx: 0, total: 0 },
    xiaomi: { running: false, idx: 0, total: 0 },
    ollama: { running: false, idx: 0, total: 0 },
    mlx: { running: false, idx: 0, total: 0 },
  });
  const [showKey, setShowKey] = useState<Record<AiProviderId, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
    doubao: false,
    zhipu: false,
    kimi: false,
    xiaomi: false,
    ollama: false,
    mlx: false,
  });
  const [testState, setTestState] = useState<Record<AiProviderId, ProviderTestState>>({
    openai: { status: "idle" },
    anthropic: { status: "idle" },
    gemini: { status: "idle" },
    doubao: { status: "idle" },
    zhipu: { status: "idle" },
    kimi: { status: "idle" },
    xiaomi: { status: "idle" },
    ollama: { status: "idle" },
    mlx: { status: "idle" },
  });

  /** 潜龙：/api/tags 拉取到的本机模型名（需 Ollama 已启动） */
  const [ollamaDetected, setOllamaDetected] = useState<string[]>([]);
  const [ollamaFetchStatus, setOllamaFetchStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [ollamaFetchErr, setOllamaFetchErr] = useState<string | null>(null);

  const providers = useMemo(() => {
    return [
      { id: "openai" as const, label: "见山", navSub: "openai", title: "OpenAI（见山）" },
      { id: "anthropic" as const, label: "听雨", navSub: "anthropic", title: "Claude（听雨）" },
      { id: "gemini" as const, label: "观云", navSub: "gemini", title: "Gemini（观云）" },
      { id: "doubao" as const, label: "燎原", navSub: "doubao", title: "豆包（燎原）" },
      { id: "zhipu" as const, label: "智谱", navSub: "zhipu", title: "智谱 GLM" },
      { id: "kimi" as const, label: "Kimi", navSub: "kimi", title: "Kimi（Moonshot）" },
      { id: "xiaomi" as const, label: "小米", navSub: "xiaomi", title: "小米 MiMo" },
    ] satisfies Array<{ id: Exclude<AiProviderId, "ollama" | "mlx">; label: string; navSub: string; title: string }>;
  }, []);

  const geminiPresetModels = useMemo(
    () => ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"],
    [],
  );

  /** 见山：常用 OpenAI 模型 ID（涵盖原生直连 5.4 系列与 OpenRouter 中转） */
  const openaiPresetModels = useMemo(() => [
    "gpt-5.4-mini", "gpt-5.4-standard", "gpt-5.4-pro", "gpt-5.4-thinking",
    "openai/gpt-5.4-mini", "openai/gpt-5.4-pro", "openai/gpt-5.4-thinking"
  ], []);

  /** 听雨：常用 Claude 模型 ID（涵盖原生直连 4.7 系列与 OpenRouter 中转） */
  const anthropicPresetModels = useMemo(
    () => [
      "claude-4.7-haiku", "claude-4.7-sonnet", "claude-4.7-opus",
      "anthropic/claude-4.7-sonnet", "anthropic/claude-4.7-opus"
    ],
    [],
  );

  /** 燎原：豆包 Ark 常用（以控制台为准） */
  // 提供给 UI 下拉框的一个示例占位符，但在批量测试时（下方的 presetModelIdsForProvider）会跳过它
  const doubaoPresetModels = useMemo(() => ["ep-20260315234645-2h6jf"], []);

  /** Kimi：Moonshot 常用 */
  const kimiPresetModels = useMemo(
    () => ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2.5-turbo-preview"],
    [],
  );

  /** 小米 MiMo 写作常用（文档另有 omni/tts 等可手动填写） */
  const xiaomiWritingModels = useMemo(() => ["mimo-v2-pro", "mimo-v2-flash"] as const, []);

  /** 智谱文本模型（ID 以 docs.bigmodel.cn 对话补全示例为准） */
  const zhipuPresetModels = useMemo(
    () =>
      [
        { id: "glm-5", label: "glm-5（最新旗舰）" },
        { id: "glm-4.7", label: "glm-4.7（高智能）" },
        { id: "glm-4.7-flashx", label: "glm-4.7-flashx（轻量高速·写作）" },
        { id: "glm-4.7-flash", label: "glm-4.7-flash（免费普惠）" },
      ] as const,
    [],
  );

  /** 一键测试 / 底部健康表：各云端预置模型 ID（Ollama 走本地检测） */
  function presetModelIdsForProvider(pid: AiProviderId): string[] | null {
    switch (pid) {
      case "openai":
        return [...openaiPresetModels];
      case "anthropic":
        return [...anthropicPresetModels];
      case "doubao":
        return null;
      case "zhipu":
        return zhipuPresetModels.map((x) => x.id);
      case "kimi":
        return [...kimiPresetModels];
      case "xiaomi":
        return [...xiaomiWritingModels];
      case "gemini":
        return [...geminiPresetModels];
      case "mlx":
        return null;
      default:
        return null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="work-form-modal-overlay"
        aria-describedby={undefined}
        className={cn(
          "backend-modal-dialog z-[var(--z-modal-app-content)] flex h-[min(92vh,920px)] max-h-[min(92vh,920px)] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-xl sm:max-w-[min(1200px,calc(100vw-2rem))]",
        )}
      >
        <div className="backend-modal backend-modal--dialog">
        <div className="backend-modal-head">
          <div>
            <DialogTitle className="backend-modal-title">高级后端配置</DialogTitle>
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
                for (const p of [
                  "openai",
                  "anthropic",
                  "gemini",
                  "doubao",
                  "zhipu",
                  "kimi",
                  "xiaomi",
                  "ollama",
                  "mlx",
                ] as AiProviderId[]) {
                  if (modelHealthDirty[p]) saveModelHealth(p, modelHealth[p]);
                }
                setModelHealthDirty({
                  openai: false,
                  anthropic: false,
                  gemini: false,
                  doubao: false,
                  zhipu: false,
                  kimi: false,
                  xiaomi: false,
                  ollama: false,
                  mlx: false,
                });
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
                <span className="backend-nav-sub muted small">{p.navSub}</span>
              </button>
            ))}
            <button
              type="button"
              className={"backend-nav-item" + (nav === "qianlong" ? " active" : "")}
              onClick={() => setNav("qianlong")}
            >
              <span className="backend-nav-title">潜龙</span>
              <span className="backend-nav-sub muted small">本地 · Ollama / MLX</span>
            </button>
          </aside>

          <main className="backend-main" aria-label="高级后端配置内容">
            {nav === "privacy" ? (
              <section className="backend-panel">
                <h3 style={{ margin: 0 }}>AI 隐私与上传范围</h3>
                <p className="muted small" style={{ marginTop: 6 }}>
                  只要你点击「生成」，本次提示词会发送到你选择的提供方。选择 OpenAI / Claude / Gemini / 豆包 / 智谱 / Kimi / 小米 等云端模型即代表会通过网络发送内容到第三方服务。潜龙（Ollama / MLX）为本地接口，不经过上述云端开关（仍可能因代理访问本机服务）。
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
                  <span>允许使用云端提供方（OpenAI / Claude / Gemini / 豆包 / 智谱 / Kimi / 小米 等；不含潜龙本地 Ollama/MLX）</span>
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
                        ["allowBible", "本书锦囊（导出 Markdown）"],
                        ["allowLinkedExcerpts", "本章关联摘录（参考库）"],
                        ["allowRagSnippets", "参考库检索片段（RAG 注入）"],
                      ] as const
                    ).map(([k, label]) => {
                      const pk = k as keyof AiSettings["privacy"];
                      return (
                      <label key={k} className="row row--check">
                        <input
                          type="checkbox"
                          checked={Boolean(settings.privacy[pk])}
                          onChange={(e) =>
                            onChange({
                              ...settings,
                              privacy: { ...settings.privacy, [pk]: e.target.checked },
                            })
                          }
                        />
                        <span>{label}</span>
                      </label>
                    );
                    })}
                  </div>
                  <p className="muted small" style={{ marginTop: 10 }}>
                    说明：这些开关只控制"是否把对应内容拼进 prompt"。即使关闭，也不影响你在本地查看/编辑这些内容。
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
                      <option value="zhipu">智谱</option>
                      <option value="kimi">Kimi</option>
                      <option value="xiaomi">小米</option>
                      <option value="ollama">潜龙（Ollama）</option>
                      <option value="mlx">潜龙（MLX）</option>
                    </select>
                  </label>

                  <label className="row row--check">
                    <input
                      name="aiIncludeBibleDefault"
                      type="checkbox"
                      checked={settings.includeBible}
                      onChange={(e) => onChange({ ...settings, includeBible: e.target.checked })}
                    />
                    <span>默认注入本书锦囊</span>
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

                  <div className="backend-field" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 12 }}>
                    <div className="backend-label muted small">侧栏注入确认（防误触 / 费用）</div>
                    <p className="muted small" style={{ margin: "6px 0 10px" }}>
                      在写作页侧栏点击生成前，可按粗估 tokens 或「云端发锦囊全文」弹出浏览器确认。粗估非计费凭证。
                    </p>
                    <label className="row row--check">
                      <input
                        type="checkbox"
                        checked={settings.injectConfirmOnOversizeTokens}
                        onChange={(e) => onChange({ ...settings, injectConfirmOnOversizeTokens: e.target.checked })}
                      />
                      <span>粗估超过阈值时要求确认</span>
                    </label>
                    <label className="row" style={{ marginTop: 8 }}>
                      <span>粗估 token 阈值</span>
                      <input
                        name="aiInjectTokenThreshold"
                        type="number"
                        min={0}
                        max={500000}
                        value={settings.injectApproxTokenThreshold}
                        onChange={(e) =>
                          onChange({
                            ...settings,
                            injectApproxTokenThreshold: Math.max(0, Math.min(500_000, Number(e.target.value) || 0)),
                          })
                        }
                      />
                      <span className="muted small">0=仅其它规则</span>
                    </label>
                    <label className="row row--check" style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={settings.injectConfirmCloudBible}
                        onChange={(e) => onChange({ ...settings, injectConfirmCloudBible: e.target.checked })}
                      />
                      <span>向云端发送本书锦囊前始终确认（建议开启）</span>
                    </label>
                  </div>

                  <div className="backend-field" style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 12 }}>
                    <div className="backend-label muted small">调性与本会话成本</div>
                    <p className="muted small" style={{ margin: "6px 0 10px" }}>
                      调性提示：对照风格卡里禁用套话与文风锚点句长，仅在草稿区展示参考。会话上限：按当前标签页累计粗估 tokens（关标签页即清零），与单次注入阈值不同。
                    </p>
                    <label className="row row--check">
                      <input
                        type="checkbox"
                        checked={settings.toneDriftHintEnabled}
                        onChange={(e) => onChange({ ...settings, toneDriftHintEnabled: e.target.checked })}
                      />
                      <span>侧栏草稿生成后显示调性漂移提示</span>
                    </label>
                    <label className="row" style={{ marginTop: 8 }}>
                      <span>本会话侧栏累计上限（粗估 tokens）</span>
                      <input
                        name="aiSessionApproxTokenBudget"
                        type="number"
                        min={0}
                        max={2000000}
                        value={settings.aiSessionApproxTokenBudget}
                        onChange={(e) =>
                          onChange({
                            ...settings,
                            aiSessionApproxTokenBudget: Math.max(
                              0,
                              Math.min(2_000_000, Math.floor(Number(e.target.value) || 0)),
                            ),
                          })
                        }
                      />
                      <span className="muted small">0=不限制</span>
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {nav === "qianlong" || providers.some((p) => p.id === nav) ? (
              (() => {
                const id: AiProviderId = nav === "qianlong" ? localProvider : (nav as AiProviderId);
                const cfg = getProviderConfig(settings, id);
                const s = testState[id];
                const keyShown = showKey[id];
                const isGemini = id === "gemini";
                const batch = modelBatch[id];
                const list =
                  id === "ollama"
                    ? ollamaDetected.length > 0
                      ? ollamaDetected
                      : [cfg.model].filter(Boolean)
                    : id === "mlx"
                      ? [cfg.model].filter(Boolean)
                      : id === "anthropic" && shouldUseRouterProtocol(cfg)
                        ? (cfg.model ?? "").trim()
                          ? [(cfg.model ?? "").trim()]
                          : []
                        : presetModelIdsForProvider(id) ?? [cfg.model].filter(Boolean);
                return (
                  <section className="backend-panel">
                    <div className="backend-panel-head">
                      <div>
                        {nav === "qianlong" ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <h3 style={{ margin: 0 }}>
                                {localProvider === "ollama" ? "Ollama（潜龙）" : "MLX（潜龙）"}
                              </h3>
                              <div role="group" aria-label="本地后端" style={{ display: "inline-flex", gap: 6 }}>
                                <button
                                  type="button"
                                  className={"btn small" + (localProvider === "ollama" ? " primary" : "")}
                                  onClick={() => setLocalProvider("ollama")}
                                >
                                  Ollama
                                </button>
                                <button
                                  type="button"
                                  className={"btn small" + (localProvider === "mlx" ? " primary" : "")}
                                  onClick={() => setLocalProvider("mlx")}
                                >
                                  MLX
                                </button>
                              </div>
                            </div>
                            <div className="muted small" style={{ marginTop: 4 }}>
                              本机模型（默认不需要 API Key）
                            </div>
                          </>
                        ) : (
                          <>
                            <h3 style={{ margin: 0 }}>{providers.find((p) => p.id === id)?.title ?? id}</h3>
                            <div className="muted small" style={{ marginTop: 4 }}>
                              {id === "ollama" || id === "mlx"
                                ? "本机模型（默认不需要 API Key）"
                                : "云端模型（需 API Key；可能遇到 CORS）"}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="backend-provider-actions">
                        <button
                          type="button"
                          className="btn small"
                          disabled={s.status === "testing" || (isGemini && geminiBatch.running) || (!isGemini && batch.running)}
                          onClick={() => {
                            if (!isGemini) {
                              const models = list;
                              if (models.length === 0) {
                                setTestState((prev) => ({
                                  ...prev,
                                  [id]: {
                                    status: "err",
                                    message:
                                      id === "anthropic" && shouldUseRouterProtocol(cfg)
                                        ? "中转模式请先在 Model 填写网关兼容的模型 ID，再一键测试"
                                        : "没有可测试的模型",
                                  },
                                }));
                                return;
                              }
                              setModelBatch((m) => ({ ...m, [id]: { running: true, idx: 0, total: models.length } }));
                              setTestState((prev) => ({ ...prev, [id]: { status: "testing" } }));
                              void (async () => {
                                const baseCfg = getProviderConfig(settings, id);
                                for (let i = 0; i < models.length; i++) {
                                  const model = models[i]!;
                                  setModelBatch((m) => ({ ...m, [id]: { running: true, idx: i + 1, total: models.length } }));
                                  try {
                                    if (
                                      id === "openai" ||
                                      id === "doubao" ||
                                      id === "zhipu" ||
                                      id === "kimi" ||
                                      id === "xiaomi" ||
                                      id === "mlx"
                                    ) {
                                      await testOpenAICompatibleModel({ cfg: baseCfg, model });
                                    } else if (id === "anthropic") {
                                      if (shouldUseRouterProtocol(baseCfg)) {
                                        await testOpenAICompatibleModel({ cfg: baseCfg, model });
                                      } else {
                                        await testAnthropicModel({ cfg: baseCfg, model });
                                      }
                                    } else {
                                      await testOllamaModel({ cfg: baseCfg, model });
                                    }
                                    setModelHealth((h) => ({
                                      ...h,
                                      [id]: { ...h[id], [model]: { verdict: "ok", testedAt: Date.now() } },
                                    }));
                                  } catch {
                                    setModelHealth((h) => ({
                                      ...h,
                                      [id]: { ...h[id], [model]: { verdict: "err", testedAt: Date.now() } },
                                    }));
                                  } finally {
                                    setModelHealthDirty((d) => ({ ...d, [id]: true }));
                                  }
                                }
                                setModelBatch((m) => ({ ...m, [id]: { running: false, idx: 0, total: 0 } }));
                                setTestState((prev) => ({ ...prev, [id]: { status: "ok", message: "批量测试完成" } }));
                              })();
                              return;
                            }

                            // Gemini：原生走预置版本；中转仅测当前 Model（网关 model id 与原生 id 不同）
                            void (() => {
                              const baseCfg = getProviderConfig(settings, "gemini");
                              const geminiBatchModels = shouldUseRouterProtocol(baseCfg)
                                ? (baseCfg.model ?? "").trim()
                                  ? [(baseCfg.model ?? "").trim()]
                                  : []
                                : [...geminiPresetModels];
                              if (geminiBatchModels.length === 0) {
                                setTestState((prev) => ({
                                  ...prev,
                                  gemini: {
                                    status: "err",
                                    message: "中转模式请先在 Model 填写网关兼容的模型 ID（如 google/gemini-2.0-flash-001），再一键测试",
                                  },
                                }));
                                return;
                              }
                              setGeminiBatch({ running: true, idx: 0, total: geminiBatchModels.length });
                              setTestState((prev) => ({ ...prev, gemini: { status: "testing" } }));
                              void (async () => {
                                for (let i = 0; i < geminiBatchModels.length; i++) {
                                  const m = geminiBatchModels[i]!;
                                  setGeminiBatch({
                                    running: true,
                                    idx: i + 1,
                                    total: geminiBatchModels.length,
                                  });
                                  try {
                                    if (shouldUseRouterProtocol(baseCfg)) {
                                      await testOpenAICompatibleModel({ cfg: baseCfg, model: m });
                                    } else {
                                      await testGeminiModel({ cfg: baseCfg, modelOverride: m });
                                    }
                                    setGeminiHealth((h) => ({ ...h, [m]: { verdict: "ok", testedAt: Date.now() } }));
                                  } catch {
                                    setGeminiHealth((h) => ({ ...h, [m]: { verdict: "err", testedAt: Date.now() } }));
                                  } finally {
                                    setGeminiHealthDirty(true);
                                  }
                                }
                                setGeminiBatch({ running: false, idx: 0, total: 0 });
                                setTestState((prev) => ({
                                  ...prev,
                                  gemini: { status: "ok", message: "批量测试完成" },
                                }));
                              })();
                            })();
                          }}
                        >
                          {isGemini ? "一键测试全部版本" : "一键测试全部版本"}
                        </button>
                        {isGemini && geminiBatch.running ? (
                          <span className="backend-test muted small">
                            测试中… {geminiBatch.idx}/{geminiBatch.total}
                          </span>
                        ) : null}
                        {!isGemini && batch.running ? (
                          <span className="backend-test muted small">
                            测试中… {batch.idx}/{batch.total}
                          </span>
                        ) : null}
                        {s.status === "ok" && !isGemini ? <span className="backend-test backend-test--ok">连接成功</span> : null}
                        {s.status === "err" ? <span className="backend-test backend-test--err">{s.message}</span> : null}
                        {s.status === "testing" && !isGemini ? <span className="backend-test muted small">测试中…</span> : null}
                      </div>
                    </div>

                    <div className="backend-form">
                      <label className="backend-field">
                        <div className="backend-label muted small">Base URL</div>
                        <input
                          value={cfg.baseUrl ?? ""}
                          onChange={(e) => onChange(patchProviderConfig(settings, id, { baseUrl: e.target.value }))}
                          placeholder={
                            id === "openai"
                              ? "https://api.openai.com/v1"
                              : id === "anthropic"
                                ? "https://api.anthropic.com"
                                : id === "gemini"
                                  ? "https://generativelanguage.googleapis.com"
                                  : id === "doubao"
                                    ? "https://ark.cn-beijing.volces.com/api/v3"
                                    : id === "zhipu"
                                      ? "https://open.bigmodel.cn/api/paas/v4"
                                      : id === "kimi"
                                        ? "https://api.moonshot.cn/v1"
                                        : id === "xiaomi"
                                          ? "https://api.mimo-v2.com/v1"
                                          : id === "mlx"
                                            ? "http://127.0.0.1:8080/v1"
                                            : "http://localhost:11434"
                          }
                        />
                      </label>

                      {id === "gemini" || id === "anthropic" ? (
                        <div className="backend-field">
                          <div className="backend-label muted small">接入方式</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            <button
                              type="button"
                              className={"btn small" + (!shouldUseRouterProtocol(cfg) ? " primary" : "")}
                              onClick={() => onChange(patchProviderConfig(settings, id, { 
                                transport: "native",
                                baseUrl: id === "anthropic" ? "https://api.anthropic.com" : "https://generativelanguage.googleapis.com"
                              }))}
                            >
                              原生（官方 API）
                            </button>
                            <button
                              type="button"
                              className={"btn small" + (shouldUseRouterProtocol(cfg) ? " primary" : "")}
                              onClick={() => onChange(patchProviderConfig(settings, id, { 
                                transport: "router",
                                baseUrl: "https://openrouter.ai/api/v1"
                              }))}
                            >
                              中转（OpenAI 兼容）
                            </button>
                            <button
                              type="button"
                              className="btn small ghost"
                              onClick={() =>
                                onChange(patchProviderConfig(settings, id, { transport: undefined }))
                              }
                              title="清除显式选择后，仍可按 Base URL 是否含 openrouter.ai 自动判断"
                            >
                              按 Base URL 自动
                            </button>
                          </div>
                          <p className="muted small" style={{ marginTop: 6, marginBottom: 0, lineHeight: 1.55 }}>
                            {id === "gemini" ? (
                              <>
                                <strong>原生</strong>：请求走 Google{" "}
                                <code style={{ fontSize: "0.85em" }}>generateContent</code>
                                （当前 Base 一般为 generativelanguage）。
                                <strong> 中转</strong>：同一密钥下走网关的{" "}
                                <code style={{ fontSize: "0.85em" }}>/v1/chat/completions</code>
                                （如 OpenRouter），模型名常为 <code style={{ fontSize: "0.85em" }}>google/…</code> 形式。
                              </>
                            ) : (
                              <>
                                <strong>原生</strong>：走 Anthropic{" "}
                                <code style={{ fontSize: "0.85em" }}>/v1/messages</code>。
                                <strong> 中转</strong>：走网关的{" "}
                                <code style={{ fontSize: "0.85em" }}>/v1/chat/completions</code>
                                ，模型名常为 <code style={{ fontSize: "0.85em" }}>anthropic/…</code> 前缀。
                              </>
                            )}
                          </p>
                        </div>
                      ) : null}

                      {id === "gemini" || id === "anthropic" ? (
                        <label className="backend-field">
                          <div className="backend-label muted small">原生 API Base（可选）</div>
                          <input
                            value={cfg.baseUrlNative ?? ""}
                            onChange={(e) =>
                              onChange(
                                patchProviderConfig(settings, id, {
                                  baseUrlNative: e.target.value.trim() || undefined,
                                }),
                              )
                            }
                            placeholder={
                              id === "gemini"
                                ? "例如：https://generativelanguage.googleapis.com"
                                : "例如：https://api.anthropic.com"
                            }
                          />
                          <p className="muted small" style={{ marginTop: 6, marginBottom: 0, lineHeight: 1.55 }}>
                            直连官方协议时优先用此地址；未填时，若上方 Base URL 不是网关域名，则退回上方；否则用官方默认。
                          </p>
                        </label>
                      ) : null}

                      <label className="backend-field">
                        <div className="backend-label muted small">API Key</div>
                        <div className="backend-key-row">
                          <input
                            type={keyShown ? "text" : "password"}
                            value={cfg.apiKey ?? ""}
                            onChange={(e) => onChange(patchProviderConfig(settings, id, { apiKey: e.target.value }))}
                            placeholder={
                              id === "ollama"
                                ? "（Ollama 通常不需要）"
                                : id === "mlx"
                                  ? "（可选：仅当服务要求鉴权时填写）"
                                  : ""
                            }
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
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                            >
                              {geminiPresetModels.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                              {cfg.model && !geminiPresetModels.includes(cfg.model) ? (
                                <option value={cfg.model}>{cfg.model}（当前）</option>
                              ) : null}
                            </select>
                            <div className="backend-provider-actions">
                              <button
                                type="button"
                                className="btn small"
                                disabled={geminiBatch.running}
                                onClick={() => {
                                  setTestState((prev) => ({ ...prev, gemini: { status: "testing" } }));
                                  void (async () => {
                                    try {
                                      const gCfg = getProviderConfig(settings, "gemini");
                                      let msg: string;
                                      if (shouldUseRouterProtocol(gCfg)) {
                                        await testOpenAICompatibleModel({
                                          cfg: gCfg,
                                          model: gCfg.model.trim() || geminiPresetModels[0]!,
                                        });
                                        msg = "连接成功（OpenAI 兼容路径）";
                                      } else {
                                        msg = await testGeminiModel({ cfg: gCfg });
                                      }
                                      setTestState((prev) => ({ ...prev, gemini: { status: "ok", message: msg } }));
                                      setGeminiHealth((h) => ({
                                        ...h,
                                        [getProviderConfig(settings, "gemini").model]: { verdict: "ok", testedAt: Date.now() },
                                      }));
                                      setGeminiHealthDirty(true);
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "连接失败";
                                      setTestState((prev) => ({ ...prev, gemini: { status: "err", message: msg } }));
                                      setGeminiHealth((h) => ({
                                        ...h,
                                        [getProviderConfig(settings, "gemini").model]: { verdict: "err", testedAt: Date.now() },
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
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                              placeholder="例如：gemini-3.1-pro-preview"
                            />

                            <div style={{ marginTop: 8 }}>
                              <div className="muted small" style={{ marginBottom: 6 }}>
                                推荐模型（卡面仅用于快捷填入真实 modelId）
                              </div>
                              <div className="model-persona-grid">
                                {listModelPersonas(id)
                                  .filter((p) => geminiPresetModels.includes(p.modelId))
                                  .map((p) => (
                                    <button
                                      key={p.modelId}
                                      type="button"
                                      className={"model-persona-card" + (cfg.model === p.modelId ? " is-on" : "")}
                                      onClick={() => onChange(patchProviderConfig(settings, id, { model: p.modelId }))}
                                      title={p.modelId}
                                    >
                                      <div className="model-persona-card-head">
                                        <div className="model-persona-card-title">{p.title}</div>
                                        <div className="model-persona-card-badges">
                                          {p.tags?.slice(0, 2).map((t) => (
                                            <span key={t} className="model-persona-badge muted small">
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="muted small">{p.subtitle}</div>
                                      <div className="model-persona-card-desc muted small">{p.description}</div>
                                      <div className="model-persona-card-foot muted small">
                                        <span className="model-persona-modelid">{p.modelId}</span>
                                        <span className="model-persona-cost">
                                          {Array.from({ length: p.costStars ?? 3 }).fill("★").join("")}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                              </div>
                            </div>

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
                                说明：结果来源于你点击「测试该模型版本」或「一键测试全部版本」的实时请求；点击右上角「保存」后会被记住。
                              </p>
                            </div>
                          </div>
                        ) : id === "xiaomi" ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <select
                              value={cfg.model}
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                            >
                              {xiaomiWritingModels.map((m) => (
                                <option key={m} value={m}>
                                  {m === "mimo-v2-pro" ? "mimo-v2-pro（写作·偏强）" : "mimo-v2-flash（写作·偏快）"}
                                </option>
                              ))}
                              {cfg.model !== "mimo-v2-pro" && cfg.model !== "mimo-v2-flash" && cfg.model ? (
                                <option value={cfg.model}>{cfg.model}（当前）</option>
                              ) : null}
                            </select>
                            <div className="backend-provider-actions">
                              <button
                                type="button"
                                className="btn small"
                                disabled={testState.xiaomi.status === "testing"}
                                onClick={() => {
                                  setTestState((prev) => ({ ...prev, xiaomi: { status: "testing" } }));
                                  void (async () => {
                                    const model = cfg.model.trim() || "mimo-v2-flash";
                                    try {
                                      await testOpenAICompatibleModel({
                                        cfg: getProviderConfig(settings, "xiaomi"),
                                        model,
                                      });
                                      setTestState((prev) => ({ ...prev, xiaomi: { status: "ok", message: "连接成功" } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        xiaomi: { ...h.xiaomi, [model]: { verdict: "ok", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, xiaomi: true }));
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "连接失败";
                                      setTestState((prev) => ({ ...prev, xiaomi: { status: "err", message: msg } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        xiaomi: { ...h.xiaomi, [model]: { verdict: "err", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, xiaomi: true }));
                                    }
                                  })();
                                }}
                              >
                                测试该模型版本
                              </button>
                              {testState.xiaomi.status === "ok" ? (
                                <span className="backend-test backend-test--ok">可用</span>
                              ) : null}
                              {testState.xiaomi.status === "err" ? (
                                <span className="backend-test backend-test--err">{testState.xiaomi.message}</span>
                              ) : null}
                            </div>
                            <p className="muted small" style={{ margin: 0 }}>
                              写作常用上述二者；其它如 mimo-v2-omni、mimo-v2-tts 请在下框手动填写。
                            </p>
                            <input
                              value={cfg.model}
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                              placeholder="模型 ID，如 mimo-v2-pro / mimo-v2-flash"
                            />
                            <div className="backend-health">
                              <div className="backend-health-head">
                                <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                <div className="muted small">{modelHealthDirty[id] ? "（未保存）" : "（已保存）"}</div>
                              </div>
                              <div className="backend-health-list">
                                {xiaomiWritingModels.map((m) => {
                                  const r = modelHealth[id]?.[m];
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
                                说明：结果来源于你点击「测试该模型版本」或「一键测试全部版本」的实时请求；点击右上角「保存」后会被记住。
                              </p>
                            </div>
                          </div>
                        ) : id === "zhipu" ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <select
                              value={cfg.model}
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                            >
                              {zhipuPresetModels.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.label}
                                </option>
                              ))}
                              {cfg.model && !zhipuPresetModels.some((x) => x.id === cfg.model) ? (
                                <option value={cfg.model}>{cfg.model}（当前）</option>
                              ) : null}
                            </select>
                            <div className="backend-provider-actions">
                              <button
                                type="button"
                                className="btn small"
                                disabled={testState.zhipu.status === "testing"}
                                onClick={() => {
                                  setTestState((prev) => ({ ...prev, zhipu: { status: "testing" } }));
                                  void (async () => {
                                    const model = cfg.model.trim() || "glm-4.7-flash";
                                    try {
                                      await testOpenAICompatibleModel({
                                        cfg: getProviderConfig(settings, "zhipu"),
                                        model,
                                      });
                                      setTestState((prev) => ({ ...prev, zhipu: { status: "ok", message: "连接成功" } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        zhipu: { ...h.zhipu, [model]: { verdict: "ok", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, zhipu: true }));
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "连接失败";
                                      setTestState((prev) => ({ ...prev, zhipu: { status: "err", message: msg } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        zhipu: { ...h.zhipu, [model]: { verdict: "err", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, zhipu: true }));
                                    }
                                  })();
                                }}
                              >
                                测试该模型版本
                              </button>
                              {testState.zhipu.status === "ok" ? (
                                <span className="backend-test backend-test--ok">可用</span>
                              ) : null}
                              {testState.zhipu.status === "err" ? (
                                <span className="backend-test backend-test--err">{testState.zhipu.message}</span>
                              ) : null}
                            </div>
                            <p className="muted small" style={{ margin: 0 }}>
                              写作常用 glm-4.7 / glm-4.7-flash；更强推理与 Agent 场景可试 glm-5。其它名称请在下框粘贴控制台中的 model 字符串。
                            </p>
                            <input
                              value={cfg.model}
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                              placeholder="例如：glm-5 / glm-4.7 / glm-4.7-flash"
                            />
                            <div className="backend-health">
                              <div className="backend-health-head">
                                <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                <div className="muted small">{modelHealthDirty[id] ? "（未保存）" : "（已保存）"}</div>
                              </div>
                              <div className="backend-health-list">
                                {zhipuPresetModels.map((x) => {
                                  const r = modelHealth[id]?.[x.id];
                                  const mark = r?.verdict === "ok" ? "✅" : r?.verdict === "err" ? "❌" : "—";
                                  return (
                                    <div key={x.id} className="backend-health-row">
                                      <span className="backend-health-model">{x.id}</span>
                                      <span className="backend-health-mark" aria-label={mark}>
                                        {mark}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="muted small" style={{ marginTop: 8 }}>
                                说明：结果来源于你点击「测试该模型版本」或「一键测试全部版本」的实时请求；点击右上角「保存」后会被记住。
                              </p>
                            </div>
                          </div>
                        ) : id === "mlx" ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            <p className="muted small" style={{ margin: 0, lineHeight: 1.65 }}>
                              Apple <strong>MLX</strong> 在本 App 中仅通过{" "}
                              <strong>HTTP</strong> 连接（OpenAI 兼容，一般为{" "}
                              <code style={{ fontSize: "0.9em" }}>/v1/chat/completions</code>
                              ）。默认 Base 为 <code style={{ fontSize: "0.9em" }}>http://127.0.0.1:8080/v1</code>
                              ，请按你本机实际端口修改。
                            </p>
                            <p className="muted small" style={{ margin: 0, lineHeight: 1.65 }}>
                              <strong>说明：</strong>用终端执行{" "}
                              <code style={{ fontSize: "0.85em" }}>python3 -m mlx_vlm.generate …</code>{" "}
                              只会本地下载并跑一次模型，<strong>不会</strong>被本页「检测」——没有常驻网络服务时，浏览器无法发现该模型。请另外启动带 OpenAI 兼容接口的本地服务（或换用已接入的 Ollama 等），再把服务里使用的{" "}
                              <strong>模型 id</strong> 填到下方（与 CLI 的{" "}
                              <code style={{ fontSize: "0.85em" }}>--model</code> 字符串可能相同，也可能以服务端为准）。
                            </p>
                            <input
                              value={cfg.model}
                              onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                              placeholder="例如：default 或服务返回的模型 id"
                              style={{ width: "100%" }}
                            />
                            <div className="backend-provider-actions">
                              <button
                                type="button"
                                className="btn small"
                                disabled={testState.mlx.status === "testing"}
                                onClick={() => {
                                  setTestState((prev) => ({ ...prev, mlx: { status: "testing" } }));
                                  void (async () => {
                                    const model = cfg.model.trim() || "default";
                                    try {
                                      await testOpenAICompatibleModel({
                                        cfg: getProviderConfig(settings, "mlx"),
                                        model,
                                      });
                                      setTestState((prev) => ({ ...prev, mlx: { status: "ok", message: "连接成功" } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        mlx: { ...h.mlx, [model]: { verdict: "ok", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, mlx: true }));
                                    } catch (e) {
                                      const msg = e instanceof Error ? e.message : "连接失败";
                                      setTestState((prev) => ({ ...prev, mlx: { status: "err", message: msg } }));
                                      setModelHealth((h) => ({
                                        ...h,
                                        mlx: { ...h.mlx, [model]: { verdict: "err", testedAt: Date.now() } },
                                      }));
                                      setModelHealthDirty((d) => ({ ...d, mlx: true }));
                                    }
                                  })();
                                }}
                              >
                                测试当前模型
                              </button>
                              {testState.mlx.status === "ok" ? (
                                <span className="backend-test backend-test--ok">可用</span>
                              ) : null}
                              {testState.mlx.status === "err" ? (
                                <span className="backend-test backend-test--err">{testState.mlx.message}</span>
                              ) : null}
                            </div>
                            <div className="backend-health">
                              <div className="backend-health-head">
                                <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                <div className="muted small">{modelHealthDirty[id] ? "（未保存）" : "（已保存）"}</div>
                              </div>
                              <div className="backend-health-list">
                                {[cfg.model].filter(Boolean).map((m) => {
                                  const r = modelHealth[id]?.[m];
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
                                说明：与 Ollama 不同，MLX 无统一「检测全部本地模型」接口；请按部署文档填写 Base URL 与模型名。若浏览器报 CORS，请用同源代理或桌面端。
                              </p>
                            </div>
                          </div>
                        ) : id === "ollama" ? (
                          <div style={{ display: "grid", gap: 14 }}>
                            <div>
                              <div className="muted small" style={{ fontWeight: 800, marginBottom: 6 }}>
                                手动适配
                              </div>
                              <p className="muted small" style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
                                直接填写模型名，需与终端 <code style={{ fontSize: "0.9em" }}>ollama list</code>{" "}
                                中名称一致。
                              </p>
                              <input
                                value={cfg.model}
                                onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                                placeholder="例如：llama3.1:8b"
                                style={{ width: "100%" }}
                              />
                              <div className="backend-provider-actions" style={{ marginTop: 8 }}>
                                <button
                                  type="button"
                                  className="btn small"
                                  disabled={testState.ollama.status === "testing"}
                                  onClick={() => {
                                    setTestState((prev) => ({ ...prev, ollama: { status: "testing" } }));
                                    void (async () => {
                                      try {
                                        await testOllamaModel({
                                          cfg: getProviderConfig(settings, "ollama"),
                                          model: cfg.model.trim() || "llama3.1:8b",
                                        });
                                        setTestState((prev) => ({ ...prev, ollama: { status: "ok", message: "连接成功" } }));
                                      } catch (e) {
                                        const msg = e instanceof Error ? e.message : "连接失败";
                                        setTestState((prev) => ({ ...prev, ollama: { status: "err", message: msg } }));
                                      }
                                    })();
                                  }}
                                >
                                  测试当前模型
                                </button>
                                {testState.ollama.status === "ok" ? (
                                  <span className="backend-test backend-test--ok">可用</span>
                                ) : null}
                                {testState.ollama.status === "err" ? (
                                  <span className="backend-test backend-test--err">{testState.ollama.message}</span>
                                ) : null}
                              </div>
                            </div>

                            <div>
                              <div className="muted small" style={{ fontWeight: 800, marginBottom: 6 }}>
                                自动适配
                              </div>
                              <p className="muted small" style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
                                需本机已启动 Ollama。将请求 Base URL 下的 <code style={{ fontSize: "0.9em" }}>/api/tags</code>{" "}
                                列出已下载模型；若浏览器报 CORS，请改用同源代理或桌面端。
                              </p>
                              <div className="backend-provider-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn small"
                                  disabled={ollamaFetchStatus === "loading"}
                                  onClick={() => {
                                    setOllamaFetchErr(null);
                                    setOllamaFetchStatus("loading");
                                    void (async () => {
                                      try {
                                        const names = await fetchOllamaModelNames(cfg.baseUrl ?? "");
                                        setOllamaDetected(names);
                                        setOllamaFetchStatus("ok");
                                      } catch (e) {
                                        const msg = e instanceof Error ? e.message : "检测失败";
                                        setOllamaFetchErr(msg);
                                        setOllamaDetected([]);
                                        setOllamaFetchStatus("err");
                                      }
                                    })();
                                  }}
                                >
                                  {ollamaFetchStatus === "loading" ? "检测中…" : "检测本地模型"}
                                </button>
                                {ollamaFetchStatus === "ok" && ollamaDetected.length === 0 ? (
                                  <span className="muted small">未返回模型（可先 ollama pull 再试）</span>
                                ) : null}
                                {ollamaFetchErr ? (
                                  <span className="backend-test backend-test--err" style={{ flex: "1 1 100%" }}>
                                    {ollamaFetchErr}
                                  </span>
                                ) : null}
                              </div>
                              {ollamaDetected.length > 0 ? (
                                <div style={{ marginTop: 10 }}>
                                  <div className="muted small" style={{ marginBottom: 6 }}>
                                    已检测到本地模型（点击填入 Model）
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {ollamaDetected.map((name) => (
                                      <button
                                        key={name}
                                        type="button"
                                        className={"btn small" + (cfg.model === name ? " primary" : "")}
                                        onClick={() => onChange(patchProviderConfig(settings, "ollama", { model: name }))}
                                      >
                                        {name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="backend-health">
                              <div className="backend-health-head">
                                <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                <div className="muted small">{modelHealthDirty[id] ? "（未保存）" : "（已保存）"}</div>
                              </div>
                              <div className="backend-health-list">
                                {list.map((m) => {
                                  const r = modelHealth[id]?.[m];
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
                                说明：未自动检测时按当前 Model 测试；检测成功后「一键测试全部版本」会依次测试下列出的模型；点击右上角「保存」后记住结果。
                              </p>
                            </div>
                          </div>
                        ) : id === "openai" || id === "anthropic" || id === "doubao" || id === "kimi" ? (
                          (() => {
                            const cloudPresets =
                              id === "openai"
                                ? openaiPresetModels
                                : id === "anthropic"
                                  ? anthropicPresetModels
                                  : id === "doubao"
                                    ? doubaoPresetModels
                                    : kimiPresetModels;
                            const inPreset = cloudPresets.includes(cfg.model);
                            return (
                              <div style={{ display: "grid", gap: 8 }}>
                                {id === "doubao" ? (
                                  <label className="backend-field" style={{ margin: 0 }}>
                                    <div className="backend-label muted small">界面显示名（可选）</div>
                                    <input
                                      value={cfg.modelDisplayName ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value.trim();
                                        onChange(patchProviderConfig(settings, id, { modelDisplayName: v || undefined }));
                                      }}
                                      placeholder="仅 UI 展示；请求仍用下方 Model（如 ep-…）"
                                    />
                                  </label>
                                ) : null}
                                <select
                                  value={cfg.model}
                                  onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                                >
                                  {cloudPresets.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                  {cfg.model && !inPreset ? <option value={cfg.model}>{cfg.model}（当前）</option> : null}
                                </select>
                                <div className="backend-provider-actions">
                                  <button
                                    type="button"
                                    className="btn small"
                                    disabled={testState[id].status === "testing"}
                                    onClick={() => {
                                      setTestState((prev) => ({ ...prev, [id]: { status: "testing" } }));
                                      void (async () => {
                                        const model = cfg.model.trim() || cloudPresets[0]!;
                                        try {
                                          const cloudCfg = getProviderConfig(settings, id);
                                          if (id === "anthropic") {
                                            if (shouldUseRouterProtocol(cloudCfg)) {
                                              await testOpenAICompatibleModel({ cfg: cloudCfg, model });
                                            } else {
                                              await testAnthropicModel({ cfg: cloudCfg, model });
                                            }
                                          } else {
                                            await testOpenAICompatibleModel({
                                              cfg: cloudCfg,
                                              model,
                                            });
                                          }
                                          setTestState((prev) => ({ ...prev, [id]: { status: "ok", message: "连接成功" } }));
                                          setModelHealth((h) => ({
                                            ...h,
                                            [id]: { ...h[id], [model]: { verdict: "ok", testedAt: Date.now() } },
                                          }));
                                          setModelHealthDirty((d) => ({ ...d, [id]: true }));
                                        } catch (e) {
                                          const msg = e instanceof Error ? e.message : "连接失败";
                                          setTestState((prev) => ({ ...prev, [id]: { status: "err", message: msg } }));
                                          setModelHealth((h) => ({
                                            ...h,
                                            [id]: { ...h[id], [model]: { verdict: "err", testedAt: Date.now() } },
                                          }));
                                          setModelHealthDirty((d) => ({ ...d, [id]: true }));
                                        }
                                      })();
                                    }}
                                  >
                                    测试该模型版本
                                  </button>
                                  {testState[id].status === "ok" ? (
                                    <span className="backend-test backend-test--ok">可用</span>
                                  ) : null}
                                  {testState[id].status === "err" ? (
                                    <span className="backend-test backend-test--err">{testState[id].message}</span>
                                  ) : null}
                                </div>
                                <p className="muted small" style={{ margin: 0 }}>
                                  你也可以手动输入其它模型字符串（直接粘贴覆盖上方下拉所选值）。
                                </p>
                                <input
                                  value={cfg.model}
                                  onChange={(e) => onChange(patchProviderConfig(settings, id, { model: e.target.value }))}
                                  placeholder="当前默认 model"
                                />

                                <div style={{ marginTop: 8 }}>
                                  <div className="muted small" style={{ marginBottom: 6 }}>
                                    推荐模型
                                  </div>
                                  <div className="model-persona-grid">
                                    {listModelPersonas(id)
                                      .filter((p) => cloudPresets.includes(p.modelId))
                                      .map((p) => (
                                        <button
                                          key={p.modelId}
                                          type="button"
                                          className={"model-persona-card" + (cfg.model === p.modelId ? " is-on" : "")}
                                          onClick={() => onChange(patchProviderConfig(settings, id, { model: p.modelId }))}
                                          title={p.modelId}
                                        >
                                          <div className="model-persona-card-head">
                                            <div className="model-persona-card-title">{p.title}</div>
                                            <div className="model-persona-card-badges">
                                              {p.tags?.slice(0, 2).map((t) => (
                                                <span key={t} className="model-persona-badge muted small">
                                                  {t}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                          <div className="muted small">{p.subtitle}</div>
                                          <div className="model-persona-card-desc muted small">{p.description}</div>
                                          <div className="model-persona-card-foot muted small">
                                            <span className="model-persona-modelid">{p.modelId}</span>
                                            <span className="model-persona-cost">
                                              {Array.from({ length: p.costStars ?? 3 }).fill("★").join("")}
                                            </span>
                                          </div>
                                        </button>
                                      ))}
                                  </div>
                                </div>
                                <div className="backend-health">
                                  <div className="backend-health-head">
                                    <div style={{ fontWeight: 800 }}>本 App 可用版本（测试结果）</div>
                                    <div className="muted small">{modelHealthDirty[id] ? "（未保存）" : "（已保存）"}</div>
                                  </div>
                                  <div className="backend-health-list">
                                    {cloudPresets.map((m) => {
                                      const r = modelHealth[id]?.[m];
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
                                    说明：结果来源于你点击「测试该模型版本」或「一键测试全部版本」的实时请求；点击右上角「保存」后会被记住。
                                  </p>
                                </div>
                              </div>
                            );
                          })()
                        ) : null}
                      </label>
                    </div>
                  </section>
                );
              })()
            ) : null}
          </main>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

