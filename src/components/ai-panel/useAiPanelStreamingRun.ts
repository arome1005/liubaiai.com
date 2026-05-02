import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { approxRoughTokenCount } from "../../ai/approx-tokens";
import { generateWithProviderStream, isFirstAiGateCancelledError } from "../../ai/client";
import { addSessionApproxTokens, readSessionApproxTokens } from "../../ai/sidepanel-session-tokens";
import { addTodayApproxTokens, readTodayApproxTokens } from "../../ai/daily-approx-tokens";
import { isLocalAiProvider } from "../../ai/local-provider";
import { getProviderTemperature } from "../../ai/storage";
import type { AiChatMessage, AiProviderConfig, AiProviderId, AiSettings } from "../../ai/types";
import type { AiUsageEventRow } from "../../storage/ai-usage-db";
import { ownerModeWillBypassBudget } from "../../util/owner-mode";
import { errorSuggestsContextDegrade } from "../../util/ai-degrade-retry";
import { isAbortError } from "../../util/is-abort-error";
import {
  COST_GATE_TRIGGER_DAILY,
  COST_GATE_TRIGGER_SINGLE_CALL,
  costGateReasonDailyBudgetExceeded,
  costGateReasonSingleCallExceeded,
  sessionBudgetHardBlockCopy,
} from "../../util/ai-cost-gate-ui";
import type { CostGatePayload } from "./CostGateModal";
import type { GenPhaseEvent } from "./useGenPhase";

export interface ExecuteStreamInput {
  provider: AiProviderId;
  providerCfg: AiProviderConfig;
  messages: AiChatMessage[];
  signal: AbortSignal;
  maxOutputTokens?: number;
  /**
   * 为 false 时不把本段结果写入「生成历史」条（多轮续写的前几轮用；末轮或单次仍 true）。
   * 默认 true。
   */
  recordDraftHistory?: boolean;
  /**
   * 为 false 时不将 phase 置为 done（多轮续写中间轮用，末轮在补记里 done）。
   * 默认 true。
   */
  dispatchDonePhase?: boolean;
  /** 写作侧栏装配器同源分桶时传入；不传则用量洞察回退为基于 messages 的启发式 */
  contextInputBuckets?: AiUsageEventRow["contextInputBuckets"];
}

/** 本段流式产出的纯文本；与侧栏 `draft` 在续写时「按段累加」一致。 */
export type ExecuteStreamResult = { success: true; segmentText: string } | { success: false; segmentText: string };

interface UseAiPanelStreamingRunArgs {
  settings: AiSettings;
  /** 用量洞察归因；可为 null */
  workId: string | null;
  // 运行状态 setters（来自 useAiPanelRunState）
  setError: Dispatch<SetStateAction<string | null>>;
  setShowDegradeRetry: Dispatch<SetStateAction<boolean>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setCostGatePending: Dispatch<
    SetStateAction<(CostGatePayload & { resolve: (ok: boolean) => void }) | null>
  >;
  setSessionBudgetUiTick: Dispatch<SetStateAction<number>>;
  setDailyUsageTick: Dispatch<SetStateAction<number>>;
  dispatchGenPhase: (ev: GenPhaseEvent) => void;
  pushGeneratedDraftHistory: (content: string) => void;
  degradeAttemptedRef: MutableRefObject<boolean>;
}

/**
 * 封装「执行一次 AI 生成」的三个阶段：
 * 1. 预算门控（单次预警 / 日预算预警 / 会话上限）
 * 2. generateWithProviderStream 流式调用
 * 3. Token 计费统计与历史入库
 *
 * 错误处理（AbortError / isFirstAiGateCancelledError / 业务异常）也在内部 catch 中处理，
 * 不向外抛出——调用方 run() 的 finally 负责 setBusy(false) 即可。
 */
