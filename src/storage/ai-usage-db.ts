/**
 * AI 用量事件：独立 Dexie 库，避免与主写作库 `SCHEMA_VERSION` 迁移绑定。
 * 未登录时仅本机；登录后由 `ai-usage-cloud` 与账号同步。
 */
import Dexie, { type Table } from "dexie";

const AI_USAGE_DB = "liubai-ai-usage";
const MAX_EVENTS = 8_000;

export type AiUsageEventRow = {
  id: string;
  /** ms */
  ts: number;
  task: string;
  model: string;
  /** 与用量筛选一致：openai / anthropic / gemini / local / router */
  providerBucket: "openai" | "anthropic" | "gemini" | "local" | "router";
  /** 完整提供方 id（与 AiProviderId 一致，便于排错） */
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  source: "api" | "approx";
  status: "success" | "failed" | "partial";
  workId: string | null;
  sessionKey: string;
  /**
   * 输入侧上下文分桶（仅数值，不存原文）：
   * chapter / bible / system / selection / rag / planning / other
   */
  contextInputBuckets?: Partial<
    Record<"chapter" | "bible" | "system" | "selection" | "rag" | "planning" | "other", number>
  >;
};

class AiUsageDexie extends Dexie {
  events!: Table<AiUsageEventRow, string>;

  constructor() {
    super(AI_USAGE_DB);
    this.version(1).stores({
      events: "id, ts, providerBucket, task, workId, sessionKey",
    });
  }
}

let _db: AiUsageDexie | null = null;

function db(): AiUsageDexie {
  if (!_db) {
    _db = new AiUsageDexie();
  }
  return _db;
}

export async function putAiUsageEvent(row: AiUsageEventRow): Promise<void> {
  const d = db();
  await d.events.put(row);
  const n = await d.events.count();
  if (n <= MAX_EVENTS) return;
  const extra = n - MAX_EVENTS;
  const old = await d.events.orderBy("ts").limit(extra).primaryKeys();
  await d.events.bulkDelete(old);
}

/** 合并云端下载的记录（按 id upsert，超出上限时删最旧） */
export async function mergeAiUsageEventsFromRemote(rows: AiUsageEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  const d = db();
  await d.events.bulkPut(rows);
  const n = await d.events.count();
  if (n <= MAX_EVENTS) return;
  const extra = n - MAX_EVENTS;
  const old = await d.events.orderBy("ts").limit(extra).primaryKeys();
  await d.events.bulkDelete(old);
}

export async function listAllAiUsageEvents(): Promise<AiUsageEventRow[]> {
  return db().events.orderBy("ts").reverse().toArray();
}

export async function listAiUsageEventsSince(minTs: number): Promise<AiUsageEventRow[]> {
  return db().events.where("ts").aboveOrEqual(minTs).toArray();
}
