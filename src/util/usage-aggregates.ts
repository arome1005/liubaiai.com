/**
 * 将本机 AI 用量事件聚合为「用量洞察」图表与表格数据。
 */
import type { AiUsageEventRow } from "../storage/ai-usage-db";
import { getAiUsageSessionKey } from "../ai/record-ai-usage";
import type {
  AiProviderId,
  ContextBreakdown,
  DailyUsage,
  PerspectiveMode,
  TimeRange,
  UsageRecord,
  UsageSource,
  UsageStats,
} from "./usage-types";

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function rowToRecord(e: AiUsageEventRow): UsageRecord {
  const src: UsageSource = e.source === "api" ? "api" : "approx";
  return {
    id: e.id,
    timestamp: new Date(e.ts),
    task: e.task,
    model: e.model,
    workId: e.workId,
    provider: e.providerBucket as AiProviderId,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    totalTokens: e.totalTokens,
    source: src,
    status: e.status,
  };
}

function eventWeight(e: AiUsageEventRow, perspective: PerspectiveMode): number {
  if (perspective === "api") return e.source === "api" ? e.totalTokens : 0;
  if (perspective === "approx") return e.source === "approx" ? e.totalTokens : 0;
  return e.totalTokens;
}

function minTsForRange(timeRange: TimeRange, now: number): number | null {
  if (timeRange === "session") return null;
  if (timeRange === "today") return startOfLocalDay(now);
  if (timeRange === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (timeRange === "30d" || timeRange === "custom") return now - 30 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function matchTime(e: AiUsageEventRow, timeRange: TimeRange, now: number): boolean {
  if (timeRange === "session") {
    return e.sessionKey === getAiUsageSessionKey();
  }
  const min = minTsForRange(timeRange, now);
  if (min == null) return true;
  return e.ts >= min;
}

function matchProvider(e: AiUsageEventRow, provider: AiProviderId): boolean {
  if (provider === "all") return true;
  return e.providerBucket === provider;
}

function matchWork(e: AiUsageEventRow, work: string): boolean {
  if (work === "all") return true;
  return (e.workId ?? "") === work;
}

function matchPerspectiveToken(e: AiUsageEventRow, perspective: PerspectiveMode): boolean {
  if (perspective === "api") return e.source === "api";
  if (perspective === "approx") return e.source === "approx";
  return true;
}

export function filterUsageEvents(
  events: AiUsageEventRow[],
  p: {
    work: string;
    timeRange: TimeRange;
    provider: AiProviderId;
    perspective: PerspectiveMode;
  },
  now = Date.now(),
): AiUsageEventRow[] {
  return events.filter(
    (e) =>
      matchTime(e, p.timeRange, now) &&
      matchProvider(e, p.provider) &&
      matchWork(e, p.work) &&
      matchPerspectiveToken(e, p.perspective),
  );
}

/** 作品下拉：本机事件中去重 workId */
export function listWorkOptionsFromEvents(events: AiUsageEventRow[]): { value: string; label: string }[] {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.workId) ids.add(e.workId);
  }
  return [...ids]
    .sort()
    .map((id) => ({ value: id, label: id.length > 12 ? `作品 ${id.slice(0, 8)}…` : `作品 ${id}` }));
}

export function buildUsageRecords(filtered: AiUsageEventRow[]): UsageRecord[] {
  return filtered
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .map(rowToRecord);
}

export function buildTaskBreakdown(filtered: AiUsageEventRow[], perspective: PerspectiveMode): ContextBreakdown[] {
  const byTask = new Map<string, number>();
  let sum = 0;
  for (const e of filtered) {
    const w = eventWeight(e, perspective);
    if (w <= 0) continue;
    const t = e.task || "未命名";
    byTask.set(t, (byTask.get(t) ?? 0) + w);
    sum += w;
  }
  if (sum <= 0) {
    return [{ name: "（无数据）", tokens: 0, percentage: 100 }];
  }
  const rows: ContextBreakdown[] = [];
  for (const [name, tokens] of byTask) {
    rows.push({ name, tokens, percentage: (tokens / sum) * 100 });
  }
  rows.sort((a, b) => b.tokens - a.tokens);
  return rows;
}

