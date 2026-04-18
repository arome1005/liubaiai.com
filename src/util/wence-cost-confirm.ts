import { isLocalAiProvider } from "../ai/local-provider";
import type { AiProviderId, AiSettings } from "../ai/types";
import type { AiChatMessage } from "../ai/types";
import { approxTotalTokensForMessages } from "./ai-injection-confirm";

const LAST_OK_AT_KEY = "liubai:wenceCostConfirm:last-ok-at:v1";

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
 * 步 46 后续：问策专用成本确认（不引入新 UI 结构，使用 window.prompt 的"数字确认"）。
 * - 仅对云端 provider 生效
 * - 有冷却，避免连续多次确认影响节奏
 */
export function confirmWenceCostBeforeSend(args: {
  settings: AiSettings;
  provider: string;
  apiMessages: AiChatMessage[];
  cooldownMs?: number;
}): boolean {
  if (isLocalAiProvider(args.provider as AiProviderId)) return true;
  if (!args.settings.privacy.consentAccepted || !args.settings.privacy.allowCloudProviders) return false;
  const tokens = approxTotalTokensForMessages(args.apiMessages);
  const reasons: string[] = [
    `本次「问策」将向云端模型发送对话内容（可能产生费用与隐私风险）。`,
    `粗估输入约 ${tokens.toLocaleString()} tokens（非真实计费）。`,
  ];

  const cooldownMs = args.cooldownMs ?? 60_000;
  const now = Date.now();
  const lastOk = readLastOkAt();
  if (lastOk && now - lastOk < Math.max(0, cooldownMs)) return true;

  const requiredCode = String(Math.max(0, Math.min(999_999, Math.floor(tokens))));
  const openedAt = now;
  const msg = [
    "本次问策请求确认",
    "",
    ...reasons.map((r) => `· ${r}`),
    "",
    `确认方式：输入数字 ${requiredCode} 后确定（用于防误触）。`,
    "确定要继续吗？",
  ].join("\n");
  const typed = window.prompt(msg, "")?.trim() ?? "";
  if (!typed) return false;
  if (typed !== requiredCode) return false;
  const held = Date.now() - openedAt;
  if (held < 900) return false;

  writeLastOkAt(Date.now());
  return true;
}

