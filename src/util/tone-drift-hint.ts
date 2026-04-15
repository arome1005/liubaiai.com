/**
 * §11 步 47：调性漂移 **轻量提示**（仅提示不阻断）。
 * 与路线图 5.10「禁用句式计数 / 标杆段距离」对齐：当前无 embedding，采用禁用套话命中 + 句长对比。
 */

function splitBannedPhrases(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    for (const part of line.split(/[、，,]/)) {
      const t = part.trim();
      if (t.length >= 2) out.push(t);
    }
  }
  return [...new Set(out)];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (i <= haystack.length - needle.length) {
    const j = haystack.indexOf(needle, i);
    if (j < 0) break;
    n++;
    i = j + Math.max(1, needle.length);
  }
  return n;
}

/** 按句号类切分后，返回非空句的平均字符数；句数不足时返回 null */
function avgSentenceCharLen(text: string): number | null {
  const parts = text
    .split(/[。！？…]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  if (parts.length < 2) return null;
  const sum = parts.reduce((a, s) => a + s.length, 0);
  return sum / parts.length;
}

export type ToneDriftHintInput = {
  bannedPhrases: string;
  styleAnchor: string;
  draftText: string;
};

/**
 * 返回面向用户的中文提示行（空数组表示无命中规则）。
 */
export function computeToneDriftHints(input: ToneDriftHintInput): string[] {
  const draft = input.draftText.trim();
  if (!draft) return [];

  const hints: string[] = [];
  const phrases = splitBannedPhrases(input.bannedPhrases ?? "");
  for (const p of phrases) {
    const c = countOccurrences(draft, p);
    if (c > 0) hints.push(`禁用套话「${p}」在草稿中出现 ${c} 次。`);
  }

  const anchor = (input.styleAnchor ?? "").trim();
  if (anchor.length >= 24) {
    const anchorAvg = avgSentenceCharLen(anchor);
    const draftAvg = avgSentenceCharLen(draft);
    if (anchorAvg != null && draftAvg != null && draftAvg >= anchorAvg * 2.15 && draftAvg - anchorAvg >= 12) {
      hints.push(
        `草稿平均句长（约 ${draftAvg.toFixed(0)} 字/句）明显长于文风锚点（约 ${anchorAvg.toFixed(0)} 字/句），可能存在拖沓或调性漂移。`,
      );
    }
  }

  return hints;
}
