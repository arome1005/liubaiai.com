import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig } from "../ai/storage";
import {
  buildShengHuiParagraphToolbarMessages,
  type ShengHuiParagraphToolbarAction,
} from "../ai/sheng-hui-paragraph-toolbar-messages";
import {
  estimateShengHuiRoughTokens,
  generateShengHuiProseStreamFromMessages,
} from "../ai/sheng-hui-generate";
import { confirmInjectionPrompt, resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { isAbortError } from "../util/is-abort-error";
import {
  replaceShengHuiManuscriptParagraph,
  splitShengHuiManuscriptIntoParagraphs,
} from "../util/sheng-hui-manuscript-paragraphs";
import type { AiSettings } from "../ai/types";
import type { ShengHuiBuildResult } from "./useShengHuiGenerationLifecycle";

type Args = {
  workId: string | null;
  chapterId: string | null;
  settings: AiSettings;
  /** 主章生成流式进行中时禁用段工具。 */
  mainBusy: boolean;
  output: string;
  onOutputChange: (next: string) => void;
  setError: (v: string | null) => void;
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>;
};

/**
 * 阅读态主稿：按段 hover 工具栏（重写 / 扩展 / 收紧 / 风格扫描），独立 abort、不占主 `busy`。
 */
export function useShengHuiParagraphToolbarStream(args: Args) {
  const {
    workId,
    chapterId,
    settings,
    mainBusy,
    output,
    onOutputChange,
    setError,
    buildGenerateArgs,
  } = args;

  const [paragraphToolbarIndex, setParagraphToolbarIndex] = useState<number | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef(output);
  const latestTargetRef = useRef<{ workId: string | null; chapterId: string | null }>({
    workId: null,
    chapterId: null,
  });

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    latestTargetRef.current = { workId, chapterId };
    return () => {
      abortRef.current?.abort();
    };
  }, [workId, chapterId]);

  const runParagraphAction = useCallback(
    async (action: ShengHuiParagraphToolbarAction, paragraphIndex: number) => {
      if (mainBusy) return;
      if (inFlightRef.current) return;
      const paras = splitShengHuiManuscriptIntoParagraphs(outputRef.current);
      if (paragraphIndex < 0 || paragraphIndex >= paras.length) return;
      if (!workId) {
        setError("请先选择作品。");
        return;
      }

      const runWorkId = workId;
      const runChapterId = chapterId;
      setError(null);
      inFlightRef.current = true;
      setParagraphToolbarIndex(paragraphIndex);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const paragraphText = paras[paragraphIndex] ?? "";

      try {
        const built = await buildGenerateArgs();
        if (!built.ok) {
          setError(built.error);
          return;
        }
        const cfg = getProviderConfig(settings, settings.provider);
        if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
          setError("请先在设置中填写当前模型的 API Key。");
          return;
        }

        const { args: genArgs } = built;
        const includeSummary = Boolean((genArgs.chapterSummary ?? "").trim());

        const messages = buildShengHuiParagraphToolbarMessages({
          action,
          workTitle: genArgs.workTitle,
          chapterTitle: genArgs.chapterTitle,
          outlineAndStrategy: genArgs.outlineAndStrategy,
          fullManuscript: outputRef.current,
          paragraphText,
          workStyle: genArgs.workStyle,
          tagProfileText: genArgs.tagProfileText,
          characterVoiceLocks: genArgs.characterVoiceLocks,
          includeChapterSummaryInRequest: includeSummary,
          chapterSummary: genArgs.chapterSummary,
        });
        const rough = estimateShengHuiRoughTokens(messages);
        const confirmPrompt = resolveInjectionConfirmPrompt({
          messages,
          settings,
          // 段工具 messages 未拼接本书锦囊，避免误报「锦囊上云」。
          willSendBibleToCloud: false,
        });
        const roughPlain = `生辉粗估：输入约 ${rough.inputApprox.toLocaleString()} tokens，输出预留约 ${rough.outputEstimateApprox.toLocaleString()} tokens，合计约 ${rough.totalApprox.toLocaleString()}。`;
        if (confirmPrompt.shouldPrompt) {
          if (
            !confirmInjectionPrompt({
              shouldPrompt: true,
              reasons: confirmPrompt.reasons,
              interaction: confirmPrompt.interaction,
              extraLines: [roughPlain, "（段工具）"],
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
          includeChapterSummary: includeSummary,
          usageLogTask: "生辉·段工具",
        });
        const tail = acc.trim();
        if (rough.totalApprox > 0) addTodayApproxTokens(rough.totalApprox);

        const lt = latestTargetRef.current;
        const isCurrent = lt.workId === runWorkId && lt.chapterId === runChapterId;
        if (!isCurrent) return;

        if (action === "style_scan") {
          if (tail) {
            toast("风格扫描", { description: tail, duration: 20_000 });
          } else {
            setError("风格扫描无有效输出。");
          }
          return;
        }

        if (!tail) {
          setError("模型未返回可替换的段落。");
          return;
        }
        onOutputChange(replaceShengHuiManuscriptParagraph(outputRef.current, paragraphIndex, tail));
      } catch (e) {
        if (isFirstAiGateCancelledError(e)) return;
        if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlightRef.current = false;
        setParagraphToolbarIndex(null);
        abortRef.current = null;
      }
    },
    [buildGenerateArgs, chapterId, mainBusy, onOutputChange, setError, settings, workId],
  );

  const stopParagraphToolbarStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    /** 正在处理中的段落下标，或 `null`。 */
    paragraphToolbarIndex,
    runParagraphAction,
    /** 与主栏「停止」并账，供中断段工具子流。 */
    stopParagraphToolbarStream,
  };
}
