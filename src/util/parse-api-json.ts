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

export type OpenAiStyleUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * 厂商单独披露的「思考/推理」token 数（思考模型计费但不可见）：
   * - Gemini：`usageMetadata.thoughtsTokenCount`
   * - OpenAI 兼容（o 系列 / 豆包思考端点等）：`usage.completion_tokens_details.reasoning_tokens`
   * - Anthropic：扩展思考算在 `output_tokens` 里，不在此单列
   * 缺失时为 undefined（区别于显式为 0）。
   */
  reasoningTokens?: number;
};

/**
 * OpenAI 兼容 /chat/completions 响应根上的 `usage`（流式或完整 JSON 均可）。
 * 只返回时常见：三字段都有；或仅有 `total_tokens`；或仅有 `prompt_tokens`+`completion_tokens`。
 */
export function openAiStyleUsageFromJsonRoot(raw: unknown): OpenAiStyleUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = (raw as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const p = (u as { prompt_tokens?: unknown }).prompt_tokens;
  const c = (u as { completion_tokens?: unknown }).completion_tokens;
  const t = (u as { total_tokens?: unknown }).total_tokens;
  const pN = typeof p === "number" && Number.isFinite(p) && p >= 0 ? Math.floor(p) : null;
  const cN = typeof c === "number" && Number.isFinite(c) && c >= 0 ? Math.floor(c) : null;
  const tN = typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.floor(t) : null;
  // OpenAI o 系列 / 豆包思考端点：`usage.completion_tokens_details.reasoning_tokens`
  const det = (u as { completion_tokens_details?: unknown }).completion_tokens_details;
  let rN: number | undefined;
  if (det && typeof det === "object") {
    const r = (det as { reasoning_tokens?: unknown }).reasoning_tokens;
    if (typeof r === "number" && Number.isFinite(r) && r >= 0) rN = Math.floor(r);
  }
  // 兜底推断：厂商未显式披露 reasoning_tokens 但 total > prompt + completion 时，
  // 用差值作为「思考/隐藏」token 的估算。OpenRouter 等代理常不填该字段，但 total 仍准确。
  if (rN == null && pN != null && cN != null && tN != null) {
    const gap = tN - pN - cN;
    if (gap > 0) rN = gap;
  }
  const withReasoning = (base: OpenAiStyleUsage): OpenAiStyleUsage =>
    rN == null ? base : { ...base, reasoningTokens: rN };

  if (pN != null && cN != null) {
    return withReasoning({ inputTokens: pN, outputTokens: cN, totalTokens: tN ?? pN + cN });
  }
  if (tN != null) {
    return withReasoning({ inputTokens: pN ?? 0, outputTokens: cN ?? 0, totalTokens: tN });
  }
  if (pN == null && cN == null) return null;
  if (cN == null) return pN == null ? null : withReasoning({ inputTokens: pN, outputTokens: 0, totalTokens: pN });
  return withReasoning({ inputTokens: pN ?? 0, outputTokens: cN, totalTokens: tN ?? (pN ?? 0) + cN });
}

/** @deprecated 优先用 openAiStyleUsageFromJsonRoot */
export function openAiUsageTotalTokensFromJson(raw: unknown): number | null {
  const s = openAiStyleUsageFromJsonRoot(raw);
  if (!s) return null;
  return s.totalTokens;
}

/** OpenAI 兼容 SSE：单行 `data: {...}` 中的 `usage`（含 prompt/completion/total） */
export function openAiStreamUsageFromDataLine(dataLine: string): OpenAiStyleUsage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(dataLine);
  } catch {
    return null;
  }
  return openAiStyleUsageFromJsonRoot(obj);
}

/** OpenAI 兼容 SSE：`data: { "choices":[{ "delta":{ "content":"..." }}] }` */
export function openAiStreamDataDeltaContent(dataLine: string): string {
  return openAiStreamDataDeltaPayload(dataLine).content;
}

/**
 * OpenAI 兼容 SSE 的 delta，**同时**抽出 `content` 和 `reasoning_content`：
 * - `content`：最终用户应看到的输出（OpenAI / Doubao / 小米 MiMo 等）
 * - `reasoning`：思考链（思考型模型如 OpenAI o 系列、Doubao 思考端点、小米 MiMo v2.5
 *   可能把全部内容吐到这里，content 反而是空。前端若忽略此字段会出现「计费但无输出」）
 * 任一字段都可能为空字符串。
 */
export function openAiStreamDataDeltaPayload(dataLine: string): { content: string; reasoning: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(dataLine);
  } catch {
    return { content: "", reasoning: "" };
  }
  if (!obj || typeof obj !== "object") return { content: "", reasoning: "" };
  const choices = (obj as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return { content: "", reasoning: "" };
  }
  const delta = (choices[0] as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") return { content: "", reasoning: "" };
  const c = (delta as { content?: unknown }).content;
  const r = (delta as { reasoning_content?: unknown }).reasoning_content;
  return {
    content: typeof c === "string" ? c : "",
    reasoning: typeof r === "string" ? r : "",
  };
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

/** Anthropic `/v1/messages` 非流式完整 JSON 的 `usage` */
export function anthropicUsageFromJsonMessagesResponse(raw: unknown): OpenAiStyleUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = (raw as { usage?: unknown }).usage;
  if (!u || typeof u !== "object") return null;
  const inp = (u as { input_tokens?: unknown }).input_tokens;
  const out = (u as { output_tokens?: unknown }).output_tokens;
  if (typeof inp !== "number" || !Number.isFinite(inp) || inp < 0) return null;
  if (typeof out !== "number" || !Number.isFinite(out) || out < 0) return null;
  return { inputTokens: Math.floor(inp), outputTokens: Math.floor(out), totalTokens: Math.floor(inp + out) };
}

