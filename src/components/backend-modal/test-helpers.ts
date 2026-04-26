/**
 * 各 provider 的「连通性 ping」测试函数 + Ollama 模型列表抓取。
 *
 * 这些都是「业务无副作用」的小函数：
 * - 每个 test* 用 fetch 发一个最小 prompt（max_tokens 极小）
 * - 失败抛 Error，UI 层捕获后展示
 * - fetchOllamaModelNames 走 /api/tags
 *
 * 注意：浏览器直连第三方 API 可能遭遇 CORS；这是 provider 端策略，不是这里的 bug。
 */
import type { AiProviderConfig } from "../../ai/types";
import { resolveOpenAiCompatibleBaseUrl } from "../../ai/client";
import {
  resolveAnthropicNativeMessagesBaseUrl,
  resolveGeminiNativeApiBaseUrl,
} from "../../ai/providers";
import {
  geminiGenerateTextFromJson,
  messageFromApiJsonBody,
} from "../../util/parse-api-json";

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

export async function testGeminiModel(args: {
  cfg: AiProviderConfig;
  modelOverride?: string;
}): Promise<string> {
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

export async function testOpenAICompatibleModel(args: {
  cfg: AiProviderConfig;
  model: string;
}): Promise<void> {
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

export async function testAnthropicModel(args: {
  cfg: AiProviderConfig;
  model: string;
}): Promise<void> {
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

export async function testOllamaModel(args: {
  cfg: AiProviderConfig;
  model: string;
}): Promise<void> {
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
export async function fetchOllamaModelNames(baseUrl: string): Promise<string[]> {
  const b = (baseUrl ?? "").trim() || "http://localhost:11434";
  const url = joinUrl(b, "/api/tags");
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) throw new Error(`无法拉取模型列表（HTTP ${resp.status}）`);
  const raw = (await resp.json().catch(() => ({}))) as { models?: { name?: string }[] };
  const models = raw?.models ?? [];
  const names = models.map((m) => (m?.name ?? "").trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