/** v1：无装配细分，左侧为「输入侧合计」单桶。 */
export function buildInputSideContextBreakdown(filtered: AiUsageEventRow[], perspective: PerspectiveMode): ContextBreakdown[] {
  const bucketName: Record<"chapter" | "bible" | "system" | "selection" | "rag" | "planning" | "other", string> = {
    chapter: "章节正文",
    bible: "锦囊/设定",
    system: "系统提示",
    selection: "选区内容",
    rag: "RAG 片段",
    planning: "观云规划",
    other: "其他上下文",
  };
  const buckets = new Map<keyof typeof bucketName, number>();
  let inSum = 0;
  for (const e of filtered) {
    const w = eventWeight(e, perspective);
    if (w <= 0) continue;
    const rowInput = Math.max(0, e.inputTokens);
    if (rowInput <= 0) continue;
    inSum += rowInput;
    if (e.contextInputBuckets && Object.keys(e.contextInputBuckets).length > 0) {
      let rowBucketSum = 0;
      for (const [k, v] of Object.entries(e.contextInputBuckets)) {
        const key = k as keyof typeof bucketName;
        const val = Number(v);
        if (!Number.isFinite(val) || val <= 0) continue;
        buckets.set(key, (buckets.get(key) ?? 0) + val);
        rowBucketSum += val;
      }
      if (rowBucketSum < rowInput) {
        buckets.set("other", (buckets.get("other") ?? 0) + (rowInput - rowBucketSum));
      }
      continue;
    }
    buckets.set("other", (buckets.get("other") ?? 0) + rowInput);
  }
  if (inSum <= 0) {
    return [{ name: "（无数据）", tokens: 0, percentage: 100 }];
  }
  const out: ContextBreakdown[] = [];
  for (const [k, tokens] of buckets.entries()) {
    if (tokens <= 0) continue;
    out.push({
      name: bucketName[k],
      tokens: Math.round(tokens),
      percentage: (tokens / inSum) * 100,
    });
  }
  out.sort((a, b) => b.tokens - a.tokens);
  if (out.length === 0) return [{ name: "输入侧（已计量）", tokens: Math.round(inSum), percentage: 100 }];
  return out;
}

