import { approxRoughTokenCount } from "../ai/approx-tokens";
import type { AiChatMessage, AiSettings } from "../ai/types";

/** 粗估整次 chat 请求的 tokens（仅用于侧栏确认提示，非计费） */
export function approxTotalTokensForMessages(messages: AiChatMessage[]): number {
  const joined = messages.map((m) => `${m.role}\n${m.content}`).join("\n\n");
  return approxRoughTokenCount(joined);
}

/** 超过该粗估 tokens 时强制确认（即使用户关闭其它开关），防止误发极大上下文 */
export const INJECTION_APPROX_TOKENS_HARD_CAP = 200_000;

export type InjectionConfirmPrompt = {
  shouldPrompt: boolean;
  reasons: string[];
};

/**
 * 写作侧栏发起请求前：是否弹出确认（总体规划 §11 步 16）。
 * - 云端 + 将发送圣经：可由 `injectConfirmCloudBible` 控制
 * - 超过用户阈值：由 `injectConfirmOnOversizeTokens` + `injectApproxTokenThreshold` 控制
 * - 超过 {@link INJECTION_APPROX_TOKENS_HARD_CAP}：始终确认
 */
export function resolveInjectionConfirmPrompt(args: {
  messages: AiChatMessage[];
  settings: AiSettings;
  willSendBibleToCloud: boolean;
}): InjectionConfirmPrompt {
  const tokens = approxTotalTokensForMessages(args.messages);
  const s = args.settings;
  const reasons: string[] = [];

  if (s.injectConfirmCloudBible && args.willSendBibleToCloud) {
    reasons.push("将向云端模型发送「创作圣经」全文（可能很长，涉费用与隐私）。");
  }

  const th = s.injectApproxTokenThreshold;
  if (s.injectConfirmOnOversizeTokens && th > 0 && tokens >= th) {
    reasons.push(`本次请求粗估约 ${tokens.toLocaleString()} tokens，已超过你设定的阈值 ${th.toLocaleString()}。`);
  }

  if (tokens >= INJECTION_APPROX_TOKENS_HARD_CAP) {
    const line = `本次请求粗估约 ${tokens.toLocaleString()} tokens，体量极大，请确认后再发送。`;
    if (!reasons.includes(line)) reasons.push(line);
    return { shouldPrompt: true, reasons };
  }

  return { shouldPrompt: reasons.length > 0, reasons };
}

export function formatInjectionConfirmDialogText(prompt: InjectionConfirmPrompt): string {
  return ["本次 AI 请求确认", "", ...prompt.reasons.map((r) => `· ${r}`), "", "确定要继续吗？"].join("\n");
}
