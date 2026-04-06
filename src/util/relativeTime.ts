/** 作品库等：相对「更新时间」短文案 */
export function formatRelativeUpdateMs(updatedAtMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - updatedAtMs);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days} 天前`;
  return new Date(updatedAtMs).toLocaleDateString();
}
