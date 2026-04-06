/** 行级 LCS diff，用于 AI 草稿「替换选区」前的简版对比（无第三方依赖）。 */
export type TextLineDiffRow = { kind: "same" | "del" | "ins"; line: string };

const MAX_LINES = 600;

export function lineDiffRows(a: string, b: string): TextLineDiffRow[] | null {
  const la = a.split("\n");
  const lb = b.split("\n");
  if (la.length > MAX_LINES || lb.length > MAX_LINES) return null;

  const n = la.length;
  const m = lb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (la[i] === lb[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: TextLineDiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      out.push({ kind: "same", line: la[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", line: la[i] });
      i++;
    } else {
      out.push({ kind: "ins", line: lb[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: "del", line: la[i] });
    i++;
  }
  while (j < m) {
    out.push({ kind: "ins", line: lb[j] });
    j++;
  }
  return out;
}
