/** 步 22：概要「上次更新时间」展示 */
export function formatSummaryUpdatedAt(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString();
}
