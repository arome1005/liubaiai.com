/** 步 22：概要「上次更新时间」展示 */
export function formatSummaryUpdatedAt(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString();
}

/** 步 22：概要覆盖范围（章节序号闭区间，显示为 1-based） */
export function formatSummaryScope(fromOrder?: number | null, toOrder?: number | null): string | null {
  if (fromOrder == null || toOrder == null) return null;
  if (!Number.isFinite(fromOrder) || !Number.isFinite(toOrder)) return null;
  const a = Math.floor(fromOrder) + 1;
  const b = Math.floor(toOrder) + 1;
  if (a === b) return `覆盖：第 ${a} 章`;
  return `覆盖：第 ${Math.min(a, b)}～${Math.max(a, b)} 章`;
}

/**
 * P1-09 · 概要过期检测。
 * 当正文 updatedAt 比概要 summaryUpdatedAt 晚超过 STALE_GAP_MS 时视为可能过期。
 * 仅在概要存在、正文有实质内容时触发，避免误报。
 */
const STALE_GAP_MS = 30 * 60 * 1000; // 30 分钟

export function isSummaryStale(opts: {
  contentUpdatedAt?: number | null;
  summaryUpdatedAt?: number | null;
  hasContent: boolean;
  hasSummary: boolean;
}): boolean {
  if (!opts.hasSummary || !opts.hasContent) return false;
  if (!opts.contentUpdatedAt || !opts.summaryUpdatedAt) return false;
  if (!Number.isFinite(opts.contentUpdatedAt) || !Number.isFinite(opts.summaryUpdatedAt)) return false;
  return opts.contentUpdatedAt - opts.summaryUpdatedAt > STALE_GAP_MS;
}
