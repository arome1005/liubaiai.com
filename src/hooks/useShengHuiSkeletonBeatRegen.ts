import { useCallback, useEffect, useRef, useState } from "react";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "../ai/local-provider";
import { getProviderConfig } from "../ai/storage";
import {
  buildShengHuiSkeletonRegenerateOneBeatMessages,
  estimateShengHuiRoughTokens,
  generateShengHuiProseStreamFromMessages,
  type ShengHuiGenerateMode,
} from "../ai/sheng-hui-generate";
import { confirmInjectionPrompt, resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { isAbortError } from "../util/is-abort-error";
import {
  pickSkeletonBeatLineFromModelOutput,
  replaceShengHuiSkeletonBeatLine,
} from "../util/sheng-hui-skeleton-beats";
import type { AiSettings } from "../ai/types";
import type { ShengHuiBuildResult } from "./useShengHuiGenerationLifecycle";

type Args = {
  workId: string | null;
  chapterId: string | null;
  settings: AiSettings;
  /** 主生成流式进行中为 true，此时禁节拍重生。 */
  busy: boolean;
  generateMode: ShengHuiGenerateMode;
  twoStepIntermediate: string | null;
  setTwoStepIntermediate: (v: string | null) => void;
  output: string;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  setError: (v: string | null) => void;
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>;
};

/**
 * 场景骨架：已生成节拍列表时，对单条节拍发起重生，与主生成流独立（独立 abort、不占主 `busy`）。
 */
export function useShengHuiSkeletonBeatRegen(args: Args) {
  const {
    workId,
    chapterId,
    settings,
    busy: mainBusy,
    generateMode,
    twoStepIntermediate,
    setTwoStepIntermediate,
    output,
    setOutput,
    setError,
    buildGenerateArgs,
  } = args;

  const [regenBeatIndex, setRegenBeatIndex] = useState<number | null>(null);
  const regenInFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const latestTargetRef = useRef<{ workId: string | null; chapterId: string | null }>({
    workId: null,
    chapterId: null,
  });

  useEffect(() => {
    latestTargetRef.current = { workId, chapterId };
    return () => {
      abortRef.current?.abort();
    };
  }, [workId, chapterId]);

  const regenerateBeat = useCallback(
    async (index1Based: number) => {
      if (generateMode !== "skeleton" || mainBusy) return;
      if (regenInFlightRef.current) return;
      const list = twoStepIntermediate?.trim() ?? "";
      if (!list || index1Based < 1) return;
      if (!workId) {
        setError("请先选择作品。");
        return;
      }

      const runWorkId = workId;
      const runChapterId = chapterId;
      setError(null);
      regenInFlightRef.current = true;
      setRegenBeatIndex(index1Based);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const oldList = list;

      try {
        const built = await buildGenerateArgs();
        if (!built.ok) {
          setError(built.error);
          return;
        }
        const cfg = getProviderConfig(settings, settings.provider);
        if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
          setError("请先在设置中填写当前模型的 API Key。");
          return;
        }

        const { args: genArgs } = built;
        const messages = buildShengHuiSkeletonRegenerateOneBeatMessages({
          ...genArgs,
          allBeatsText: oldList,
          beatIndex1Based: index1Based,
        });
        const rough = estimateShengHuiRoughTokens(messages);
        const isCloudProvider = !isLocalAiProvider(settings.provider);
        const willSendBible = isCloudProvider && Boolean((genArgs.chapterBibleFormatted ?? "").trim());
        const confirmPrompt = resolveInjectionConfirmPrompt({
          messages,
          settings,
          willSendBibleToCloud: willSendBible,
        });
        const roughPlain = `生辉粗估：输入约 ${rough.inputApprox.toLocaleString()} tokens，输出预留约 ${rough.outputEstimateApprox.toLocaleString()} tokens，合计约 ${rough.totalApprox.toLocaleString()}。`;
        if (confirmPrompt.shouldPrompt) {
          if (
            !confirmInjectionPrompt({
              shouldPrompt: true,
              reasons: confirmPrompt.reasons,
              interaction: confirmPrompt.interaction,
              extraLines: [roughPlain, "（节拍重生）"],
            })
          ) {
            return;
          }
        }

        let acc = "";
        await generateShengHuiProseStreamFromMessages({
          messages,
          settings,
          signal: ac.signal,
          onDelta: (d) => {
            acc += d;
          },
          workId: runWorkId,
          includeChapterSummary: Boolean((genArgs.chapterSummary ?? "").trim()),
        });
        const tail = acc.trim();
        if (rough.totalApprox > 0) addTodayApproxTokens(rough.totalApprox);

        const line = pickSkeletonBeatLineFromModelOutput(tail, index1Based);
        if (!line) {
          setError("模型未返回有效节拍行。");
          return;
        }
        const replaced = replaceShengHuiSkeletonBeatLine(oldList, index1Based, line.trim());
        if (!replaced.ok) {
          setError(replaced.error);
          return;
        }
        const nextText = replaced.next;
        const lt = latestTargetRef.current;
        const isCurrent = lt.workId === runWorkId && lt.chapterId === runChapterId;
        if (isCurrent) {
          setTwoStepIntermediate(nextText);
          if (output.trim() === oldList.trim()) {
            setOutput(nextText);
          }
        }
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return;
        if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      } finally {
        regenInFlightRef.current = false;
        setRegenBeatIndex(null);
        abortRef.current = null;
      }
    },
    [
      buildGenerateArgs,
      chapterId,
      generateMode,
      mainBusy,
      output,
      setError,
      setOutput,
      setTwoStepIntermediate,
      settings,
      twoStepIntermediate,
      workId,
    ],
  );

  const stopSkeletonBeatRegen = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { regenBeatIndex, regenerateBeat, stopSkeletonBeatRegen };
}