export function buildTimelineBuckets(
  filtered: AiUsageEventRow[],
  timeRange: TimeRange,
  perspective: PerspectiveMode,
  now = Date.now(),
): DailyUsage[] {
  if (timeRange === "session" || timeRange === "today") {
    const byHour = new Map<number, { total: number; api: number; approx: number; calls: number; byP: Record<AiProviderId, number> }>();
    for (let h = 0; h < 24; h++) {
      byHour.set(h, { total: 0, api: 0, approx: 0, calls: 0, byP: { openai: 0, anthropic: 0, gemini: 0, local: 0, router: 0, all: 0 } });
    }
    const d0 = new Date(startOfLocalDay(now));
    const ymd = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;

    for (const e of filtered) {
      if (e.ts < startOfLocalDay(now) && timeRange === "today") continue;
      const w = eventWeight(e, perspective);
      if (w <= 0) continue;
      const h = new Date(e.ts).getHours();
      const row = byHour.get(h)!;
      row.total += w;
      row.calls += 1;
      if (e.source === "api") row.api += w;
      else row.approx += w;
      const pk = e.providerBucket as AiProviderId;
      row.byP[pk] = (row.byP[pk] ?? 0) + w;
      row.byP.all = (row.byP.all ?? 0) + w;
    }
    const out: DailyUsage[] = [];
    for (let h = 0; h < 24; h++) {
      const r = byHour.get(h)!;
      if (r.calls === 0 && r.total === 0) continue;
      out.push({
        date: ymd,
        hour: h,
        total: Math.round(r.total),
        apiTotal: Math.round(r.api),
        approxTotal: Math.round(r.approx),
        calls: r.calls,
        byProvider: { ...r.byP },
      });
    }
    return out;
  }

  // 按日聚合（7d / 30d / custom）
  const byDay = new Map<string, { total: number; api: number; approx: number; calls: number; byP: Record<AiProviderId, number> }>();
  for (const e of filtered) {
    const w = eventWeight(e, perspective);
    if (w <= 0) continue;
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!byDay.has(key)) {
      byDay.set(key, { total: 0, api: 0, approx: 0, calls: 0, byP: { openai: 0, anthropic: 0, gemini: 0, local: 0, router: 0, all: 0 } });
    }
    const r = byDay.get(key)!;
    r.total += w;
    r.calls += 1;
    if (e.source === "api") r.api += w;
    else r.approx += w;
    const pk = e.providerBucket as AiProviderId;
    r.byP[pk] = (r.byP[pk] ?? 0) + w;
    r.byP.all = (r.byP.all ?? 0) + w;
  }
  return [...byDay.keys()]
    .sort()
    .map((date) => {
      const r = byDay.get(date)!;
      return {
        date,
        total: Math.round(r.total),
        apiTotal: Math.round(r.api),
        approxTotal: Math.round(r.approx),
        calls: r.calls,
        byProvider: { ...r.byP },
      };
    });
}

function budgetRow(used: number, limit: number) {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return {
    used: Math.round(used),
    limit: limit > 0 ? limit : 0,
    percentage: limit > 0 ? Math.min(100, pct) : 0,
    isOverBudget: limit > 0 && used > limit,
    isNearThreshold: limit > 0 && used / limit >= 0.8 && used <= limit,
  };
}

export function buildUsageStats(
  allEvents: AiUsageEventRow[],
  filtered: AiUsageEventRow[],
  perspective: PerspectiveMode,
  opts: {
    dailyTokenLimit: number;
    sessionTokenLimit: number;
    now?: number;
  },
): UsageStats {
  const now = opts.now ?? Date.now();
  const day0 = startOfLocalDay(now);
  const sk = getAiUsageSessionKey();

  let dayUsed = 0;
  for (const e of allEvents) {
    if (e.ts < day0) continue;
    dayUsed += eventWeight(e, perspective);
  }

  let sessionUsed = 0;
  for (const e of allEvents) {
    if (e.sessionKey !== sk) continue;
    sessionUsed += eventWeight(e, perspective);
  }

  let lifetime = 0;
  for (const e of allEvents) {
    lifetime += eventWeight(e, perspective);
  }

  let inSum = 0;
  let outSum = 0;
  let n = 0;
  for (const e of filtered) {
    const w = eventWeight(e, perspective);
    if (w <= 0) continue;
    const ratioIn = e.totalTokens > 0 ? e.inputTokens / e.totalTokens : 0.5;
    inSum += w * ratioIn;
    outSum += w * (1 - ratioIn);
    n += 1;
  }
  const tot = inSum + outSum;
  const avgIn = n > 0 ? inSum / n : 0;
  const avgOut = n > 0 ? outSum / n : 0;
  const avgT = n > 0 ? tot / n : 0;

  return {
    dailyBudget: budgetRow(dayUsed, opts.dailyTokenLimit),
    sessionBudget: budgetRow(sessionUsed, opts.sessionTokenLimit),
    lifetimeTotal: Math.round(lifetime),
    avgInputRatio: tot > 0 ? inSum / tot : 0.78,
    avgOutputRatio: tot > 0 ? outSum / tot : 0.22,
    avgPerCall: {
      input: Math.round(avgIn),
      output: Math.round(avgOut),
      total: Math.round(avgT),
    },
  };
}
