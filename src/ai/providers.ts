import { apiUrl } from "../api/base";
import type { AiChatMessage, AiGenerateResult, AiProviderConfig, AiProviderId } from "./types";
import { addSidecarDailyTokens } from "../util/owner-mode";
import { approxRoughTokenCount } from "./approx-tokens";
import {
  anthropicMessageTextFromJson,
  geminiGenerateTextFromJson,
  messageFromApiJsonBody,
  ollamaChatTextFromJson,
  ollamaStreamLinePayload,
  openAiChatTextFromJson,
  openAiStreamDataDeltaContent,
  openAiStreamUsageTotalFromDataLine,
  openAiUsageTotalTokensFromJson,
} from "../util/parse-api-json";

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

function isOpenRouterBaseUrl(baseUrl: string | undefined | null): boolean {
  const t = (baseUrl ?? "").trim().toLowerCase();
  if (!t) return false;
  return t.includes("openrouter.ai");
}

/** 直连 Google Gemini 的 API 根（不含路径）；优先 `baseUrlNative`，否则在非网关的 `baseUrl` 上回落，再到官方默认。 */
export function resolveGeminiNativeApiBaseUrl(cfg: AiProviderConfig): string {
  const n = (cfg.baseUrlNative ?? "").trim();
  if (n) return n.replace(/\/+$/, "");
  const b = (cfg.baseUrl ?? "").trim();
  if (b && !isOpenRouterBaseUrl(b)) return b.replace(/\/+$/, "");
  return "https://generativelanguage.googleapis.com";
}

/** 直连 Anthropic Messages 的 API 根；规则同 {@link resolveGeminiNativeApiBaseUrl}。 */
export function resolveAnthropicNativeMessagesBaseUrl(cfg: AiProviderConfig): string {
  const n = (cfg.baseUrlNative ?? "").trim();
  if (n) return n.replace(/\/+$/, "");
  const b = (cfg.baseUrl ?? "").trim();
  if (b && !isOpenRouterBaseUrl(b)) return b.replace(/\/+$/, "");
  return "https://api.anthropic.com";
}

/** 是否走 OpenAI 兼容网关（如 OpenRouter）；供高级后端配置 UI 与测试逻辑复用 */
export function shouldUseRouterProtocol(cfg: AiProviderConfig): boolean {
  if (cfg.transport === "router") return true;
  if (cfg.transport === "native") return false;
  // 兼容旧配置：未设置 transport 时，仍按 baseUrl 推断
  return isOpenRouterBaseUrl(cfg.baseUrl);
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

const DOUBAO_ARK_DEFAULT = "https://ark.cn-beijing.volces.com/api/v3";

/** 豆包/火山 Ark：与小米类似，官方域名常不返回可跨域的 CORS；经同源 /__proxy 或 /api 转发。 */
function isDoubaoVolcesArkBaseUrlForProxy(u: string): boolean {
  const s = u.trim();
  if (!s) return true;
  try {
    const x = new URL(s);
    return /^ark\.[a-z0-9.-]+\.volces\.com$/i.test(x.hostname);
  } catch {
    return false;
  }
}

function doubaoBaseUrlForRequest(stored: string): string {
  const t = (stored || "").trim() || DOUBAO_ARK_DEFAULT;
  if (typeof window === "undefined") return t;
  if (!isDoubaoVolcesArkBaseUrlForProxy(t)) return t;
  const path = new URL(t).pathname.replace(/\/+$/, "") || "/api/v3";
  if (import.meta.env.DEV) {
    return `${window.location.origin}/__proxy/doubao-ark${path}`;
  }
  return apiUrl(`/api/proxy/doubao-ark${path}`);
}

async function fetchOrThrowCorsHint(label: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (e instanceof TypeError) {
      const isDoubao =
        label.includes("豆包") ||
        label.includes("燎原") ||
        url.includes("doubao-ark") ||
        (url.includes("volces.com") && url.includes("/api/"));
      const hint = isDoubao
        ? `${label} 网络请求失败（${e.message}）。豆包/火山 API 在浏览器中常被 CORS 拦截。本地请用 npm run dev（已走 Vite 代理）；生产请把 Nginx/网关将 /api 反代到本项目的 backend 服务，使 /api/proxy/doubao-ark 可访问。若 Base URL 改为 OpenRouter 等非火山域名，则按该域名的 CORS/访问规则。`
        : `${label} 网络请求失败（${e.message}）。纯前端跨域常被浏览器拦截；请本地使用 npm run dev（已对小米/豆包等启用同源代理），线上需后端转发 /api 代理（含豆包 Volc 转发）后再由浏览器只访问同源。`;
      throw new Error(hint);
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
  if (cfg.id === "mlx") {
    if (t) return t;
    return "http://127.0.0.1:8080/v1";
  }
  if (cfg.id === "doubao") {
    return doubaoBaseUrlForRequest(t);
  }
  if (t) return t;
  if (cfg.id === "openai") return "https://api.openai.com/v1";
  throw new Error(`${cfg.label}：请先在「高级后端配置」填写 Base URL`);
}

/** OpenAI 兼容请求：MLX 本地可空 Key；其余必须填写 */
function bearerTokenForOpenAiCompatible(cfg: AiProviderConfig): string | undefined {
  const k = (cfg.apiKey ?? "").trim();
  if (cfg.id === "mlx") return k || undefined;
  if (!k) throw new Error(`${cfg.label}：请先在「设置 → AI」填写 API Key`);
  return k;
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
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
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
  if (provider === "claude-code-local") return generateClaudeCodeLocal(config, messages, args.signal);
  if (provider === "ollama") return generateOllama(config, messages, args.temperature, args.signal);
  if (provider === "mlx") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "openai") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "doubao") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "zhipu") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "kimi") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "xiaomi") return generateOpenAI(config, messages, args.temperature, args.signal);
  if (provider === "anthropic") {
    // Claude 双协议：
    // - OpenRouter：走 OpenAI 兼容 /chat/completions（model 需填 anthropic/...）
    // - 直连：走 Anthropic /v1/messages
    if (shouldUseRouterProtocol(config)) return generateOpenAI(config, messages, args.temperature, args.signal);
    return generateAnthropic(config, messages, args.temperature, args.signal);
  }
  if (provider === "gemini") {
    // Gemini 双协议：
    // - OpenRouter：走 OpenAI 兼容 /chat/completions（model 需填 google/...）
    // - 直连：走 Google Gemini 原生 /v1beta
    if (shouldUseRouterProtocol(config)) return generateOpenAI(config, messages, args.temperature, args.signal);
    return generateGemini(config, messages, args.temperature, args.signal);
  }
  return generateGemini(config, messages, args.temperature, args.signal);
}

