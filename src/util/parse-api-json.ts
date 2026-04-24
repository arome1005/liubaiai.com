/**
 * 从厂商 API 的 JSON 响应体安全取文案（fetch 后 `unknown` 收窄），供 providers / 连接探测共用。
 */

export function messageFromApiJsonBody(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const err = (raw as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function geminiGenerateTextFromJson(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const candidates = (raw as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const c0 = candidates[0];
  if (!c0 || typeof c0 !== "object") return "";
  const content = (c0 as { content?: unknown }).content;
  if (!content || typeof content !== "object") return "";
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        const t = (part as { text: unknown }).text;
        if (typeof t === "string") return t;
      }
      return "";
    })
    .join("");
}

export function openAiChatTextFromJson(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const msg = (choices[0] as { message?: unknown }).message;
  if (!msg || typeof msg !== "object") return "";
  const c = (msg as { content?: unknown }).content;
  return typeof c === "string" ? c : "";
}

/** OpenAI 兼容：非流式或流式 JSON 根上的 `usage.total_tokens` */
export function openAiUsageTotalTokensFromJson(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const u = (raw as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const t = (u as { total_tokens?: unknown }).total_tokens;
  if (typeof t === "number" && Number.isFinite(t) && t >= 0) return Math.floor(t);
  return null;
}

/** OpenAI 兼容 SSE：单行 `data: {...}` 中的 `usage.total_tokens`（常与空 choices 同现） */
export function openAiStreamUsageTotalFromDataLine(dataLine: string): number | null {
  let obj: unknown;
  try {
    obj = JSON.parse(dataLine);
  } catch {
    return null;
  }
  return openAiUsageTotalTokensFromJson(obj);
}

/** OpenAI 兼容 SSE：`data: { "choices":[{ "delta":{ "content":"..." }}] }` */
export function openAiStreamDataDeltaContent(dataLine: string): string {
  let obj: unknown;
  try {
    obj = JSON.parse(dataLine);
  } catch {
    return "";
  }
  if (!obj || typeof obj !== "object") return "";
  const choices = (obj as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return "";
  const content = (delta as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

export function anthropicMessageTextFromJson(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const content = (raw as { content?: unknown }).content;
  if (!Array.isArray(content) || !content[0] || typeof content[0] !== "object") return "";
  const t = (content[0] as { text?: unknown }).text;
  return typeof t === "string" ? t : "";
}

export function ollamaChatTextFromJson(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const msg = (raw as { message?: unknown }).message;
  if (!msg || typeof msg !== "object") return "";
  const c = (msg as { content?: unknown }).content;
  return typeof c === "string" ? c : "";
}

/** Ollama `/api/chat` 流式 NDJSON 行 */
export function ollamaStreamLinePayload(obj: unknown): { delta: string; done: boolean } {
  if (!obj || typeof obj !== "object") return { delta: "", done: false };
  const msg = (obj as { message?: unknown }).message;
  let delta = "";
  if (msg && typeof msg === "object" && "content" in msg) {
    const c = (msg as { content: unknown }).content;
    if (typeof c === "string") delta = c;
  }
  const done = Boolean((obj as { done?: unknown }).done);
  return { delta, done };
}
