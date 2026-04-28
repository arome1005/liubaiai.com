/**
 * 将每次 AI 调用写入本机 IndexedDB，供「AI 用量洞察」聚合（与侧栏累加器并行，不替代）。 */
import type { AiChatMessage, AiProviderId, AiTokenUsage } from "./types";
import type { AiGenerateResult } from "./types";
import { approxUsageFromMessagesAndText } from "./token-usage-helpers";
import { putAiUsageEvent, type AiUsageEventRow } from "../storage/ai-usage-db";

export type UsageLogForRecord = {
  task: string;
  workId?: string | null;
  /** 装配器预分桶的粗估权重（会按本行 `inputTokens` 线性缩放，与无 override 时启发式一致） */
  contextInputBuckets?: AiUsageEventRow["contextInputBuckets"];
};

const SESSION_KEY = "liubai:aiUsageSessionKey";

function getOrCreateSessionKey(): string {
  try {
    const k = sessionStorage.getItem(SESSION_KEY);
    if (k) return k;
    const n = `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, n);
    return n;
  } catch {
    return `s-fallback-${Date.now()}`;
  }
}

/** 与写入事件时一致，用于「本会话」筛选。 */
export function getAiUsageSessionKey(): string {
  return getOrCreateSessionKey();
}

export function providerBucketFromProviderId(p: AiProviderId): AiUsageEventRow["providerBucket"] {
  if (p === "openai" || p === "doubao" || p === "zhipu" || p === "kimi" || p === "xiaomi") return "openai";
  if (p === "anthropic" || p === "claude-code-local") return "anthropic";
  if (p === "gemini") return "gemini";
  if (p === "ollama" || p === "mlx") return "local";
  return "router";
}

type ContextBucketKey = "chapter" | "bible" | "system" | "selection" | "rag" | "planning" | "other";

const CONTEXT_BUCKET_LABEL: Record<ContextBucketKey, string> = {
  chapter: "chapter",
  bible: "bible",
  system: "system",
  selection: "selection",
  rag: "rag",
  planning: "planning",
  other: "other",
};

function detectContextBucket(msg: AiChatMessage): ContextBucketKey {
  const t = (msg.content || "").toLowerCase();
  if (msg.role === "system") return "system";
  if (t.includes("rag") || t.includes("检索") || t.includes("召回") || t.includes("片段")) return "rag";
  if (t.includes("选区") || t.includes("selection")) return "selection";
  if (t.includes("观云") || t.includes("规划") || t.includes("大纲") || t.includes("planning")) return "planning";
  if (t.includes("锦囊") || t.includes("设定") || t.includes("世界观") || t.includes("角色卡") || t.includes("术语")) return "bible";
  if (t.includes("章节") || t.includes("正文") || t.includes("chapter")) return "chapter";
  return "other";
}

function buildContextInputBuckets(messages: AiChatMessage[], inputTokens: number): AiUsageEventRow["contextInputBuckets"] {
  const approxByBucket = new Map<ContextBucketKey, number>();
  let approxTotal = 0;
  for (const m of messages) {
    const approx = Math.max(0, approxUsageFromMessagesAndText([m], "").inputTokens);
    if (approx <= 0) continue;
    const k = detectContextBucket(m);
    approxByBucket.set(k, (approxByBucket.get(k) ?? 0) + approx);
    approxTotal += approx;
  }
  if (approxTotal <= 0 || inputTokens <= 0) return undefined;
  const scale = inputTokens / approxTotal;
  const out: Partial<Record<ContextBucketKey, number>> = {};
  for (const [k, v] of approxByBucket.entries()) {
    const n = Math.max(0, Math.round(v * scale));
    if (n > 0) out[CONTEXT_BUCKET_LABEL[k]] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 将装配器给出的 **未缩放** 分桶粗估，线性映射到本行 `inputTokens`（厂商 API 计量）。
 * 全零或空则回退为 `undefined`（让调用方走启发式）。
 */
function scalePrecomputedContextBuckets(
  raw: NonNullable<AiUsageEventRow["contextInputBuckets"]> | undefined,
  inputTokens: number,
): AiUsageEventRow["contextInputBuckets"] {
  if (!raw || inputTokens <= 0) return undefined;
  const entries = Object.entries(raw).filter(
    (e): e is [ContextBucketKey, number] => typeof e[1] === "number" && e[1] > 0,
  ) as [ContextBucketKey, number][];
  if (entries.length === 0) return undefined;
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum <= 0) return undefined;
  const scale = inputTokens / sum;
  const out: Partial<Record<ContextBucketKey, number>> = {};
  for (const [k, v] of entries) {
    const n = Math.max(0, Math.round(v * scale));
    if (n > 0) out[k] = n;
  }
  let got = 0;
  for (const v of Object.values(out)) got += v;
  if (got < inputTokens) {
    const kMax = entries.slice().sort((a, b) => b[1] - a[1])[0][0];
    out[kMax] = (out[kMax] ?? 0) + (inputTokens - got);
  } else if (got > inputTokens) {
    const kMax = entries.slice().sort((a, b) => b[1] - a[1])[0][0];
    out[kMax] = Math.max(0, (out[kMax] ?? 0) - (got - inputTokens));
  }
  return Object.keys(out).length ? out : undefined;
}

function usageToRow(
  task: string,
  workId: string | null | undefined,
  provider: AiProviderId,
  model: string,
  messages: AiChatMessage[],
  token: AiTokenUsage,
  status: AiUsageEventRow["status"],
  contextInputBucketsOverride?: NonNullable<AiUsageEventRow["contextInputBuckets"]> | undefined,
): AiUsageEventRow {
  const fromPreset = scalePrecomputedContextBuckets(contextInputBucketsOverride, token.inputTokens);
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}-${Math.random()}`,
    ts: Date.now(),
    task,
    model: model || "—",
    providerBucket: providerBucketFromProviderId(provider),
    providerId: provider,
    inputTokens: token.inputTokens,
    outputTokens: token.outputTokens,
    totalTokens: token.totalTokens,
    source: token.source,
    status,
    workId: workId ?? null,
    sessionKey: getOrCreateSessionKey(),
    contextInputBuckets: fromPreset ?? buildContextInputBuckets(messages, token.inputTokens),
  };
}

type RecordInput = {
  task: string;
  workId?: string | null;
  provider: AiProviderId;
  model: string;
  result: Pick<AiGenerateResult, "text" | "tokenUsage">;
  messages: AiChatMessage[];
  status?: AiUsageEventRow["status"];
  contextInputBuckets?: AiUsageEventRow["contextInputBuckets"];
};

/**
 * 成功或部分成功时调用；失败可传 status: failed 与空 text */
export function recordAiUsageFromGenerateResult(input: RecordInput): void {
  const { task, workId, provider, model, result, messages, status = "success", contextInputBuckets: bucketOverride } =
    input;
  if (typeof window === "undefined") return;
  const token: AiTokenUsage =
    result.tokenUsage ??
    approxUsageFromMessagesAndText(messages, (result.text ?? "").trim());
  const row = usageToRow(task, workId, provider, model, messages, token, status, bucketOverride);
  void putAiUsageEvent(row).catch(() => {
    /* quota / private */
  });
  try {
    window.dispatchEvent(new CustomEvent("liubai:ai-usage-log-updated"));
  } catch {
    /* ignore */
  }
}