/**
 * 流式策略（侧栏/UI 均经此入口）：
 * - **真流式**（SSE / 可读器，`onDelta` 逐段）：OpenAI 兼容、Ollama、**Anthropic Messages**、**Gemini `streamGenerateContent?alt=sse`**。
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
  if (provider === "claude-code-local") return generateClaudeCodeLocalStream(config, messages, onDelta, args.signal);
  if (provider === "ollama") return generateOllamaStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "mlx") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "openai") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "doubao") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "zhipu") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "kimi") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "xiaomi") return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
  if (provider === "anthropic") {
    if (shouldUseRouterProtocol(config)) return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
    return generateAnthropicStream(config, messages, onDelta, args.temperature, args.signal);
  }
  if (provider === "gemini") {
    if (shouldUseRouterProtocol(config)) return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal);
    return generateGeminiStream(config, messages, onDelta, args.temperature, args.signal);
  }
  const r = await generateWithProvider({ provider, config, messages, temperature: args.temperature, signal: args.signal });
  if (r.text) onDelta(r.text);
  return r;
}

export async function embedWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  input: string;
  signal?: AbortSignal;
}): Promise<{ embedding: number[] }> {
  const { provider, config } = args;
  if (provider === "openai" || provider === "doubao" || provider === "zhipu" || provider === "kimi" || provider === "xiaomi") {
    return embedOpenAICompatible(config, args.input, args.signal);
  }
  throw new Error(`${config.label}：该提供方暂不支持 embedding 调用（用于调性提示距离）。`);
}

async function embedOpenAICompatible(cfg: AiProviderConfig, input: string, signal?: AbortSignal): Promise<{ embedding: number[] }> {
  const key = requireKey(cfg);
  const model = (cfg.embeddingModel ?? "").trim();
  if (!model) throw new Error(`${cfg.label}：请先在「高级后端配置」填写 Embedding Model`);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/embeddings");
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, input }),
    signal,
  });
  const raw: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`${cfg.label} embedding 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null;
  if (!Array.isArray(data) || data.length === 0) throw new Error(`${cfg.label} embedding 响应无 data`);
  const emb = (data[0] as { embedding?: unknown }).embedding;
  if (!Array.isArray(emb)) throw new Error(`${cfg.label} embedding 响应无 embedding`);
  const out: number[] = [];
  for (const n of emb) {
    if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`${cfg.label} embedding 包含非法数值`);
    out.push(n);
  }
  if (out.length < 8) throw new Error(`${cfg.label} embedding 维度异常`);
  return { embedding: out };
}

async function generateOpenAI(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const token = bearerTokenForOpenAiCompatible(cfg);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/chat/completions");
  const payload =
    cfg.id === "xiaomi"
      ? openAiChatBody(cfg, messages, temperature, false)
      : { model: cfg.model, messages, temperature };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`${cfg.label} 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const raw: unknown = await resp.json();
  const text = openAiChatTextFromJson(raw);
  const usageTotalTokens = openAiUsageTotalTokensFromJson(raw) ?? undefined;
  return { text, raw, usageTotalTokens };
}

async function generateOpenAIStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const token = bearerTokenForOpenAiCompatible(cfg);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/chat/completions");
  const payload =
    cfg.id === "xiaomi"
      ? openAiChatBody(cfg, messages, temperature, true)
      : {
          model: cfg.model,
          messages,
          temperature: Math.min(2, Math.max(0, temperature)),
          stream: true,
          stream_options: { include_usage: true },
        };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`${cfg.label} 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error(`${cfg.label} 流式响应不可用`);
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  let lastUsageTotal: number | undefined;
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
        const ut = openAiStreamUsageTotalFromDataLine(data);
        if (ut != null) lastUsageTotal = ut;
        if (data === "[DONE]") {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { text: full, usageTotalTokens: lastUsageTotal };
        }
        const delta = openAiStreamDataDeltaContent(data);
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
  }
  return { text: full, usageTotalTokens: lastUsageTotal };
}

/** 与历史非流式请求一致：system 合并；其余角色拼成单条 user（多轮为 USER:/ASSISTANT: 前缀） */
function anthropicSystemAndUserText(messages: AiChatMessage[]): { system: string; user: string } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join("\n\n");
  return { system, user };
}

function anthropicStreamErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if ((data as { type?: string }).type !== "error") return null;
  const err = (data as { error?: unknown }).error;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Claude 流式错误";
}

/** Anthropic Messages SSE：`event:` + `data:` JSON，文本增量在 `content_block_delta.delta.text` */
function anthropicTextDeltaFromStreamEvent(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  if ((data as { type?: string }).type !== "content_block_delta") return "";
  const delta = (data as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return "";
  if ((delta as { type?: string }).type !== "text_delta") return "";
  const t = (delta as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

async function generateAnthropic(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const url = joinUrl(resolveAnthropicNativeMessagesBaseUrl(cfg), "/v1/messages");
  const { system, user } = anthropicSystemAndUserText(messages);
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
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Claude 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const raw: unknown = await resp.json();
  const text = anthropicMessageTextFromJson(raw);
  return { text, raw };
}

async function generateAnthropicStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const url = joinUrl(resolveAnthropicNativeMessagesBaseUrl(cfg), "/v1/messages");
  const { system, user } = anthropicSystemAndUserText(messages);
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
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
      stream: true,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal,
  });
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Claude 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Claude 流式响应不可用");
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      const dataLines = lines.filter((l) => l.trimStart().startsWith("data:"));
      if (dataLines.length === 0) continue;
      const payload = dataLines
        .map((l) => l.trim().replace(/^data:\s?/, ""))
        .join("\n")
        .trim();
      if (!payload || payload === "[DONE]") continue;
      let data: unknown;
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }
      const errMsg = anthropicStreamErrorMessage(data);
      if (errMsg) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error(`Claude 流式失败：${errMsg}`);
      }
      const delta = anthropicTextDeltaFromStreamEvent(data);
      if (delta) {
        full += delta;
        onDelta(delta);
      }
    }
  }
  return { text: full };
}

function geminiGenerateJsonBody(messages: AiChatMessage[], temperature: number): Record<string, unknown> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");
  return {
    contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }],
    generationConfig: { temperature },
  };
}

/** Gemini `streamGenerateContent?alt=sse`：每个 `data:` 为 JSON，增量文本用 `geminiGenerateTextFromJson` 抽取 */
function geminiEmitStreamDeltas(parsed: unknown, onDelta: (s: string) => void): void {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const t = geminiGenerateTextFromJson(item);
    if (t) onDelta(t);
  }
}

