import type { AiChatMessage, AiGenerateResult, AiProviderConfig, AiProviderId } from "./types";

function requireKey(cfg: AiProviderConfig) {
  const k = (cfg.apiKey ?? "").trim();
  if (!k) throw new Error(`${cfg.label}：请先在「设置 → AI」填写 API Key`);
  return k;
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

/** 开发环境下：官方 MiMo 域名走 Vite 同源代理，避免 CORS 导致 Failed to fetch */
function xiaomiBaseUrlForRequest(stored: string): string {
  const t = stored.trim();
  const looksOfficial =
    t === "" ||
    /^https:\/\/api\.mimo-v2\.com\/v1\/?$/i.test(t) ||
    /^https:\/\/api\.xiaomimimo\.com\/v1\/?$/i.test(t);
  if (import.meta.env.DEV && looksOfficial && typeof window !== "undefined") {
    return `${window.location.origin}/__proxy/mimo-v2/v1`;
  }
  if (t) return t;
  return "https://api.mimo-v2.com/v1";
}

async function fetchOrThrowCorsHint(label: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        `${label} 网络请求失败（${e.message}）。纯前端跨域常被浏览器拦截；请本地使用 npm run dev（已对小米启用同源代理），线上部署需后端转发 API。`,
      );
    }
    throw e;
  }
}

/** OpenAI 兼容：仅 OpenAI 默认域名；其它提供方必须显式填写 Base URL，避免误打到 api.openai.com。 */
export function resolveOpenAiCompatibleBaseUrl(cfg: AiProviderConfig): string {
  const t = (cfg.baseUrl ?? "").trim();
  if (cfg.id === "xiaomi") {
    return xiaomiBaseUrlForRequest(t);
  }
  if (t) return t;
  if (cfg.id === "openai") return "https://api.openai.com/v1";
  throw new Error(`${cfg.label}：请先在「高级后端配置」填写 Base URL`);
}

/** 小米 MiMo 官方文档使用 max_completion_tokens（非 max_tokens），与部分 OpenAI 兼容实现不同 */
function openAiChatBody(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature: number,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: Math.min(2, Math.max(0, temperature)),
  };
  if (cfg.id === "xiaomi") {
    body.max_completion_tokens = 8192;
  }
  if (stream) body.stream = true;
  return body;
}

export async function generateWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): Promise<AiGenerateResult> {
  const { provider, config, messages } = args;
  if (provider === "ollama") return generateOllama(config, messages, args.temperature, args.signal);
  if (provider === "openai") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "doubao") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "zhipu") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "kimi") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "xiaomi") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "anthropic") return generateAnthropic(config, messages, args.temperature, args.signal);
  return generateGemini(config, messages, args.temperature, args.signal);
}

/**
 * 流式策略（侧栏/UI 均经此入口）：
 * - **真流式**（SSE / 可读器，`onDelta` 逐段）：OpenAI 兼容（含 openai / doubao / zhipu / kimi / xiaomi）、Ollama。
 * - **非流式回退**（整段 `generateWithProvider` 后一次性展示，可 `AbortSignal` 取消）：**anthropic**、**gemini**。后续可改为原生流式 API。
 */
export async function generateWithProviderStream(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  onDelta: (textDelta: string) => void;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<AiGenerateResult> {
  const { provider, config, messages, onDelta } = args;
  if (provider === "ollama") return generateOllamaStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "openai") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "doubao") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "zhipu") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "kimi") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "xiaomi") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  return generateWithProvider({ provider, config, messages, temperature: args.temperature, signal: args.signal });
}

async function generateOpenAI(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/chat/completions");
  const payload =
    cfg.id === "xiaomi"
      ? openAiChatBody(cfg, messages, temperature, false)
      : { model: cfg.model, messages, temperature };
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  const raw = await resp.json();
  if (!resp.ok) throw new Error(`${cfg.label} 请求失败：${raw?.error?.message ?? resp.status}`);
  const text = raw?.choices?.[0]?.message?.content ?? "";
  return { text, raw };
}

async function generateOpenAIStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/chat/completions");
  const payload =
    cfg.id === "xiaomi"
      ? openAiChatBody(cfg, messages, temperature, true)
      : { model: cfg.model, messages, temperature, stream: true };
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const raw = await resp.json().catch(() => ({}));
    throw new Error(`${cfg.label} 请求失败：${(raw as any)?.error?.message ?? resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error(`${cfg.label} 流式响应不可用`);
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  // SSE: data: {...}\n\n
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { text: full };
        }
        let obj: any;
        try {
          obj = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = obj?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
  }
  return { text: full };
}

async function generateAnthropic(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const url = joinUrl(cfg.baseUrl ?? "https://api.anthropic.com", "/v1/messages");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join("\n\n");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal,
  });
  const raw = await resp.json();
  if (!resp.ok) throw new Error(`Claude 请求失败：${raw?.error?.message ?? resp.status}`);
  const text = raw?.content?.[0]?.text ?? "";
  return { text, raw };
}

async function generateGemini(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com";
  const url = joinUrl(base, `/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(key)}`);
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }],
      generationConfig: { temperature },
    }),
    signal,
  });
  const raw = await resp.json();
  if (!resp.ok) throw new Error(`Gemini 请求失败：${raw?.error?.message ?? resp.status}`);
  const text = raw?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  return { text, raw };
}

async function generateOllama(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const base = cfg.baseUrl ?? "http://localhost:11434";
  const url = joinUrl(base, "/api/chat");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      messages,
      options: { temperature },
    }),
    signal,
  });
  const raw = await resp.json();
  if (!resp.ok) throw new Error(`Ollama 请求失败：${raw?.error ?? resp.status}`);
  const text = raw?.message?.content ?? "";
  return { text, raw };
}

async function generateOllamaStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const base = cfg.baseUrl ?? "http://localhost:11434";
  const url = joinUrl(base, "/api/chat");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages,
      options: { temperature },
    }),
    signal,
  });
  if (!resp.ok) {
    const raw = await resp.json().catch(() => ({}));
    throw new Error(`Ollama 请求失败：${(raw as any)?.error ?? resp.status}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Ollama 流式响应不可用");
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let obj: any;
      try {
        obj = JSON.parse(t);
      } catch {
        continue;
      }
      const delta = obj?.message?.content ?? "";
      if (delta) {
        full += delta;
        onDelta(delta);
      }
      if (obj?.done) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { text: full, raw: obj };
      }
    }
  }
  return { text: full };
}

