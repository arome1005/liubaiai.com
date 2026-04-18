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

/** §5.3.2：数字确认 / 冷却（最小实现：不改 UI 结构，仅升级弹窗交互） */
export type InjectionConfirmInteraction = {
  /** 需要输入的数字（字符串形式），用于数字确认 */
  requiredCode: string;
  /** 最短停留时间（ms），用于"等效长按"防误触 */
  minHoldMs: number;
  /** 冷却时间（ms），避免刚确认完又误触连发 */
  cooldownMs: number;
};

/**
 * 写作侧栏发起请求前：是否弹出确认（总体规划 §11 步 16）。
 * - 云端 + 将发送本书锦囊全文：可由 `injectConfirmCloudBible` 控制
 * - 超过用户阈值：由 `injectConfirmOnOversizeTokens` + `injectApproxTokenThreshold` 控制
 * - 超过 {@link INJECTION_APPROX_TOKENS_HARD_CAP}：始终确认
 */
export function resolveInjectionConfirmPrompt(args: {
  messages: AiChatMessage[];
  settings: AiSettings;
  willSendBibleToCloud: boolean;
}): InjectionConfirmPrompt & { tokensApprox: number; interaction: InjectionConfirmInteraction } {
  const tokens = approxTotalTokensForMessages(args.messages);
  const s = args.settings;
  const reasons: string[] = [];
  const interaction: InjectionConfirmInteraction = {
    requiredCode: String(Math.max(0, Math.min(999_999, Math.floor(tokens)))),
    minHoldMs: 1200,
    cooldownMs: 1500,
  };

  if (s.injectConfirmCloudBible && args.willSendBibleToCloud) {
    reasons.push("将向云端模型发送「本书锦囊」全文（可能很长，涉费用与隐私）。");
  }

  const th = s.injectApproxTokenThreshold;
  if (s.injectConfirmOnOversizeTokens && th > 0 && tokens >= th) {
    reasons.push(`本次请求粗估约 ${tokens.toLocaleString()} tokens，已超过你设定的阈值 ${th.toLocaleString()}。`);
  }

  if (tokens >= INJECTION_APPROX_TOKENS_HARD_CAP) {
    const line = `本次请求粗估约 ${tokens.toLocaleString()} tokens，体量极大，请确认后再发送。`;
    if (!reasons.includes(line)) reasons.push(line);
    return { shouldPrompt: true, reasons, tokensApprox: tokens, interaction };
  }

  return { shouldPrompt: reasons.length > 0, reasons, tokensApprox: tokens, interaction };
}

export function formatInjectionConfirmDialogText(prompt: InjectionConfirmPrompt): string {
  return ["本次 AI 请求确认", "", ...prompt.reasons.map((r) => `· ${r}`), "", "确定要继续吗？"].join("\n");
}

const LAST_OK_AT_KEY = "liubai:inj-confirm:last-ok-at:v1";

function readLastOkAt(): number {
  try {
    const raw = localStorage.getItem(LAST_OK_AT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastOkAt(t: number): void {
  try {
    localStorage.setItem(LAST_OK_AT_KEY, String(t));
  } catch {
    /* ignore */
  }
}

/**
 * §5.3.2：数字确认 / "等效长按" / 冷却。
 * - 仅在 `prompt.shouldPrompt` 时调用。
 * - 使用 `window.prompt` 避免引入新 UI 结构；用户需输入粗估 token 数作为确认码。
 */
export function confirmInjectionPrompt(prompt: {
  shouldPrompt: boolean;
  reasons: string[];
  interaction: InjectionConfirmInteraction;
  extraLines?: string[];
}): boolean {
  if (!prompt.shouldPrompt) return true;
  const now = Date.now();
  const lastOk = readLastOkAt();
  if (lastOk && now - lastOk < Math.max(0, prompt.interaction.cooldownMs)) {
    return false;
  }
  const openedAt = now;
  const msg = [
    formatInjectionConfirmDialogText({ shouldPrompt: true, reasons: prompt.reasons }),
    ...(prompt.extraLines?.length ? ["", ...prompt.extraLines] : []),
    "",
    `确认方式：输入数字 ${prompt.interaction.requiredCode} 后确定（用于防误触）。`,
    `提示：需停留至少 ${Math.ceil(prompt.interaction.minHoldMs / 100) / 10}s（等效"长按"）。`,
  ].join("\n");
  const typed = window.prompt(msg, "")?.trim() ?? "";
  if (!typed) return false;
  if (typed !== prompt.interaction.requiredCode) return false;
  const held = Date.now() - openedAt;
  if (held < Math.max(0, prompt.interaction.minHoldMs)) return false;
  writeLastOkAt(Date.now());
  return true;
}
