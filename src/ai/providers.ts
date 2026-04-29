import { apiUrl } from "../api/base";
import { clampStreamMaxOutputTokens } from "./writing-body-output-budget";
import type { AiChatMessage, AiGenerateResult, AiProviderConfig, AiProviderId } from "./types";
import { finalUsageForGenerate } from "./token-usage-helpers";
import { generateClaudeCodeLocal, generateClaudeCodeLocalStream } from "./providers-sidecar";
import {
  anthropicMessageTextFromJson,
  anthropicUsageFromJsonMessagesResponse,
  anthropicUsageFromStreamData,
  geminiGenerateTextFromJson,
  geminiUsageFromJsonRoot,
  messageFromApiJsonBody,
  ollamaChatTextFromJson,
  ollamaStreamLinePayload,
  ollamaTokenUsageFromJson,
  openAiChatTextFromJson,
  openAiStreamDataDeltaContent,
  openAiStreamUsageFromDataLine,
  openAiStyleUsageFromJsonRoot,
  type OpenAiStyleUsage,
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

/**
 * 开发环境下：将官方 MiMo 域名映射到对应同源代理，避免浏览器 CORS 拦截。
 *
 * 支持两类官方 Base URL：
 *  - 通用：`api.mimo-v2.com/v1` / `api.xiaomimimo.com/v1`
 *  - Token Plan 套餐专属：`token-plan-{cn,sgp,ams}.xiaomimimo.com/v1`
 *    （Token Plan 的 API Key 仅在专属域名下有效，**不能**回退到 api.mimo-v2.com）
 */
function xiaomiBaseUrlForRequest(stored: string): string {
  const t = stored.trim();
  const isApiOfficial =
    t === "" ||
    /^https:\/\/api\.mimo-v2\.com\/v1\/?$/i.test(t) ||
    /^https:\/\/api\.xiaomimimo\.com\/v1\/?$/i.test(t);
  const tokenPlanMatch = t.match(
    /^https:\/\/token-plan-(cn|sgp|ams)\.xiaomimimo\.com\/v1\/?$/i,
  );
  if (import.meta.env.DEV && typeof window !== "undefined") {
    if (tokenPlanMatch) {
      const region = tokenPlanMatch[1].toLowerCase();
      return `${window.location.origin}/__proxy/mimo-tp-${region}/v1`;
    }
    if (isApiOfficial) {
      return `${window.location.origin}/__proxy/mimo-v2/v1`;
    }
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

/**
 * 构造 OpenAI 兼容请求体；按 provider 做差异化处理：
 * - 小米 MiMo：使用 `max_completion_tokens`（非 `max_tokens`）。
 * - 智谱 GLM：`temperature` 严格在 `(0, 1)` 开区间内（0/1 会被 400），且 **不支持 `stream_options`**
 *   （服务端 400 「unrecognized parameter」）。
 */
function openAiChatBody(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  temperature: number,
  stream: boolean,
  maxOutputTokens?: number,
): Record<string, unknown> {
  const isZhipu = cfg.id === "zhipu";
  const tempLow = isZhipu ? 0.01 : 0;
  const tempHigh = isZhipu ? 0.99 : 2;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: Math.min(tempHigh, Math.max(tempLow, temperature)),
  };
  if (cfg.id === "xiaomi") {
    body.max_completion_tokens =
      maxOutputTokens != null ? clampStreamMaxOutputTokens(maxOutputTokens) : 8192;
  } else if (maxOutputTokens != null) {
    body.max_tokens = clampStreamMaxOutputTokens(maxOutputTokens);
  }
  if (stream) {
    body.stream = true;
    if (!isZhipu) {
      body.stream_options = { include_usage: true };
    }
  }
  return body;
}

/**
 * 对国内云服务（小米 MiMo / 智谱 GLM / 豆包等）开发反代偶发 502/503/504 做一次轻退避重试，
 * 避免上游瞬时抖动直接报错；流式 *启动阶段* 重试是安全的（response 头还没消费）。
 * 仅当 `init.body` 是字符串（已 JSON 序列化）时才能复用，避免 stream body 被消费。
 */
async function fetchOpenAiCompatibleWithRetry(
  label: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const r1 = await fetchOrThrowCorsHint(label, url, init);
  if (r1.ok) return r1;
  if (![502, 503, 504].includes(r1.status)) return r1;
  if (init.signal?.aborted) return r1;
  if (typeof init.body !== "string") return r1;
  try {
    await r1.text();
  } catch {
    /* ignore */
  }
  await new Promise((res) => setTimeout(res, 600));
  if (init.signal?.aborted) return r1;
  return fetchOrThrowCorsHint(label, url, init);
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
  /**
   * 流式**补全**允许生成的最大 token 数；未设时各后端沿用历史默认（如部分 Anthropic 直连 2048）。
   * 用于按「目标汉字量」为正文/续写留足出稿空间，避免 2000 字只出几百仍被**模型侧**早停时空间不足（仍非硬限字数）。
   */
  maxOutputTokens?: number;
}): Promise<AiGenerateResult> {
  const { provider, config, messages, onDelta } = args;
  const mOut = args.maxOutputTokens;
  if (provider === "claude-code-local")
    return generateClaudeCodeLocalStream(config, messages, onDelta, args.signal, mOut);
  if (provider === "ollama")
    return generateOllamaStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "mlx")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "openai")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "doubao")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "zhipu")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "kimi")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "xiaomi")
    return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  if (provider === "anthropic") {
    if (shouldUseRouterProtocol(config))
      return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
    return generateAnthropicStream(config, messages, onDelta, args.temperature, args.signal, mOut);
  }
  if (provider === "gemini") {
    if (shouldUseRouterProtocol(config))
      return generateOpenAIStream(config, messages, onDelta, args.temperature, args.signal, mOut);
    return generateGeminiStream(config, messages, onDelta, args.temperature, args.signal, mOut);
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
  const payload = openAiChatBody(cfg, messages, temperature, false);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetchOpenAiCompatibleWithRetry(cfg.label, url, {
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
  const openAiU = openAiStyleUsageFromJsonRoot(raw) ?? null;
  return { text, raw, ...finalUsageForGenerate(text, messages, openAiU) };
}

async function generateOpenAIStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<AiGenerateResult> {
  const token = bearerTokenForOpenAiCompatible(cfg);
  const url = joinUrl(resolveOpenAiCompatibleBaseUrl(cfg), "/chat/completions");
  const payload = openAiChatBody(cfg, messages, temperature, true, maxOutputTokens);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetchOpenAiCompatibleWithRetry(cfg.label, url, {
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
  let lastOpenAiU: OpenAiStyleUsage | null = null;
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
        const uS = openAiStreamUsageFromDataLine(data);
        if (uS) lastOpenAiU = uS;
        if (data === "[DONE]") {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { text: full, ...finalUsageForGenerate(full, messages, lastOpenAiU) };
        }
        const delta = openAiStreamDataDeltaContent(data);
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
  }
  return { text: full, ...finalUsageForGenerate(full, messages, lastOpenAiU) };
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
  maxOutputTokens?: number,
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
      max_tokens: maxOutputTokens != null ? clampStreamMaxOutputTokens(maxOutputTokens) : 2048,
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
  const aU = anthropicUsageFromJsonMessagesResponse(raw) ?? null;
  return { text, raw, ...finalUsageForGenerate(text, messages, aU) };
}

async function generateAnthropicStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
  maxOutputTokens?: number,
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
      max_tokens: maxOutputTokens != null ? clampStreamMaxOutputTokens(maxOutputTokens) : 2048,
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
  let lastStreamU: OpenAiStyleUsage | null = null;
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
      const su = anthropicUsageFromStreamData(data);
      if (su) lastStreamU = su;
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
  return { text: full, ...finalUsageForGenerate(full, messages, lastStreamU) };
}

function geminiGenerateJsonBody(
  messages: AiChatMessage[],
  temperature: number,
  maxOutputTokens?: number,
): Record<string, unknown> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");
  const generationConfig: Record<string, unknown> = { temperature };
  if (maxOutputTokens != null) {
    generationConfig.maxOutputTokens = clampStreamMaxOutputTokens(maxOutputTokens);
  }
  return {
    contents: [{ role: "user", parts: [{ text: system ? `${system}\n\n${user}` : user }] }],
    generationConfig,
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
  const gU = geminiUsageFromJsonRoot(raw) ?? null;
  return { text, raw, ...finalUsageForGenerate(text, messages, gU) };
}

async function generateGeminiStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
  maxOutputTokens?: number,
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
    body: JSON.stringify(geminiGenerateJsonBody(messages, temperature, maxOutputTokens)),
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
  let lastGU: OpenAiStyleUsage | null = null;
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
      const gP = geminiUsageFromJsonRoot(data);
      if (gP) lastGU = gP;
      geminiEmitStreamDeltas(data, (d) => {
        full += d;
        onDelta(d);
      });
    }
  }
  return { text: full, ...finalUsageForGenerate(full, messages, lastGU) };
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
  const oU = ollamaTokenUsageFromJson(raw) ?? null;
  return { text, raw, ...finalUsageForGenerate(text, messages, oU) };
}

async function generateOllamaStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  temperature = 0.7,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<AiGenerateResult> {
  const base = cfg.baseUrl ?? "http://localhost:11434";
  const url = joinUrl(base, "/api/chat");
  const options: Record<string, unknown> = { temperature };
  if (maxOutputTokens != null) {
    options.num_predict = clampStreamMaxOutputTokens(maxOutputTokens);
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages,
      options,
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
  let lastOllamaU: OpenAiStyleUsage | null = null;
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
      const { delta, done: lineDone } = ollamaStreamLinePayload(obj);
      if (delta) {
        full += delta;
        onDelta(delta);
      }
      if (lineDone) {
        const oP = ollamaTokenUsageFromJson(obj) ?? null;
        if (oP) lastOllamaU = oP;
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { text: full, raw: obj, ...finalUsageForGenerate(full, messages, lastOllamaU) };
      }
    }
  }
  return { text: full, ...finalUsageForGenerate(full, messages, lastOllamaU) };
}



