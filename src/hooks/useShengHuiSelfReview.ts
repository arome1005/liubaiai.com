import { useCallback, useRef, useState } from "react";
import { generateWithProvider, isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider } from "../ai/local-provider";
import { getProviderConfig } from "../ai/storage";
import { buildShengHuiSelfReviewMessages, SHENG_HUI_SELF_REVIEW_TASK } from "../ai/sheng-hui-self-review";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { isAbortError } from "../util/is-abort-error";
import { approxTotalTokensForMessages } from "../util/ai-injection-confirm";
import type { AiSettings } from "../ai/types";

export function useShengHuiSelfReview(args: {
  settings: AiSettings;
  workId: string | null;
  workTitle: string;
  chapterTitle: string;
  styleBlock: string;
  bibleHint: string;
  body: string;
  canRun: boolean;
}) {
  const { settings, workId, workTitle, chapterTitle, styleBlock, bibleHint, body, canRun } = args;
  const [selfReviewText, setSelfReviewText] = useState<string | null>(null);
  const [selfReviewBusy, setSelfReviewBusy] = useState(false);
  const [selfReviewError, setSelfReviewError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSelfReview = useCallback(async () => {
    if (!canRun) return;
    const t = body.trim();
    if (t.length < 20) {
      setSelfReviewError("主稿过短，请先完成一段成稿再复盘。");
      return;
    }
    setSelfReviewError(null);
    setSelfReviewText(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSelfReviewBusy(true);
    try {
      if (!isLocalAiProvider(settings.provider) && !settings.privacy.consentAccepted) {
        setSelfReviewError("请先在设置中同意并启用云端模型。");
        return;
      }
      const cfg = getProviderConfig(settings, settings.provider);
      if (!isLocalAiProvider(settings.provider) && !settings.privacy.allowMetadata) {
        setSelfReviewError("成稿复盘需上传部分正文，请在隐私设置中允许作品元数据。");
        return;
      }
      if (!isLocalAiProvider(settings.provider) && !settings.privacy.allowChapterContent) {
        setSelfReviewError("成稿复盘需上云正文，请在隐私设置中允许章节正文上云。");
        return;
      }
      if (!isLocalAiProvider(settings.provider) && !cfg.apiKey?.trim()) {
        setSelfReviewError("请先在设置中填写当前模型的 API Key。");
        return;
      }
      const messages = buildShengHuiSelfReviewMessages({
        workTitle,
        chapterTitle,
        styleBlock,
        bibleHint,
        body: t,
      });
      const n = approxTotalTokensForMessages(messages);
      if (n > 0) addTodayApproxTokens(n);
      const r = await generateWithProvider({
        provider: settings.provider,
        config: cfg,
        messages,
        temperature: 0.35,
        signal: ac.signal,
        usageLog: { task: SHENG_HUI_SELF_REVIEW_TASK, workId: workId ?? undefined },
      });
      const out = (r.text ?? "").trim();
      if (out) setSelfReviewText(out);
      else setSelfReviewError("模型无有效输出，请重试。");
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) return;
      if (isAbortError(e)) return;
      setSelfReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setSelfReviewBusy(false);
      }
    }
  }, [body, canRun, chapterTitle, settings, styleBlock, bibleHint, workId, workTitle]);

  const stopSelfReview = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    selfReviewText,
    selfReviewBusy,
    selfReviewError,
    setSelfReviewError,
    runSelfReview,
    stopSelfReview,
  };
}