async function generateGemini(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const base = resolveGeminiNativeApiBaseUrl(cfg);
  const url = joinUrl(base, `/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(key)}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiGenerateJsonBody(messages, temperature)),
    signal,
  });
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Gemini 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const raw: unknown = await resp.json();
  const text = geminiGenerateTextFromJson(raw);
  return { text, raw };
}

async function generateGeminiStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const key = requireKey(cfg);
  const base = resolveGeminiNativeApiBaseUrl(cfg);
  const url = joinUrl(
    base,
    `/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
  );
  const resp = await fetchOrThrowCorsHint(cfg.label, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiGenerateJsonBody(messages, temperature)),
    signal,
  });
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Gemini 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Gemini 流式响应不可用");
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      const dataLines = lines.filter((l) => l.trimStart().startsWith("data:"));
      if (dataLines.length === 0) continue;
      const payload = dataLines
        .map((l) => l.trim().replace(/^data:\s?/, ""))
        .join("\n")
        .trim();
      if (!payload || payload === "[DONE]") continue;
      let data: unknown;
      try {
        data = JSON.parse(payload);
      } catch {
        continue;
      }
      if (data && typeof data === "object" && "error" in data) {
        const msg = messageFromApiJsonBody(data);
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error(`Gemini 流式失败：${msg || "未知错误"}`);
      }
      geminiEmitStreamDeltas(data, (d) => {
        full += d;
        onDelta(d);
      });
    }
  }
  return { text: full };
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
  if (!resp.ok) {
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Ollama 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
  }
  const raw: unknown = await resp.json();
  const text = ollamaChatTextFromJson(raw);
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
    const raw: unknown = await resp.json().catch(() => ({}));
    throw new Error(`Ollama 请求失败：${messageFromApiJsonBody(raw) || String(resp.status)}`);
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
      let obj: unknown;
      try {
        obj = JSON.parse(t);
      } catch {
        continue;
      }
      const { delta, done } = ollamaStreamLinePayload(obj);
      if (delta) {
        full += delta;
        onDelta(delta);
      }
      if (done) {
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



/* =============================================================================
 * Claude Code 本地 sidecar（owner-only）
 * 通过 http://127.0.0.1:7788 SSE，把作者本人的 Pro/Max 订阅当 AI 后端用。
 * 仅当 owner 邮箱 + Owner 模式开关 + sidecar 健康时，会被 src/ai/client.ts 路由到。
 * =========================================================================== */

function resolveSidecarBaseUrl(cfg: AiProviderConfig): string {
  const t = (cfg.baseUrl ?? "").trim();
  return (t || "http://127.0.0.1:7788").replace(/\/+$/, "");
}

function buildClaudeCodeLocalBody(messages: AiChatMessage[], model: string) {
  const systemMsg = messages.find((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");
  return {
    system: systemMsg?.content,
    messages: turns.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    model,
  };
}

async function generateClaudeCodeLocal(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  let acc = "";
  const result = await generateClaudeCodeLocalStream(cfg, messages, (d) => {
    acc += d;
  }, signal);
  return result;
}

async function generateClaudeCodeLocalStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  signal?: AbortSignal,
): Promise<AiGenerateResult> {
  const token = (cfg.apiKey ?? "").trim();
  if (!token) {
    throw new Error("Claude Code 本地直连：请先在「设置 → Owner 模式」填入 sidecar Token");
  }
  // 估算输入 tokens（在发送前计算）
  const inputApprox = messages.reduce((sum, m) => sum + approxRoughTokenCount(m.content), 0);
  const url = `${resolveSidecarBaseUrl(cfg)}/v1/stream`;
  const body = buildClaudeCodeLocalBody(messages, cfg.model || "sonnet");

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(
      `Claude Code 本地 sidecar 不可达：${e instanceof Error ? e.message : String(e)}。请确认 npm run sidecar 已启动。`,
    );
  }
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    if (resp.status === 401) {
      throw new Error("Claude Code 本地 sidecar：Token 无效，请重新粘贴。");
    }
    throw new Error(`Claude Code 本地 sidecar 返回 ${resp.status}: ${t || resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let acc = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = chunk
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          const outputApprox = approxRoughTokenCount(acc);
          addSidecarDailyTokens(inputApprox, outputApprox);
          return { text: acc, usageTotalTokens: inputApprox + outputApprox };
        }
        let ev: { type?: string; text?: string; message?: string };
        try {
          ev = JSON.parse(data) as typeof ev;
        } catch {
          continue;
        }
        if (ev.type === "delta" && typeof ev.text === "string") {
          acc += ev.text;
          onDelta(ev.text);
        } else if (ev.type === "error") {
          throw new Error(`Claude Code 本地 sidecar 错误：${ev.message ?? "unknown"}`);
        } else if (ev.type === "done") {
          const outputApprox = approxRoughTokenCount(acc);
          addSidecarDailyTokens(inputApprox, outputApprox);
          return { text: acc, usageTotalTokens: inputApprox + outputApprox };
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  // stream 正常结束但未收到 done 事件（兜底）
  const outputApprox = approxRoughTokenCount(acc);
  if (acc) addSidecarDailyTokens(inputApprox, outputApprox);
  return { text: acc, usageTotalTokens: inputApprox + outputApprox };
}
