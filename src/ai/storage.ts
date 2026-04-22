import type { AiSettings } from "./types";
import type { AiProviderConfig, AiProviderId } from "./types";

const KEY = "liubai:aiSettings";
const GATE_KEY = "liubai:firstAiUseGateCompleted";

export const AI_SETTINGS_UPDATED_EVENT = "liubai:aiSettingsUpdated";

const CLOUD_TEMPERATURE_PROVIDER_IDS: AiProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "doubao",
  "zhipu",
  "kimi",
  "xiaomi",
];

function clampTemperature(v: number): number {
  if (!Number.isFinite(v)) return 0.7;
  return Math.max(0.1, Math.min(2.0, v));
}

function normalizeTemperatureByProvider(
  parsed: Partial<AiSettings> | undefined,
  fallbackBase: number,
): AiSettings["temperatureByProvider"] {
  const base = clampTemperature(fallbackBase);
  const raw = (parsed?.temperatureByProvider ?? {}) as Partial<Record<AiProviderId, number>>;
  const out: NonNullable<NonNullable<AiSettings["temperatureByProvider"]>> = {};

  // 仅持久化“显式覆盖”的温度；未覆盖的提供方走 `geminiTemperature`（兼容旧版全局温度语义）
  for (const id of CLOUD_TEMPERATURE_PROVIDER_IDS) {
    const v = raw[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      const cv = clampTemperature(v);
      if (Math.abs(cv - base) > 1e-9) out[id] = cv;
    }
  }

  return Object.keys(out).length ? out : undefined;
}

function dispatchAiSettingsUpdated() {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_UPDATED_EVENT));
  } catch {
    /* ignore */
  }
}

