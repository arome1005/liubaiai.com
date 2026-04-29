import { useCallback, useEffect, useRef, useState } from "react";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig } from "../ai/storage";
import {
  buildShengHuiChatMessages,
  estimateShengHuiRoughTokens,
  generateShengHuiProseStream,
} from "../ai/sheng-hui-generate";
import { confirmInjectionPrompt, resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { isAbortError } from "../util/is-abort-error";
import { resolveShengHuiAbPairTemperatures } from "../util/sheng-hui-ab-temperatures";
import type { AiSettings } from "../ai/types";
import type { ShengHuiBuildResult } from "./useShengHuiGenerationLifecycle";

export type ShengHuiAbAdoptPayload = {
  text: string;
  outlineForSnapshotPreview: string;
  workId: string;
  chapterId: string | null;
};

type Args = {
  workId: string | null;
  chapterId: string | null;
  settings: AiSettings;
  mainBusy: boolean;
  setError: (v: string | null) => void;
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>;
  onAdopted: (p: ShengHuiAbAdoptPayload) => void;
};

/**
 * 同期同 prompt、两路不同温度流式生成，供弹窗内对比后择一写回主稿（N3）。
 * 与主 `runGenerate` 独立，双 abort、不占主 `busy`。
 */
export function useShengHuiAbCompareStream(args: Args) {
  const { workId, chapterId, settings, mainBusy, setError, buildGenerateArgs, onAdopted } = args;

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [sublabelA, setSublabelA] = useState("A");
  const [sublabelB, setSublabelB] = useState("B");
  const [abError, setAbError] = useState<string | null>(null);

  const outlinePreviewRef = useRef("");
  const abortARef = useRef<AbortController | null>(null);
  const abortBRef = useRef<AbortController | null>(null);
  const latestTargetRef = useRef<{ workId: string | null; chapterId: string | null }>({
    workId: null,
    chapterId: null,
  });
  const inFlightRef = useRef(false);

  useEffect(() => {
    latestTargetRef.current = { workId, chapterId };
  }, [workId, chapterId]);

  useEffect(() => {
    return () => {
      abortARef.current?.abort();
      abortBRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    abortARef.current?.abort();
    abortBRef.current?.abort();
  }, []);

  const runAbCompare = useCallback(async () => {
    if (mainBusy || inFlightRef.current) return;
    if (!workId) {
      setError("请先选择作品。");
      return;
    }

    const runWorkId = workId;
    const runChapterId = chapterId;
    setError(null);
    setAbError(null);
    inFlightRef.current = true;
    setTextA("");
    setTextB("");
    setOpen(true);
    setRunning(true);

    abortARef.current?.abort();
    abortBRef.current?.abort();
    const acA = new AbortController();
    const acB = new AbortController();
    abortARef.current = acA;
    abortBRef.current = acB;

    try {
      const built = await buildGenerateArgs();
      if (!built.ok) {
        setError(built.error);
        setOpen(false);
        return;
      }
      outlinePreviewRef.current = built.outlineForSnapshotPreview;

      const cfg = getProviderConfig(settings, settings.provider);
      if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
        setError("请先在设置中填写当前模型的 API Key。");
        setOpen(false);
        return;
      }

      const { a: tA, b: tB, base: tBase } = resolveShengHuiAbPairTemperatures(settings, settings.provider);
      setSublabelA(`偏低 T≈${tA.toFixed(2)}（相对基准 ${tBase.toFixed(2)}）`);
      setSublabelB(`偏高 T≈${tB.toFixed(2)}（相对基准 ${tBase.toFixed(2)}）`);

      const messages = buildShengHuiChatMessages(built.args);
      const rough = estimateShengHuiRoughTokens(messages);
      const isCloudProvider = !isLocalAiProvider(settings.provider);
      const confirmPrompt = resolveInjectionConfirmPrompt({
        messages,
        settings,
        willSendBibleToCloud: isCloudProvider && built.willSendBibleToCloud,
      });
      const roughPlain = `A/B 各跑一路，粗估每路约 ${rough.totalApprox.toLocaleString()} tokens 量级；两路合计约 ${(
        rough.totalApprox * 2
      ).toLocaleString()}（非精确计费）。`;
      if (confirmPrompt.shouldPrompt) {
        if (
          !confirmInjectionPrompt({
            shouldPrompt: true,
            reasons: confirmPrompt.reasons,
            interaction: confirmPrompt.interaction,
            extraLines: [roughPlain, "（A/B 双生成）"],
          })
        ) {
          setOpen(false);
          return;
        }
      }

      const { args: genArgs } = built;

      const onDeltaA = (d: string) => {
        const lt = latestTargetRef.current;
        if (lt.workId !== runWorkId || lt.chapterId !== runChapterId) return;
        setTextA((p) => p + d);
      };
      const onDeltaB = (d: string) => {
        const lt = latestTargetRef.current;
        if (lt.workId !== runWorkId || lt.chapterId !== runChapterId) return;
        setTextB((p) => p + d);
      };

      const streamArgs = { ...genArgs, settings, workId: runWorkId };

      await Promise.all([
        generateShengHuiProseStream({
          ...streamArgs,
          signal: acA.signal,
          onDelta: onDeltaA,
          temperatureOverride: tA,
          usageLogTask: "生辉·A/B·A",
        }),
        generateShengHuiProseStream({
          ...streamArgs,
          signal: acB.signal,
          onDelta: onDeltaB,
          temperatureOverride: tB,
          usageLogTask: "生辉·A/B·B",
        }),
      ]);
      if (rough.totalApprox > 0) addTodayApproxTokens(rough.totalApprox * 2);
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return;
      if (isAbortError(e)) {
        setAbError(null);
        return;
      }
      setAbError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlightRef.current = false;
      setRunning(false);
      abortARef.current = null;
      abortBRef.current = null;
    }
  }, [buildGenerateArgs, chapterId, mainBusy, setError, settings, workId]);

  const adopt = useCallback(
    (which: "a" | "b") => {
      if (!workId) return;
      const text = which === "a" ? textA : textB;
      const t = text.trim();
      if (!t) {
        setAbError("该路尚无正文，请等待流结束或重试。");
        return;
      }
      onAdopted({
        text: t,
        outlineForSnapshotPreview: outlinePreviewRef.current,
        workId,
        chapterId,
      });
      setOpen(false);
      setTextA("");
      setTextB("");
      setAbError(null);
    },
    [chapterId, onAdopted, textA, textB, workId],
  );

  const onOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        stop();
        inFlightRef.current = false;
        setRunning(false);
        setTextA("");
        setTextB("");
        setAbError(null);
      }
      setOpen(v);
    },
    [stop],
  );

  return {
    abDialogOpen: open,
    onAbDialogOpenChange: onOpenChange,
    abRunning: running,
    abTextA: textA,
    abTextB: textB,
    abSublabelA: sublabelA,
    abSublabelB: sublabelB,
    abError,
    runAbCompare,
    stopAbCompare: stop,
    adoptAb: adopt,
  };
}
