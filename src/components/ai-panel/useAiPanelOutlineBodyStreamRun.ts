import { useCallback } from "react";
import { wordCount } from "../../util/wordCount";
import type { WritingSkillMode } from "../../ai/assemble-context";
import { writingSkillModeUsesBodyMultiRound } from "../../ai/writing-body-multi-round-modes";
import {
  estimateMaxOutputTokensForTargetChineseChars,
  outlineBodyLengthSatisfied,
  OUTLINE_BODY_CONTINUATION_MAX_ROUNDS,
} from "../../ai/writing-body-output-budget";
import { extendMessagesWithContinuationRound } from "../../ai/writing-body-continuation-messages";
import type { AiChatMessage } from "../../ai/types";
import type { ExecuteStreamInput, ExecuteStreamResult } from "./useAiPanelStreamingRun";

export type OutlineBodyOnPostAllRounds = (fullDraft: string) => void;

export interface RunOutlineBodyWithContinuationArgs
  extends Pick<ExecuteStreamInput, "provider" | "providerCfg" | "signal" | "contextInputBuckets"> {
  mode: WritingSkillMode;
  targetWordCount: number;
  /** 与首轮 assemble 中 `chapterOutlinePaste` / override 一致 */
  outlineText: string;
  firstMessages: AiChatMessage[];
  /**
   * 多轮都跑完后：将合稿补记一次「生成历史」并 `done`（与 `executeStream` 中间轮不 done 配对）。
   * 单次流式或「非正文扩写子集/无目标」路径不会调用此回调。
   */
  onPostAllRounds: OutlineBodyOnPostAllRounds;
}

/**
 * 正文向技能（`outline` / `continue` / `rewrite`）：在设了目标字数时为首轮/续写轮带 `maxOutputTokens`；不足时自动再发 1～2 轮续写（同一次 `signal` 可取消）。
 * `summarize` / `draw` 等仅单轮 + 目标字数估 max output。
 */
export function useAiPanelOutlineBodyStreamRun(
  executeStream: (input: ExecuteStreamInput) => Promise<ExecuteStreamResult>,
) {
  const runOutlineBodyWithContinuation = useCallback(
    async (args: RunOutlineBodyWithContinuationArgs): Promise<ExecuteStreamResult> => {
      const {
        mode,
        targetWordCount,
        outlineText,
        firstMessages,
        signal,
        provider,
        providerCfg,
        onPostAllRounds,
        contextInputBuckets,
      } = args;
      const maxR = OUTLINE_BODY_CONTINUATION_MAX_ROUNDS;
      const oneShotMax =
        targetWordCount > 0 ? estimateMaxOutputTokensForTargetChineseChars(targetWordCount) : undefined;

      if (!writingSkillModeUsesBodyMultiRound(mode) || targetWordCount <= 0) {
        return executeStream({
          provider,
          providerCfg,
          messages: firstMessages,
          signal,
          maxOutputTokens: oneShotMax,
          contextInputBuckets,
        });
      }

      let messages: AiChatMessage[] = firstMessages;
      let fullDraft = "";
      let lastSegmentText = "";

      for (let round = 0; round < maxR; round++) {
        const remainingChars = Math.max(0, targetWordCount - wordCount(fullDraft));
        const maxForThisRound = estimateMaxOutputTokensForTargetChineseChars(
          remainingChars > 0 ? remainingChars : targetWordCount,
        );
        const isLastPlanned = round === maxR - 1;

        const r = await executeStream({
          provider,
          providerCfg,
          messages,
          signal,
          maxOutputTokens: maxForThisRound,
          recordDraftHistory: false,
          dispatchDonePhase: false,
          contextInputBuckets: round === 0 ? contextInputBuckets : undefined,
        });
        if (!r.success) return r;

        const seg = (r.segmentText ?? "").trim();
        fullDraft += seg;
        lastSegmentText = r.segmentText;

        const wc = wordCount(fullDraft);
        if (outlineBodyLengthSatisfied(wc, targetWordCount) || isLastPlanned) {
          onPostAllRounds(fullDraft);
          return { success: true, segmentText: r.segmentText };
        }

        messages = extendMessagesWithContinuationRound(messages, {
          segment: seg,
          outlineText,
          targetWordCount,
          currentWordCountAfterSegment: wc,
        });
      }
      // maxR=0 时走不到上面的 isLastPlanned 分支；运行时保持沿用 ExecuteStreamResult 形态。
      onPostAllRounds(fullDraft);
      return { success: true, segmentText: lastSegmentText };
    },
    [executeStream],
  );

  return { runOutlineBodyWithContinuation };
}
