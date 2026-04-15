import type { AiSettings } from "../ai/types";

const KEY_PREFIX = "liubai:highRiskConfirm:last-ok-at:v1:";

function key(actionId: string): string {
  return KEY_PREFIX + actionId;
}

function readLastOkAt(actionId: string): number {
  try {
    const raw = localStorage.getItem(key(actionId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastOkAt(actionId: string, t: number): void {
  try {
    localStorage.setItem(key(actionId), String(t));
  } catch {
    /* ignore */
  }
}

export type HighRiskConfirmArgs = {
  /** 稳定 id，用于冷却与开关 */
  actionId: string;
  title: string;
  /** 用户可读：为什么高危 */
  reasons: string[];
  /** 强制清单：用户逐条确认的要点（用 prompt 文案呈现） */
  checklist: string[];
  /** 数字确认码（不要求与 tokens 挂钩；由调用方决定） */
  requiredCode: string;
  /** 最短停留（等效长按），默认 1200ms */
  minHoldMs?: number;
  /** 冷却时间，默认 1500ms */
  cooldownMs?: number;
  /** 若为 false 则直接放行（例如设置未启用） */
  enabled: boolean;
};

/**
 * 步 48：批量/多章/整卷等高危操作的“始终确认”清单。
 * - 不依赖 token 超限逻辑；可按 actionId 独立启用。
 * - 仅用 window.prompt，避免引入新的 UI 结构。
 */
export function confirmHighRiskChecklist(args: HighRiskConfirmArgs): boolean {
  if (!args.enabled) return true;
  const now = Date.now();
  const cooldownMs = Math.max(0, args.cooldownMs ?? 1500);
  const lastOk = readLastOkAt(args.actionId);
  if (lastOk && now - lastOk < cooldownMs) return false;

  const openedAt = now;
  const minHoldMs = Math.max(0, args.minHoldMs ?? 1200);
  const msg = [
    args.title.trim() || "高危操作确认",
    "",
    ...args.reasons.filter(Boolean).map((r) => `· ${r}`),
    "",
    "请逐条确认（清单）：",
    ...args.checklist.filter(Boolean).map((c, i) => `  ${i + 1}. ${c}`),
    "",
    `确认方式：输入数字 ${args.requiredCode} 后确定（用于防误触）。`,
    `提示：需停留至少 ${Math.ceil(minHoldMs / 100) / 10}s（等效“长按”）。`,
  ].join("\n");

  const typed = window.prompt(msg, "")?.trim() ?? "";
  if (!typed) return false;
  if (typed !== args.requiredCode) return false;
  const held = Date.now() - openedAt;
  if (held < minHoldMs) return false;
  writeLastOkAt(args.actionId, Date.now());
  return true;
}

export function highRiskAlwaysConfirmEnabled(settings: AiSettings): boolean {
  return Boolean(settings.highRiskAlwaysConfirm);
}

