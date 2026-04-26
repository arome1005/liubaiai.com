/** 行级对比 diff（LCS 算法，上限 400 行） */
export type DiffLine = { kind: "same" | "del" | "add"; text: string };

export function simpleDiffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n").slice(0, 400);
  const b = newText.split("\n").slice(0, 400);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ kind: "same", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ kind: "add", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ kind: "del", text: a[i - 1] });
      i--;
    }
  }
  return result;
}

/** 折叠连续 same 行，保留每段变更前后各 ctx 行上下文 */
export function collapseDiff(lines: DiffLine[], ctx = 3): DiffLine[] {
  const out: DiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "same") {
      out.push(lines[i++]);
    } else {
      let end = i;
      while (end < lines.length && lines[end].kind === "same") end++;
      const len = end - i;
      if (len <= ctx * 2) {
        for (let k = i; k < end; k++) out.push(lines[k]);
      } else {
        for (let k = 0; k < ctx; k++) out.push(lines[i + k]);
        out.push({ kind: "same", text: `\u00b7\u00b7\u00b7 折叠 ${len - ctx * 2} 行未变更内容 \u00b7\u00b7\u00b7` });
        for (let k = end - ctx; k < end; k++) out.push(lines[k]);
      }
      i = end;
    }
  }
  return out;
}
