/** 流光页「批量粘贴」：多条正文拆成多条碎片（步 37 后续 · 批量入库） */
export const INSPIRATION_BATCH_MAX_ITEMS = 80;

/** 单独一行仅含 `---`（允许首尾空白）作为分隔，或段落之间空一行。 */
const SEP_LINE_ONLY_DASHES = /(?:^|\r?\n)\s*---\s*(?:\r?\n|$)/;

/**
 * 优先按「独立一行的 ---」分段；否则按空行（连续换行）分段。
 * 去掉首尾空白；跳过空段。
 */
export function splitInspirationBatchPaste(raw: string): string[] {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  const parts = SEP_LINE_ONLY_DASHES.test(t)
    ? t.split(SEP_LINE_ONLY_DASHES)
    : t.split(/\n(?:\s*\n)+/);

  const out = parts.map((s) => s.trim()).filter(Boolean);
  return out.slice(0, INSPIRATION_BATCH_MAX_ITEMS);
}
