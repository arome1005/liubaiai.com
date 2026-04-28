import type { AiChatMessage, AiGenerateResult, AiProviderConfig } from "./types";
import { clampStreamMaxOutputTokens } from "./writing-body-output-budget";
import { addSidecarDailyTokens } from "../util/owner-mode";
import { approxRoughTokenCount } from "./approx-tokens";
import { finalUsageForGenerate } from "./token-usage-helpers";

function resolveSidecarBaseUrl(cfg: AiProviderConfig): string {
  const t = (cfg.baseUrl ?? "").trim();
  return (t || "http://127.0.0.1:7788").replace(/\/+$/, "");
}

function buildClaudeCodeLocalBody(messages: AiChatMessage[], model: string, maxOutputTokens?: number) {
  const systemMsg = messages.find((m) => m.role === "system");
  const turns = messages.filter((m) => m.role !== "system");
  return {
    system: systemMsg?.content,
    messages: turns.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    model,
    ...(maxOutputTokens != null
      ? { max_tokens: clampStreamMaxOutputTokens(maxOutputTokens) as number }
      : {}),
  };
}

/** 高级接入 / sidecar 结束：若 SSE `done` 里带 `usage` 用厂商/侧car 口径，否则用输入+输出粗估。 */
function finishSidecarStream(
  acc: string,
  messages: AiChatMessage[],
  inputApprox: number,
  evWithUsage: unknown,
): Pick<AiGenerateResult, "text" | "tokenUsage" | "usageTotalTokens"> {
  if (!acc.trim() && !evWithUsage) {
    return { text: acc, ...finalUsageForGenerate(acc, messages, null) };
  }
  const ev =
    evWithUsage && typeof evWithUsage === "object"
      ? (evWithUsage as { usage?: { input_tokens?: number; output_tokens?: number } })
      : null;
  const u = ev?.usage;
  if (u && typeof u.input_tokens === "number" && typeof u.output_tokens === "number" && u.input_tokens >= 0 && u.output_tokens >= 0) {
    const inp = Math.floor(u.input_tokens);
    const out = Math.floor(u.output_tokens);
    addSidecarDailyTokens(inp, out);
    return {
      text: acc,
      ...finalUsageForGenerate(acc, messages, { inputTokens: inp, outputTokens: out, totalTokens: inp + out }),
    };
  }
  const outApprox = approxRoughTokenCount(acc);
  if (acc.trim() || outApprox > 0) {
    addSidecarDailyTokens(inputApprox, outApprox);
  }
  return { text: acc, ...finalUsageForGenerate(acc, messages, null) };
}

export async function generateClaudeCodeLocal(
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

export async function generateClaudeCodeLocalStream(
  cfg: AiProviderConfig,
  messages: AiChatMessage[],
  onDelta: (textDelta: string) => void,
  signal?: AbortSignal,
  maxOutputTokens?: number,
): Promise<AiGenerateResult> {
  const token = (cfg.apiKey ?? "").trim();
  if (!token) {
    throw new Error("Claude Code 本地直连：请先在「设置 → Owner 模式」填入 sidecar Token");
  }
  // 估算输入 tokens（在发送前计算；当侧car 不返回 usage 时用于日统计与展示回退）
  const inputApprox = messages.reduce((sum, m) => sum + approxRoughTokenCount(m.content), 0);
  const url = `${resolveSidecarBaseUrl(cfg)}/v1/stream`;
  const body = buildClaudeCodeLocalBody(messages, cfg.model || "sonnet", maxOutputTokens);

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
          return finishSidecarStream(acc, messages, inputApprox, null);
        }
        let ev: { type?: string; text?: string; message?: string; usage?: { input_tokens?: number; output_tokens?: number } };
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
          return finishSidecarStream(acc, messages, inputApprox, ev);
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
  return { ...finishSidecarStream(acc, messages, inputApprox, null) };
}
