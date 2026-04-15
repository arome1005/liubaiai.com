/**
 * 应用内调用云端/本地 LLM 的 **统一入口**（总体规划 §11 步 3）。
 * 实现细节在 `providers.ts`；此处包装 **首次使用 AI 门禁**（步 4）后再委托 `providers`。
 */
import {
  generateWithProvider as generateWithProviderImpl,
  generateWithProviderStream as generateWithProviderStreamImpl,
  embedWithProvider as embedWithProviderImpl,
} from "./providers";
import { FirstAiGateCancelledError, requestFirstAiUseGate } from "./first-ai-gate";
import type { AiChatMessage, AiGenerateResult, AiProviderConfig, AiProviderId } from "./types";

export { resolveOpenAiCompatibleBaseUrl } from "./providers";
export { FirstAiGateCancelledError, isFirstAiGateCancelledError } from "./first-ai-gate";
export type { AssembleContextInputV1 } from "./assemble-context";
export { assembleChatMessagesPlaceholder } from "./assemble-context";

export async function generateWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
}): Promise<AiGenerateResult> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  return generateWithProviderImpl(args);
}

export async function generateWithProviderStream(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  messages: AiChatMessage[];
  onDelta: (textDelta: string) => void;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<AiGenerateResult> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  return generateWithProviderStreamImpl(args);
}

export async function embedWithProvider(args: {
  provider: AiProviderId;
  config: AiProviderConfig;
  input: string;
  signal?: AbortSignal;
}): Promise<{ embedding: number[] }> {
  const ok = await requestFirstAiUseGate();
  if (!ok) throw new FirstAiGateCancelledError();
  return embedWithProviderImpl(args);
}
