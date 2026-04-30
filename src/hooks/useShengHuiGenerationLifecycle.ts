import { useEffect, useRef, useState } from "react";
import { addTodayApproxTokens } from "../ai/daily-approx-tokens";
import { isFirstAiGateCancelledError } from "../ai/client";
import { isLocalAiProvider, requiresClientSavedApiKey } from "../ai/local-provider";
import { getProviderConfig } from "../ai/storage";
import {
  buildShengHuiChatMessages,
  estimateShengHuiRoughTokens,
  generateShengHuiProseStream,
} from "../ai/sheng-hui-generate";
import { confirmInjectionPrompt, resolveInjectionConfirmPrompt } from "../util/ai-injection-confirm";
import { isAbortError } from "../util/is-abort-error";
import { appendShengHuiSnapshot, type ShengHuiSnapshot } from "../util/sheng-hui-snapshots";
import type { AiSettings } from "../ai/types";

/**
 * 生辉「按纲仿写」流式生成 + 取消 + 快照写回的全套生命周期。
 *
 * 责任：
 * - 持有 busy/error/lastRoughEstimate、output、abortRef/accRef/latestTargetRef；
 * - 提供 `runGenerate`/`stop`，处理流式 onDelta、tail 兜底、目标切换守卫、finally 写快照；
 * - 切换 workId/chapterId 时自动 abort 在飞流（cleanup 内）。
 *
 * 不负责：
 * - 装配上下文（依赖 page 全部表单状态，由 caller 在 `buildGenerateArgs` 内组装）；
 * - 维护 page 的 `twoStepIntermediate` 与 snapshot bucket / selectedSnapshotId（通过 callback 通知）。
 *
 * 与原页面 `runGenerate` 的行为约定保持一致：
 * 1) confirm 取消时不清空主稿；通过后再清；
 * 2) 用户中途切换目标，accRef 仍累积，快照写到原 ids 桶，但 UI 镜像被守卫跳过；
 * 3) 两步模式 step=1 完成后不存快照、写 intermediate；step=2 完成清 intermediate。
 */

type ShengHuiBuildArgs = Parameters<typeof buildShengHuiChatMessages>[0];

export type ShengHuiBuildResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** 传给 buildShengHuiChatMessages / generateShengHuiProseStream 的参数。 */
      args: ShengHuiBuildArgs;
      /** 用于 confirm 决策——已格式化的本章锦囊是否非空（云端时才参与提示）。 */
      willSendBibleToCloud: boolean;
      /** snapshot.outlinePreview 的源文本，通常等同 args.outlineAndStrategy。 */
      outlineForSnapshotPreview: string;
    };

export type ShengHuiRoughEstimate = ReturnType<typeof estimateShengHuiRoughTokens>;

export interface UseShengHuiGenerationLifecycleArgs {
  workId: string | null;
  chapterId: string | null;
  settings: AiSettings;
  /** 在 runGenerate 起始时同步装配上下文；async 以容纳 getChapterBible 等 IO。 */
  buildGenerateArgs: () => Promise<ShengHuiBuildResult>;
  /** 两步模式：step1 完成传 intermediate 文本；step2 完成或非两步传 null。 */
  onTwoStepIntermediateChange: (next: string | null) => void;
  /** finally 写完快照后回调；isCurrentTarget=true 时外层应同步 bucket/选中态。 */
  onSnapshotPersisted: (args: {
    snap: ShengHuiSnapshot;
    runWorkId: string;
    runChapterId: string | null;
    isCurrentTarget: boolean;
  }) => void;
}

export interface ShengHuiGenerationLifecycle {
  output: string;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  lastRoughEstimate: ShengHuiRoughEstimate | null;
  runGenerate: () => Promise<void>;
  stop: () => void;
}

