import type { AiSettings } from "./types";
import type { AiProviderConfig, AiProviderId } from "./types";

const KEY = "liubai:aiSettings";

export function defaultAiSettings(): AiSettings {
  return {
    provider: "ollama",
    openai: { id: "openai", label: "OpenAI", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1" },
    anthropic: { id: "anthropic", label: "Claude", model: "claude-3-5-sonnet-latest", baseUrl: "https://api.anthropic.com" },
    gemini: { id: "gemini", label: "Gemini", model: "gemini-2.0-flash", baseUrl: "https://generativelanguage.googleapis.com" },
    ollama: { id: "ollama", label: "Ollama", model: "llama3.1:8b", baseUrl: "http://localhost:11434" },
    // 豆包（火山引擎 Ark）通常提供 OpenAI 兼容接口（/chat/completions）。
    // 注意：不同账号/区域的 baseUrl 与 model 命名可能不同，可在设置中覆盖。
    doubao: { id: "doubao", label: "豆包", model: "doubao-seed-1.6", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
    // 智谱：OpenAI 兼容（/chat/completions），以 open.bigmodel.cn 文档为准。
    zhipu: { id: "zhipu", label: "智谱", model: "glm-4-flash", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    // Kimi（月之暗面）：OpenAI 兼容。
    kimi: { id: "kimi", label: "Kimi", model: "moonshot-v1-8k", baseUrl: "https://api.moonshot.cn/v1" },
    // 小米：若官方提供 OpenAI 兼容入口，请将 Base URL 填为文档中的根路径（通常含 /v1）。
    xiaomi: { id: "xiaomi", label: "小米", model: "mimo-v2-flash", baseUrl: "" },
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
    geminiTemperature: 1.2,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAiSettings();
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const d = defaultAiSettings();
    return {
      ...d,
      ...parsed,
      openai: { ...d.openai, ...(parsed.openai ?? {}) },
      anthropic: { ...d.anthropic, ...(parsed.anthropic ?? {}) },
      gemini: { ...d.gemini, ...(parsed.gemini ?? {}) },
      ollama: { ...d.ollama, ...(parsed.ollama ?? {}) },
      doubao: { ...d.doubao, ...(parsed.doubao ?? {}) },
      zhipu: { ...d.zhipu, ...(parsed.zhipu ?? {}) },
      kimi: { ...d.kimi, ...(parsed.kimi ?? {}) },
      xiaomi: { ...d.xiaomi, ...(parsed.xiaomi ?? {}) },
      privacy: { ...d.privacy, ...(parsed.privacy ?? {}) },
      geminiTemperature:
        typeof (parsed as any).geminiTemperature === "number" && Number.isFinite((parsed as any).geminiTemperature)
          ? Math.max(0.1, Math.min(2.0, (parsed as any).geminiTemperature))
          : d.geminiTemperature,
    };
  } catch {
    return defaultAiSettings();
  }
}

export function saveAiSettings(next: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export type BackendModelConfig = Record<AiProviderId, Pick<AiProviderConfig, "baseUrl" | "apiKey">>;

/**
 * 供其它页面/组件读取“后端模型配置”（Base URL / API Key）。
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
  }
}

export function patchProviderConfig(s: AiSettings, id: AiProviderId, patch: Partial<AiProviderConfig>): AiSettings {
  const cur = getProviderConfig(s, id);
  const next = { ...cur, ...patch };
  return { ...s, [id]: next } as AiSettings;
}

