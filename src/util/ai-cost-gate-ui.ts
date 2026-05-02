/**
 * 写作侧栏 · 成本门控与 token 预算相关文案、短数字格式化（纯文案/纯函数，供 CostGateModal / AiPanel / useAiPanelStreamingRun 共用）。
 */

/** 与 CostGate、侧栏一致的计量单位展示文案 */
export const COST_GATE_TOKEN_UNIT = "token";

/** 侧栏「剧情/细纲」行标签 */
export const AI_PANEL_OUTLINE_TOKEN_ROW_LABEL = "剧情/细纲/token：";

/** 1.05M / 137.0K / 918 */
export function formatCostGateQuantityShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCostGateTokenAmount(n: number): string {
  return `${formatCostGateQuantityShort(n)} ${COST_GATE_TOKEN_UNIT}`;
}

export const COST_GATE_TITLE_INJECTION_INFO = "本次注入量预估";
export const COST_GATE_TITLE_BLOCK_DEFAULT = "AI 调用确认";

export const COST_GATE_LABEL_ROW_ESTIMATE = "本次粗估";
export const COST_GATE_LABEL_TODAY_USED = "今日已用";
export const COST_GATE_LABEL_AFTER_SEND_TOTAL = "发送后今日合计";

export const COST_GATE_INFO_NO_THRESHOLD = "当前注入量未触发任何阈值，可直接生成。";
export const COST_GATE_DISCLAIMER =
  "数字按本应用的写作向规则估算，用于把握章节注入量与日常预算；各模型在服务商侧的正式计费，以后台账单为准。";

export const COST_GATE_BTN_GOT_IT = "知道了";
export const COST_GATE_BTN_CANCEL = "取消";
export const COST_GATE_BTN_CONTINUE = "继续发送";

export const COST_GATE_TRIGGER_SINGLE_CALL = "单次调用预警";
export const COST_GATE_TRIGGER_DAILY = "日预算预警";

export function costGateReasonSingleCallExceeded(requestTokApprox: number, threshold: number): string {
  return `本次请求粗估约 ${requestTokApprox.toLocaleString()} ${COST_GATE_TOKEN_UNIT}，已超过单次预警阈值 ${threshold.toLocaleString()}。`;
}

export function costGateReasonDailyBudgetExceeded(
  todayUsed: number,
  requestTokApprox: number,
  budget: number,
): string {
  return `今日累计（${todayUsed.toLocaleString()} ${COST_GATE_TOKEN_UNIT}）加本次（约 ${requestTokApprox.toLocaleString()} ${COST_GATE_TOKEN_UNIT}）将超过日预算 ${budget.toLocaleString()} ${COST_GATE_TOKEN_UNIT}。`;
}

export function sessionBudgetHardBlockCopy(used: number, requestTokApprox: number, limit: number): string {
  return `本会话累计粗估约 ${used.toLocaleString()} ${COST_GATE_TOKEN_UNIT}，本次请求约 ${requestTokApprox.toLocaleString()}，将超过上限 ${limit.toLocaleString()}。可在「后端模型配置 → 默认与上下文」调高上限或设为 0；也可点草稿区「清零本会话累计」。`;
}