export function defaultAiSettings(): AiSettings {
  return {
    provider: "ollama",
    openai: { id: "openai", label: "OpenAI", model: "gpt-4.1-mini", embeddingModel: "text-embedding-3-small", baseUrl: "https://api.openai.com/v1" },
    anthropic: { id: "anthropic", label: "Claude", model: "claude-3-5-sonnet-latest", baseUrl: "https://api.anthropic.com" },
    gemini: { id: "gemini", label: "Gemini", model: "gemini-2.0-flash", baseUrl: "https://generativelanguage.googleapis.com" },
    ollama: { id: "ollama", label: "Ollama", model: "llama3.1:8b", baseUrl: "http://localhost:11434" },
    // MLX LM / 兼容服务常见为 OpenAI 式 /v1；端口以本机实际为准
    mlx: { id: "mlx", label: "Apple MLX", model: "default", baseUrl: "http://127.0.0.1:8080/v1" },
    // 豆包（火山引擎 Ark）通常提供 OpenAI 兼容接口（/chat/completions）。
    // 注意：不同账号/区域的 baseUrl 与 model 命名可能不同，可在设置中覆盖。
    doubao: { id: "doubao", label: "豆包", model: "doubao-seed-1.6", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
    // 智谱：OpenAI 兼容（/chat/completions）；模型 ID 以 docs.bigmodel.cn 为准（如 glm-5、glm-4.7、glm-4.7-flash）。
    zhipu: { id: "zhipu", label: "智谱", model: "glm-4.7-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    // Kimi（月之暗面）：OpenAI 兼容。
    kimi: { id: "kimi", label: "Kimi", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1" },
    // 小米 MiMo：OpenAI 兼容，官方 Base 为 https://api.mimo-v2.com/v1（文档见 mimo-v2.com）
    xiaomi: { id: "xiaomi", label: "小米", model: "mimo-v2-flash", baseUrl: "https://api.mimo-v2.com/v1" },
    privacy: {
      consentAccepted: false,
      allowCloudProviders: false,
      allowMetadata: true,
      allowChapterContent: false,
      allowSelection: false,
      allowRecentSummaries: false,
      allowBible: false,
      allowLinkedExcerpts: false,
      allowRagSnippets: false,
    },
    includeBible: true,
    maxContextChars: 24000,
    // 各云端模型共用；与弹窗「神思」及字数消耗星级联动；默认落在 0.1–0.7 档（三颗星）
    geminiTemperature: 0.7,
    injectApproxTokenThreshold: 12_000,
    injectConfirmOnOversizeTokens: true,
    injectConfirmCloudBible: true,
    toneDriftHintEnabled: true,
    highRiskAlwaysConfirm: true,
    aiSessionApproxTokenBudget: 0,
    dailyTokenBudget: 0,
    singleCallWarnTokens: 0,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAiSettings();
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const px = parsed as unknown as Record<string, unknown>;
    const d = defaultAiSettings();
    const geminiTemperature =
      typeof px.geminiTemperature === "number" && Number.isFinite(px.geminiTemperature)
        ? Math.max(0.1, Math.min(2.0, px.geminiTemperature))
        : d.geminiTemperature;
    return {
      ...d,
      ...parsed,
      openai: { ...d.openai, ...(parsed.openai ?? {}) },
      anthropic: { ...d.anthropic, ...(parsed.anthropic ?? {}) },
      gemini: { ...d.gemini, ...(parsed.gemini ?? {}) },
      ollama: { ...d.ollama, ...(parsed.ollama ?? {}) },
      mlx: { ...d.mlx, ...(parsed.mlx ?? {}) },
      doubao: { ...d.doubao, ...(parsed.doubao ?? {}) },
      zhipu: (() => {
        const zp = { ...d.zhipu, ...(parsed.zhipu ?? {}) };
        if (!(zp.baseUrl ?? "").trim()) zp.baseUrl = d.zhipu.baseUrl;
        if (!(zp.model ?? "").trim()) zp.model = d.zhipu.model;
        const m = (zp.model ?? "").trim();
        // 旧版 GLM-4 Flash 系列默认迁到文档中的 GLM-4.7-Flash（免费普惠）
        if (m === "glm-4-flash" || m === "glm-4-flash-250414") zp.model = "glm-4.7-flash";
        return zp;
      })(),
      kimi: { ...d.kimi, ...(parsed.kimi ?? {}) },
      xiaomi: (() => {
        const xm = { ...d.xiaomi, ...(parsed.xiaomi ?? {}) };
        if (!(xm.baseUrl ?? "").trim()) xm.baseUrl = d.xiaomi.baseUrl;
        if (!(xm.model ?? "").trim()) xm.model = d.xiaomi.model;
        const bu = (xm.baseUrl ?? "").trim();
        if (/^https?:\/\/api\.xiaomimimo\.com/i.test(bu)) {
          xm.baseUrl = d.xiaomi.baseUrl;
        }
        return xm;
      })(),
      privacy: (() => {
        const p = { ...d.privacy, ...(parsed.privacy ?? {}) };
        // 迁移：已通过首次 AI 确认弹窗的用户，自动开启云端权限
        if (localStorage.getItem(GATE_KEY) === "1") {
          p.consentAccepted = true;
          p.allowCloudProviders = true;
          p.allowMetadata = true;
          p.allowChapterContent = true;
        }
        return p;
      })(),
      geminiTemperature,
      temperatureByProvider: normalizeTemperatureByProvider(parsed, geminiTemperature),
      injectApproxTokenThreshold:
        typeof px.injectApproxTokenThreshold === "number" && Number.isFinite(px.injectApproxTokenThreshold)
          ? Math.max(0, Math.min(500_000, Math.floor(px.injectApproxTokenThreshold)))
          : d.injectApproxTokenThreshold,
      injectConfirmOnOversizeTokens:
        typeof px.injectConfirmOnOversizeTokens === "boolean"
          ? px.injectConfirmOnOversizeTokens
          : d.injectConfirmOnOversizeTokens,
      injectConfirmCloudBible:
        typeof px.injectConfirmCloudBible === "boolean"
          ? px.injectConfirmCloudBible
          : d.injectConfirmCloudBible,
      toneDriftHintEnabled:
        typeof px.toneDriftHintEnabled === "boolean" ? px.toneDriftHintEnabled : d.toneDriftHintEnabled,
      highRiskAlwaysConfirm:
        typeof px.highRiskAlwaysConfirm === "boolean" ? px.highRiskAlwaysConfirm : d.highRiskAlwaysConfirm,
      aiSessionApproxTokenBudget:
        typeof px.aiSessionApproxTokenBudget === "number" && Number.isFinite(px.aiSessionApproxTokenBudget)
          ? Math.max(0, Math.min(2_000_000, Math.floor(px.aiSessionApproxTokenBudget)))
          : d.aiSessionApproxTokenBudget,
      dailyTokenBudget:
        typeof px.dailyTokenBudget === "number" && Number.isFinite(px.dailyTokenBudget)
          ? Math.max(0, Math.min(10_000_000, Math.floor(px.dailyTokenBudget)))
          : d.dailyTokenBudget,
      singleCallWarnTokens:
        typeof px.singleCallWarnTokens === "number" && Number.isFinite(px.singleCallWarnTokens)
          ? Math.max(0, Math.min(500_000, Math.floor(px.singleCallWarnTokens)))
          : d.singleCallWarnTokens,
    };
  } catch {
    return defaultAiSettings();
  }
}

export function saveAiSettings(next: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    dispatchAiSettingsUpdated();
  } catch {
    /* ignore */
  }
}

export type BackendModelConfig = Record<AiProviderId, Pick<AiProviderConfig, "baseUrl" | "apiKey">>;

/**
 * 供其它页面/组件读取"后端模型配置"（Base URL / API Key）。
 * 注意：本项目目前为纯前端直连，密钥存放在 localStorage。
 */
export function getBackendConfig(): BackendModelConfig {
  const s = loadAiSettings();
  return {
    openai: { baseUrl: s.openai.baseUrl, apiKey: s.openai.apiKey },
    anthropic: { baseUrl: s.anthropic.baseUrl, apiKey: s.anthropic.apiKey },
    gemini: { baseUrl: s.gemini.baseUrl, apiKey: s.gemini.apiKey },
    doubao: { baseUrl: s.doubao.baseUrl, apiKey: s.doubao.apiKey },
    zhipu: { baseUrl: s.zhipu.baseUrl, apiKey: s.zhipu.apiKey },
    kimi: { baseUrl: s.kimi.baseUrl, apiKey: s.kimi.apiKey },
    xiaomi: { baseUrl: s.xiaomi.baseUrl, apiKey: s.xiaomi.apiKey },
    ollama: { baseUrl: s.ollama.baseUrl, apiKey: s.ollama.apiKey },
    mlx: { baseUrl: s.mlx.baseUrl, apiKey: s.mlx.apiKey },
  };
}

export function getProviderConfig(s: AiSettings, id: AiProviderId): AiProviderConfig {
  switch (id) {
    case "openai":
      return s.openai;
    case "anthropic":
      return s.anthropic;
    case "gemini":
      return s.gemini;
    case "doubao":
      return s.doubao;
    case "zhipu":
      return s.zhipu;
    case "kimi":
      return s.kimi;
    case "xiaomi":
      return s.xiaomi;
    case "ollama":
      return s.ollama;
    case "mlx":
      return s.mlx;
  }
}

export function patchProviderConfig(s: AiSettings, id: AiProviderId, patch: Partial<AiProviderConfig>): AiSettings {
  const cur = getProviderConfig(s, id);
  const next = { ...cur, ...patch };
  return { ...s, [id]: next } as AiSettings;
}

export function getProviderTemperature(s: AiSettings, id: AiProviderId): number {
  const base = clampTemperature(s.geminiTemperature);
  const map = s.temperatureByProvider ?? {};
  const v = map[id];
  if (typeof v === "number" && Number.isFinite(v)) return clampTemperature(v);
  return base;
}

export function patchProviderTemperature(s: AiSettings, id: AiProviderId, temperature: number): AiSettings {
  const t = clampTemperature(temperature);
  const base = clampTemperature(s.geminiTemperature);
  const prev = { ...(s.temperatureByProvider ?? {}) } as Partial<Record<AiProviderId, number>>;
  const nextMap: Partial<Record<AiProviderId, number>> = { ...prev };

  // 与全局默认一致则删除覆盖项，避免无意义膨胀
  if (Math.abs(t - base) <= 1e-9) delete nextMap[id];
  else nextMap[id] = t;

  const cleaned = normalizeTemperatureByProvider({ temperatureByProvider: nextMap } as Partial<AiSettings>, base);

  // 兼容旧逻辑：调整温度时同步更新全局 geminiTemperature（历史上 UI 只维护这一份）
  return { ...s, geminiTemperature: t, temperatureByProvider: cleaned };
}

