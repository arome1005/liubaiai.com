// AI 用量洞察 — 类型（与 v0 导出一致）

export type UsageSource = "api" | "approx" | "mixed";
export type AiProviderId = "openai" | "anthropic" | "gemini" | "local" | "router" | "all";
export type TimeRange = "today" | "7d" | "30d" | "session" | "custom";
export type PerspectiveMode = "api" | "approx" | "mixed";

export interface UsageRecord {
  id: string;
  timestamp: Date;
  task: string;
  model: string;
  workId?: string | null;
  provider: AiProviderId;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 思考/推理 token（思考模型计费但不可见）；缺失则未披露 */
  reasoningTokens?: number;
  source: UsageSource;
  status: "success" | "failed" | "partial";
  note?: string;
}

export interface DailyUsage {
  date: string;
  hour?: number;
  total: number;
  apiTotal: number;
  approxTotal: number;
  calls: number;
  byProvider: Record<AiProviderId, number>;
}

export interface ContextBreakdown {
  name: string;
  tokens: number;
  percentage: number;
}

export interface BudgetStatus {
  used: number;
  limit: number;
  percentage: number;
  isOverBudget: boolean;
  isNearThreshold: boolean;
}

export interface UsageStats {
  dailyBudget: BudgetStatus;
  sessionBudget: BudgetStatus;
  lifetimeTotal: number;
  avgInputRatio: number;
  avgOutputRatio: number;
  avgPerCall: {
    input: number;
    output: number;
    total: number;
  };
}
