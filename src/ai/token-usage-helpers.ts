import type { AiChatMessage, AiTokenUsage, AiGenerateResult } from "./types";
import { approxRoughTokenCount } from "./approx-tokens";
import type { OpenAiStyleUsage } from "../util/parse-api-json";

export function tokenUsageFromOpenAiStyle(u: OpenAiStyleUsage, source: "api" | "approx"): AiTokenUsage {
  const out: AiTokenUsage = {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    totalTokens: u.totalTokens,
    source,
  };
  if (u.reasoningTokens != null) out.reasoningTokens = u.reasoningTokens;
  return out;
}

export function approxUsageFromMessagesAndText(
  messages: AiChatMessage[],
  outText: string,
): AiTokenUsage {
  const inA = messages.reduce((sum, m) => sum + approxRoughTokenCount(m.content), 0);
  const outA = approxRoughTokenCount(outText);
  return { inputTokens: inA, outputTokens: outA, totalTokens: inA + outA, source: "approx" };
}

/**
 * 优先使用从响应 JSON 解析的厂商 `usage`；解析不到时用 messages + 输出做粗估。
 * `api` 在解析失败时应为 `null/undefined`。
 */
export function finalUsageForGenerate(
  outText: string,
  messages: AiChatMessage[],
  api: OpenAiStyleUsage | null | undefined,
): Pick<AiGenerateResult, "tokenUsage" | "usageTotalTokens"> {
  if (api) {
    const t = tokenUsageFromOpenAiStyle(
      {
        inputTokens: api.inputTokens,
        outputTokens: api.outputTokens,
        totalTokens: Math.max(api.totalTokens, api.inputTokens + api.outputTokens),
        reasoningTokens: api.reasoningTokens,
      },
      "api",
    );
    return { tokenUsage: t, usageTotalTokens: t.totalTokens };
  }
  const a = approxUsageFromMessagesAndText(messages, outText);
  return { tokenUsage: a, usageTotalTokens: a.totalTokens };
}
