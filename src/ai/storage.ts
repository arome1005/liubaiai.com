import type { AiSettings } from "./types";

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
      privacy: { ...d.privacy, ...(parsed.privacy ?? {}) },
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