export function useShengHuiGenerationLifecycle(
  args: UseShengHuiGenerationLifecycleArgs,
): ShengHuiGenerationLifecycle {
  const {
    workId,
    chapterId,
    settings,
    buildGenerateArgs,
    onTwoStepIntermediateChange,
    onSnapshotPersisted,
  } = args;

  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRoughEstimate, setLastRoughEstimate] = useState<ShengHuiRoughEstimate | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const accRef = useRef("");
  /**
   * 追踪当前页面正在浏览的目标（作品/章节）：让 onDelta 与 finally
   * 能识别"用户中途切换"——避免把上一次 run 的部分文字镜像到新目标的视图，
   * 同时保证快照仍按 run 起始时的 ids 写入正确的桶。
   */
  const latestTargetRef = useRef<{ workId: string | null; chapterId: string | null }>({
    workId: null,
    chapterId: null,
  });

  /**
   * 切换作品/章节时：(1) 同步最新目标到 ref；(2) 中止 in-flight 流。
   * cleanup 顺序保证：onDelta 不再向新目标的 output 追加；accRef 保持累积，
   * runGenerate 的 finally 仍会用捕获的 ids 把部分文本写回原桶。
   */
  useEffect(() => {
    latestTargetRef.current = { workId, chapterId };
    return () => {
      abortRef.current?.abort();
    };
  }, [workId, chapterId]);

  async function runGenerate(): Promise<void> {
    if (!workId || busy) return;

    let skipSnapshotAppend = false;
    // 捕获 run 起始时的目标 ids；任何 finally 写回都按这对 ids 入桶，
    // 避免用户在生成途中切换章节时快照被错位写到新章节。
    const runWorkId = workId;
    const runChapterId = chapterId;
    setError(null);
    // 注意：不要在这里 setOutput("") / 清 accRef——若用户在云端注入确认弹窗
    // 取消，会丢失现有主稿。清空动作延后到 confirm 通过之后再执行。
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);

    let outlineForSnapshotPreview = "";
    try {
      const built = await buildGenerateArgs();
      if (!built.ok) {
        setError(built.error);
        return;
      }
      outlineForSnapshotPreview = built.outlineForSnapshotPreview;

      const cfg = getProviderConfig(settings, settings.provider);
      if (requiresClientSavedApiKey(settings.provider) && !cfg.apiKey?.trim()) {
        setError("请先在设置中填写当前模型的 API Key。");
        return;
      }

      const isCloudProvider = !isLocalAiProvider(settings.provider);
      const messages = buildShengHuiChatMessages(built.args);
      const rough = estimateShengHuiRoughTokens(messages);
      setLastRoughEstimate(rough);

      const confirmPrompt = resolveInjectionConfirmPrompt({
        messages,
        settings,
        willSendBibleToCloud: isCloudProvider && built.willSendBibleToCloud,
      });
      const roughPlain = `生辉粗估：输入约 ${rough.inputApprox.toLocaleString()} tokens，输出预留约 ${rough.outputEstimateApprox.toLocaleString()} tokens，合计约 ${rough.totalApprox.toLocaleString()}。`;
      if (confirmPrompt.shouldPrompt) {
        if (
          !confirmInjectionPrompt({
            shouldPrompt: true,
            reasons: confirmPrompt.reasons,
            interaction: confirmPrompt.interaction,
            extraLines: [roughPlain],
          })
        ) {
          return;
        }
      }

      // 通过云端注入确认（或无需确认）后，再清空主稿与累积器，准备承接流式输出。
      setOutput("");
      accRef.current = "";

      const r = await generateShengHuiProseStream({
        ...built.args,
        settings,
        signal: ac.signal,
        workId: runWorkId,
        onDelta: (d) => {
          accRef.current += d;
          // 仅当用户仍停留在 run 起始的目标时才镜像到 UI；切走则只攒进 accRef，
          // 由 finally 写入原章节快照，避免污染新章节的 output。
          const lt = latestTargetRef.current;
          if (lt.workId === runWorkId && lt.chapterId === runChapterId) {
            setOutput((prev) => prev + d);
          }
        },
      });
      const tail = (r.text ?? "").trim();
      if (rough.totalApprox > 0) addTodayApproxTokens(rough.totalApprox);
      if (tail && !accRef.current.trim()) accRef.current = tail;
      // 同样守卫：流返回到此处的微小间隙里若已切走目标，不要回退到旧 tail 污染新视图。
      const ltAfterStream = latestTargetRef.current;
      if (ltAfterStream.workId === runWorkId && ltAfterStream.chapterId === runChapterId) {
        setOutput((prev) => (prev.trim() ? prev : tail));
      }

      // 两步模式：第一步完成后保存中间结果（外层状态由 caller 维护）；第二步完成清除。
      const phase = built.args.twoStepPhase;
      if (phase === 1) {
        onTwoStepIntermediateChange(accRef.current.trim() || tail);
        skipSnapshotAppend = true; // 第一步骨架不存快照
      } else if (phase === 2) {
        onTwoStepIntermediateChange(null);
      }
    } catch (e) {
      if (isFirstAiGateCancelledError(e)) {
        skipSnapshotAppend = true;
        return;
      }
      if (!isAbortError(e)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!skipSnapshotAppend && runWorkId) {
        const t = accRef.current.trim();
        if (t) {
          const snap = appendShengHuiSnapshot(runWorkId, runChapterId, outlineForSnapshotPreview, t);
          // 仅当用户仍停留在 run 起始的目标时才把这次生成镜像到 UI；
          // 否则快照已落入正确的桶，新视图不应被旧 run 的内容覆盖。
          const lt = latestTargetRef.current;
          const isCurrentTarget = lt.workId === runWorkId && lt.chapterId === runChapterId;
          if (isCurrentTarget) {
            setOutput(t);
          }
          onSnapshotPersisted({ snap, runWorkId, runChapterId, isCurrentTarget });
        }
      }
      accRef.current = "";
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop(): void {
    abortRef.current?.abort();
  }

  return {
    output,
    setOutput,
    busy,
    error,
    setError,
    lastRoughEstimate,
    runGenerate,
    stop,
  };
}
