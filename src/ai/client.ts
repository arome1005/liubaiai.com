/**
 * 应用内调用云端/本地 LLM 的 **统一入口**（总体规划 §11 步 3）。
 * 实现细节在 `providers.ts`；此处包装 **首次使用 AI 门禁**（步 4）后再委托 `providers`。
 *
 * 还包装了 **Owner 模式覆盖**：当登录账号是 owner、Owner 开关开启、本机 sidecar 健康时，
 * 自动把 provider 切到 "claude-code-local"，把 AI 流量从计费 API 转到本机 Pro 订阅。
 * 详见 `src/util/owner-mode.ts`。
 */
import {
  generateWithProvider as generateWithProviderImpl,
  generateWithProviderStream as generateWithProviderStreamImpl,
  embedWithProvider as embedWithProviderImpl,
} from "./providers";
import { FirstAiGateCancelledError, requestFirstAiUseGate } from "./first-ai-gate";
import {
  shouldUseOwnerSidecar,
  getOwnerSidecarToken,
  getOwnerSidecarBaseUrl,
  getOwnerModel,
} from "../util/owner-mode";
import type { AiChatMessage, AiGenerateResult, AiProviderConfig, AiProviderId } from "./types";
import { recordAiUsageFromGenerateResult, type UsageLogForRecord } from "./record-ai-usage";

export { resolveOpenAiCompatibleBaseUrl } from "./providers";
export { FirstAiGateCancelledError, isFirstAiGateCancelledError } from "./first-ai-gate";
export type { AssembleContextInputV1 } from "./assemble-context";
export { assembleChatMessagesPlaceholder } from "./assemble-context";

/**
 * 根据 owner 状态决定是否把当前调用切到本机 sidecar。
 * 返回新的 { provider, config }；不需要切换时原样返回。
 *
 * 注意：仅接管 **Claude 系列模型** 没必要——sidecar 后端任何 prompt 都能跑，
 * 但 owner 切换后实际跑的是 Claude，调用方传过来的是 OpenAI/Gemini 提示词时
 * 也会用 Claude 生成。这是 by design：owner 选择"我现在想烧订阅"就是接受这一点。
 */
async function maybeOverrideToOwnerSidecar(
  provider: AiProviderId,
  config: AiProviderConfig,
): Promise<{ provider: AiProviderId; config: AiProviderConfig }> {
  // 已经是 owner 直连：原样
  if (provider === "claude-code-local") return { provider, config };
  if (!(await shouldUseOwnerSidecar())) return { provider, config };
  return {
    provider: "claude-code-local",
    config: {
      ...config,
      id: "claude-code-local",
      label: "Claude Code（订阅）",
      baseUrl: getOwnerSidecarBaseUrl(),
      apiKey: getOwnerSidecarToken(),
      model: getOwnerModel(),
    },
  };
}

export async function generateWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  /** 传入后写入本机「用量洞察」事件表（与侧栏累加器并行） */
  usageLog?: UsageLogForRecord;
}): Promise<AiGenerateResult> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  const { provider, config } = await maybeOverrideToOwnerSidecar(args.provider, args.config);
  const { usageLog, ...rest } = args;
  const r = await generateWithProviderImpl({ ...rest, provider, config });
  if (typeof window !== "undefined") {
    const task = usageLog?.task ?? "AI 调用";
    recordAiUsageFromGenerateResult({
      task,
      workId: usageLog?.workId,
      provider,
      model: config.model ?? "",
      result: r,
      messages: args.messages,
      status: "success",
      contextInputBuckets: usageLog?.contextInputBuckets,
    });
  }
  return r;
}

export async function generateWithProviderStream(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  onDelta: (textDelta: string) => void;
  temperature?: number;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** 传入后写入本机「用量洞察」事件表（与侧栏累加器并行） */
  usageLog?: UsageLogForRecord;
}): Promise<AiGenerateResult> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  const { provider, config } = await maybeOverrideToOwnerSidecar(args.provider, args.config);
  const { usageLog, ...rest } = args;
  const r = await generateWithProviderStreamImpl({ ...rest, provider, config });
  if (typeof window !== "undefined") {
    const task = usageLog?.task ?? "AI 调用";
    recordAiUsageFromGenerateResult({
      task,
      workId: usageLog?.workId,
      provider,
      model: config.model ?? "",
      result: r,
      messages: args.messages,
      status: "success",
      contextInputBuckets: usageLog?.contextInputBuckets,
    });
  }
  return r;
}

export async function embedWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  input: string;
  signal?: AbortSignal;
}): Promise<{ embedding: number[] }> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  // embedding 不接管 owner 模式（Claude 不提供 embedding；继续走原 provider）
  return embedWithProviderImpl(args);
}
