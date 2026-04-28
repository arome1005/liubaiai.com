import { useMemo, useRef, useState } from "react";
import { readSessionApproxTokens } from "../../ai/sidepanel-session-tokens";
import { readTodayApproxTokens } from "../../ai/daily-approx-tokens";
import type { AiChatMessage, AiProviderId, AiSettings } from "../../ai/types";
import type { AiRunContextOverrides } from "../../util/ai-degrade-retry";
import type { AiDraftMergePayload } from "../AiDraftMergeDialog";
import type { CostGatePayload } from "../CostGateModal";
import { useGenPhase } from "./useGenPhase";

interface UseAiPanelRunStateArgs {
  /** 来自 settings.aiSessionApproxTokenBudget，用于派生 sessionTokensUsed */
  aiSessionApproxTokenBudget: number;
}

/**
 * 「生成运行」状态管理：
 * - 生命周期标志：busy / error / showDegradeRetry
 * - 状态机：genPhase / dispatchGenPhase / resetGenPhase（委托 useGenPhase）
 * - 成本门控弹窗状态：costGatePending
 * - token 用量派生值：sessionTokensUsed / todayTokensUsed
 * - 不可变 ref：abortRef / lastReqRef / runContextOverridesRef / degradeAttemptedRef
 * - 草稿合并弹窗状态：mergePayload
 */
export function useAiPanelRunState(args: UseAiPanelRunStateArgs) {
  const { aiSessionApproxTokenBudget } = args;

  const { phase: genPhase, dispatch: dispatchGenPhase, reset: resetGenPhase } = useGenPhase();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDegradeRetry, setShowDegradeRetry] = useState(false);
  const [mergePayload, setMergePayload] = useState<AiDraftMergePayload | null>(null);

  /** P1-04：成本门控弹窗 pending（deferred-promise 模式） */
  const [costGatePending, setCostGatePending] = useState<
    (CostGatePayload & { resolve: (ok: boolean) => void }) | null
  >(null);
  const [sessionBudgetUiTick, setSessionBudgetUiTick] = useState(0);
  /** P1-04：今日用量刷新触发器（发送完成后 +1） */
  const [dailyUsageTick, setDailyUsageTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const lastReqRef = useRef<{
    provider: AiProviderId;
    providerCfg: AiSettings["openai"];
    messages: AiChatMessage[];
  } | null>(null);
  const runContextOverridesRef = useRef<AiRunContextOverrides | null>(null);
  const degradeAttemptedRef = useRef(false);

  // void trick：让 useMemo 在 busy 改变时重算（readSessionApproxTokens 是副作用读取）
  const sessionTokensUsed = useMemo(() => {
    void sessionBudgetUiTick;
    void busy;
    return aiSessionApproxTokenBudget > 0 ? readSessionApproxTokens() : 0;
  }, [aiSessionApproxTokenBudget, sessionBudgetUiTick, busy]);

  /** P1-04：今日已用 tokens（始终展示，随 dailyUsageTick / busy 变化刷新） */
  const todayTokensUsed = useMemo(() => {
    void dailyUsageTick;
    void busy;
    return readTodayApproxTokens();
  }, [dailyUsageTick, busy]);

  return {
    genPhase,
    dispatchGenPhase,
    resetGenPhase,
    busy,
    setBusy,
    error,
    setError,
    showDegradeRetry,
    setShowDegradeRetry,
    mergePayload,
    setMergePayload,
    costGatePending,
    setCostGatePending,
    sessionBudgetUiTick,
    setSessionBudgetUiTick,
    dailyUsageTick,
    setDailyUsageTick,
    sessionTokensUsed,
    todayTokensUsed,
    abortRef,
    lastReqRef,
    runContextOverridesRef,
    degradeAttemptedRef,
  };
}