export function useAiPanelStreamingRun(args: UseAiPanelStreamingRunArgs) {
  const {
    settings,
    workId,
    setError,
    setShowDegradeRetry,
    setDraft,
    setCostGatePending,
    setSessionBudgetUiTick,
    setDailyUsageTick,
    dispatchGenPhase,
    pushGeneratedDraftHistory,
    degradeAttemptedRef,
  } = args;

  const executeStream = useCallback(
    async (input: ExecuteStreamInput): Promise<ExecuteStreamResult> => {
      const {
        provider,
        providerCfg,
        messages,
        signal,
        maxOutputTokens,
        recordDraftHistory,
        dispatchDonePhase,
        contextInputBuckets,
      } = input;
      const doHistory = recordDraftHistory !== false;
      const doDone = dispatchDonePhase !== false;

      const requestTokApprox = messages.reduce(
        (sum, m) => sum + approxRoughTokenCount(m.content),
        0,
      );

      // Owner 模式：走本机 sidecar → Pro 订阅，不计入 API token 预算
      const skipBudget = ownerModeWillBypassBudget();

      // ── P1-04：单次调用预警 ──────────────────────────────────────────────
      if (
        !skipBudget &&
        settings.singleCallWarnTokens > 0 &&
        requestTokApprox >= settings.singleCallWarnTokens
      ) {
        const ok = await new Promise<boolean>((resolve) => {
          setCostGatePending({
            reasons: [costGateReasonSingleCallExceeded(requestTokApprox, settings.singleCallWarnTokens)],
            tokensApprox: requestTokApprox,
            dailyUsed: readTodayApproxTokens(),
            dailyBudget: settings.dailyTokenBudget,
            triggerLabel: COST_GATE_TRIGGER_SINGLE_CALL,
            resolve,
          });
        });
        if (!ok) return { success: false, segmentText: "" };
      }

      // ── P1-04：日预算超出预警 ────────────────────────────────────────────
      if (!skipBudget && settings.dailyTokenBudget > 0) {
        const todayUsed = readTodayApproxTokens();
        if (todayUsed + requestTokApprox > settings.dailyTokenBudget) {
          const ok = await new Promise<boolean>((resolve) => {
            setCostGatePending({
            reasons: [
              costGateReasonDailyBudgetExceeded(todayUsed, requestTokApprox, settings.dailyTokenBudget),
            ],
            tokensApprox: requestTokApprox,
            dailyUsed: todayUsed,
            dailyBudget: settings.dailyTokenBudget,
            triggerLabel: COST_GATE_TRIGGER_DAILY,
              resolve,
            });
          });
          if (!ok) return { success: false, segmentText: "" };
        }
      }

      // ── 会话 token 上限（硬截断，不弹弹窗） ─────────────────────────────
      if (!skipBudget && settings.aiSessionApproxTokenBudget > 0) {
        const used = readSessionApproxTokens();
        if (used + requestTokApprox > settings.aiSessionApproxTokenBudget) {
          setError(
            sessionBudgetHardBlockCopy(used, requestTokApprox, settings.aiSessionApproxTokenBudget),
          );
          return { success: false, segmentText: "" };
        }
      }

      // ── 流式生成 ────────────────────────────────────────────────────────
      try {
        const r = await generateWithProviderStream({
          provider,
          config: providerCfg,
          messages,
          signal,
          maxOutputTokens,
          usageLog: { task: "侧栏·生成", workId, contextInputBuckets },
          onDelta: (d) => {
            dispatchGenPhase({ type: "delta" });
            setDraft((prev) => prev + d);
          },
          temperature: !isLocalAiProvider(provider)
            ? getProviderTemperature(settings, provider)
            : undefined,
        });

        // 极少数 provider 不走 onDelta 而是一次性返回 r.text
        if (!(r.text ?? "").trim()) {
          // nothing to patch
        } else {
          setDraft((prev) => prev || (r.text ?? "").trim());
        }

        const outTok = approxRoughTokenCount((r.text ?? "").trim());
        // 优先使用厂商返回的 usage.totalTokens，否则用粗估
        const billableTotal = r.tokenUsage?.totalTokens ?? requestTokApprox + Math.max(0, outTok);
        if (!skipBudget) {
          addSessionApproxTokens(billableTotal);
          addTodayApproxTokens(billableTotal);
        }
        if (doHistory) {
          pushGeneratedDraftHistory((r.text ?? "").trim());
        }
        setSessionBudgetUiTick((x) => x + 1);
        setDailyUsageTick((x) => x + 1);
        if (doDone) {
          dispatchGenPhase({ type: "done" });
        }
        return { success: true, segmentText: (r.text ?? "").trim() };
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) {
          dispatchGenPhase({ type: "abort" });
          return { success: false, segmentText: "" };
        }
        if (isAbortError(e)) {
          dispatchGenPhase({ type: "abort" });
        } else {
          const msg = e instanceof Error ? e.message : "AI 调用失败";
          setError(msg);
          dispatchGenPhase({ type: "error" });
          if (errorSuggestsContextDegrade(msg) && !degradeAttemptedRef.current) {
            setShowDegradeRetry(true);
          }
        }
        return { success: false, segmentText: "" };
      }
      // 注意：setBusy(false) 由调用方 run() 的 finally 负责，此处不调用。
    },
    [
      settings,
      workId,
      setError,
      setShowDegradeRetry,
      setDraft,
      setCostGatePending,
      setSessionBudgetUiTick,
      setDailyUsageTick,
      dispatchGenPhase,
      pushGeneratedDraftHistory,
      degradeAttemptedRef,
    ],
  );

  return { executeStream };
}