/**
 * Anthropic 流式 SSE 单条 `data: {...}` JSON。多种事件可能携带或更新 `usage`，取最后一次有效值作为累计。
 * 见 https://docs.anthropic.com/en/api/messages-streaming
 */
export function anthropicUsageFromStreamData(data: unknown): OpenAiStyleUsage | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { type?: string; usage?: unknown; message?: { usage?: unknown } | null };
  let u: unknown;
  if (o.usage && typeof o.usage === "object") u = o.usage;
  else if (o.type === "message_start" && o.message && typeof o.message === "object") {
    const mu = (o.message as { usage?: unknown }).usage;
    if (mu && typeof mu === "object") u = mu;
  }
  if (!u || typeof u !== "object") return null;
  const inp = (u as { input_tokens?: unknown }).input_tokens;
  const out = (u as { output_tokens?: unknown }).output_tokens;
  if (typeof inp !== "number" || !Number.isFinite(inp) || inp < 0) return null;
  if (typeof out !== "number" || !Number.isFinite(out) || out < 0) return null;
  return { inputTokens: Math.floor(inp), outputTokens: Math.floor(out), totalTokens: Math.floor(inp + out) };
}

/** Gemini 原生 `generateContent` 响应的 `usageMetadata` */
export function geminiUsageFromJsonRoot(raw: unknown): OpenAiStyleUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = (raw as { usageMetadata?: unknown }).usageMetadata;
  if (!m || typeof m !== "object") return null;
  const p = (m as { promptTokenCount?: unknown }).promptTokenCount;
  const c = (m as { candidatesTokenCount?: unknown }).candidatesTokenCount;
  const t = (m as { totalTokenCount?: unknown }).totalTokenCount;
  // 思考模型（gemini-2.5-pro / 3.x preview 等）：`thoughtsTokenCount` 计费但不可见。
  // 历史/路径变体：`thinkingTokens`、`thoughtTokens`、`thoughtsTokensCount`，做兼容读取。
  const th =
    (m as { thoughtsTokenCount?: unknown }).thoughtsTokenCount ??
    (m as { thinkingTokens?: unknown }).thinkingTokens ??
    (m as { thoughtTokens?: unknown }).thoughtTokens ??
    (m as { thoughtsTokensCount?: unknown }).thoughtsTokensCount;
  let rN: number | undefined =
    typeof th === "number" && Number.isFinite(th) && th >= 0 ? Math.floor(th) : undefined;

  const pN = typeof p === "number" && Number.isFinite(p) && p >= 0 ? Math.floor(p) : null;
  const cN = typeof c === "number" && Number.isFinite(c) && c >= 0 ? Math.floor(c) : null;
  const tN = typeof t === "number" && Number.isFinite(t) && t >= 0 ? Math.floor(t) : null;

  // 兜底推断：字段缺失/改名时，用 total - prompt - candidates 作为思考估算。
  // 写作场景无 tool use / 缓存命中干扰，差值就是 thoughts。
  if (rN == null && pN != null && cN != null && tN != null) {
    const gap = tN - pN - cN;
    if (gap > 0) rN = gap;
    // 诊断日志：差值显著但厂商字段抓不到时，把 raw usageMetadata 打到 console，便于排查字段名变更
    if (gap > 50 && typeof console !== "undefined") {
      try {
        // eslint-disable-next-line no-console
        console.warn("[gemini-usage] thoughtsTokenCount fallback (gap=" + gap + ")", m);
      } catch {
        /* ignore */
      }
    }
  }

  const withReasoning = (base: OpenAiStyleUsage): OpenAiStyleUsage =>
    rN == null ? base : { ...base, reasoningTokens: rN };

  if (pN != null && cN != null) {
    return withReasoning({
      inputTokens: pN,
      outputTokens: cN,
      totalTokens: tN ?? pN + cN,
    });
  }
  if (tN != null) {
    return withReasoning({ inputTokens: 0, outputTokens: 0, totalTokens: tN });
  }
  return null;
}

/** Ollama `/api/chat` 单条非流或流结束行上的计数字段 */
export function ollamaTokenUsageFromJson(raw: unknown): OpenAiStyleUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const pr = (raw as { prompt_eval_count?: unknown }).prompt_eval_count;
  const ev = (raw as { eval_count?: unknown }).eval_count;
  if (typeof pr !== "number" || !Number.isFinite(pr) || pr < 0) return null;
  if (typeof ev !== "number" || !Number.isFinite(ev) || ev < 0) return null;
  const pi = Math.floor(pr);
  const eo = Math.floor(ev);
  return { inputTokens: pi, outputTokens: eo, totalTokens: pi + eo };
}
