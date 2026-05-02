/**
 * 登录用户：将 AI 用量事件同步到 Supabase，换设备登录同一账号可拉取合并。
 * 未配置 Supabase 或未登录时静默跳过。
 */
import { getSupabase } from "../lib/supabase";
import type { AiUsageEventRow } from "./ai-usage-db";
import { listAllAiUsageEvents, mergeAiUsageEventsFromRemote } from "./ai-usage-db";

const PAGE = 1000;
const MAX_PULL = 8_000;

function isConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

function rowToPayload(row: AiUsageEventRow, userId: string): Record<string, unknown> {
  return {
    id: row.id,
    user_id: userId,
    ts: row.ts,
    task: row.task,
    model: row.model,
    provider_bucket: row.providerBucket,
    provider_id: row.providerId,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    total_tokens: row.totalTokens,
    source: row.source,
    status: row.status,
    work_id: row.workId,
    session_key: row.sessionKey,
    context_input_buckets: row.contextInputBuckets ?? null,
  };
}

function payloadToRow(r: Record<string, unknown>): AiUsageEventRow | null {
  if (
    typeof r.id !== "string" ||
    typeof r.ts !== "number" ||
    typeof r.task !== "string" ||
    typeof r.model !== "string" ||
    typeof r.provider_bucket !== "string" ||
    typeof r.provider_id !== "string" ||
    typeof r.input_tokens !== "number" ||
    typeof r.output_tokens !== "number" ||
    typeof r.total_tokens !== "number" ||
    (r.source !== "api" && r.source !== "approx") ||
    (r.status !== "success" && r.status !== "failed" && r.status !== "partial") ||
    typeof r.session_key !== "string"
  ) {
    return null;
  }
  const pb = r.provider_bucket;
  if (pb !== "openai" && pb !== "anthropic" && pb !== "gemini" && pb !== "local" && pb !== "router") return null;

  let contextInputBuckets: AiUsageEventRow["contextInputBuckets"];
  const rawBuckets = r.context_input_buckets;
  if (rawBuckets && typeof rawBuckets === "object" && !Array.isArray(rawBuckets)) {
    contextInputBuckets = rawBuckets as AiUsageEventRow["contextInputBuckets"];
  }

  // 前向兼容：若 Supabase 已加 `reasoning_tokens` 列就读，未加则保持 undefined
  const rawReasoning = r.reasoning_tokens;
  const reasoningTokens =
    typeof rawReasoning === "number" && Number.isFinite(rawReasoning) && rawReasoning >= 0
      ? Math.floor(rawReasoning)
      : undefined;

  return {
    id: r.id,
    ts: r.ts,
    task: r.task,
    model: r.model,
    providerBucket: pb,
    providerId: r.provider_id,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    totalTokens: r.total_tokens,
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
    source: r.source,
    status: r.status,
    workId: typeof r.work_id === "string" ? r.work_id : null,
    sessionKey: r.session_key,
    contextInputBuckets,
  };
}

/** 单次写入后上传（仅登录时有效） */
export async function syncAiUsageEventToCloud(row: AiUsageEventRow): Promise<void> {
  if (!isConfigured() || typeof window === "undefined") return;
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;
    const { error } = await sb.from("ai_usage_event").upsert(rowToPayload(row, uid), { onConflict: "id" });
    if (error) console.warn("[ai-usage-cloud] upsert", error.message);
  } catch {
    /* ignore */
  }
}

async function fetchRemotePage(sb: ReturnType<typeof getSupabase>, from: number): Promise<AiUsageEventRow[]> {
  const { data, error } = await sb
    .from("ai_usage_event")
    .select("*")
    .order("ts", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  const out: AiUsageEventRow[] = [];
  for (const rec of data ?? []) {
    const row = payloadToRow(rec as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}

/** 从云端拉取并写入 IndexedDB（按 id 合并，与本机上限一致） */
export async function pullAiUsageEventsFromCloudAndMerge(): Promise<void> {
  if (!isConfigured() || typeof window === "undefined") return;
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session?.user?.id) return;

    const collected: AiUsageEventRow[] = [];
    let from = 0;
    while (collected.length < MAX_PULL) {
      const chunk = await fetchRemotePage(sb, from);
      if (chunk.length === 0) break;
      collected.push(...chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }
    if (collected.length === 0) return;
    await mergeAiUsageEventsFromRemote(collected);
  } catch (e) {
    console.warn("[ai-usage-cloud] pull", e);
  }
}

/** 将本机尚未上传的历史批量写入云端（登录后执行一次即可覆盖离线期间记录） */
export async function backfillLocalAiUsageToCloud(): Promise<void> {
  if (!isConfigured() || typeof window === "undefined") return;
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return;

    const local = await listAllAiUsageEvents();
    if (local.length === 0) return;

    const BATCH = 80;
    for (let i = 0; i < local.length; i += BATCH) {
      const slice = local.slice(i, i + BATCH).map((row) => rowToPayload(row, uid));
      const { error } = await sb.from("ai_usage_event").upsert(slice, { onConflict: "id" });
      if (error) console.warn("[ai-usage-cloud] backfill batch", error.message);
    }
  } catch (e) {
    console.warn("[ai-usage-cloud] backfill", e);
  }
}
