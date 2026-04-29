/**
 * 生辉·版本对比：词元级 LCS + 并排位 + **按块合并** 的 hunk，用于与章节正文/快照之间「应用此块」。
 * 不引入第三方；过长文本返回 null 回退行级 `lineDiffRows`（由 UI 层决定）。
 */
import { lineDiffRows, type TextLineDiffRow } from "./text-line-diff";
// 让消费方（如 ShengHuiSnapshotDiffPanel）从本文件单点导入 fallback 行级 diff 类型。
export type { TextLineDiffRow };

const MAX_TOKENS = 6000;

export type ShengHuiTokenDiffOp = { kind: "same" | "del" | "ins"; t: string; a0: number; a1: number; b0: number; b1: number };

export type ShengHuiTextHunk = {
  id: string;
  /** 在 `oldText`（左侧 / 被替换方）中的起止。纯插入时 oldStart===oldEnd。 */
  oldStart: number;
  oldEnd: number;
  newText: string;
  oldText: string;
};

type Tok = { tokens: string[]; off: number[] } | null;

/**
 * 中日英混合词元切分；空白与换行保留，便于对稿。
 * `off[i]` 为第 i 个词元在原文中的起址。
 */
export function tokenizeShengHuiProse(s: string): Tok {
  if (!s) return { tokens: [], off: [] };
  const re = /[\u4e00-\u9fff]|[\u3040-\u30ff]|[a-zA-Z0-9_]+|[^\S\n]+|\n+/g;
  const tokens: string[] = [];
  const off: number[] = [];
  for (const m of s.matchAll(re)) {
    if (m.index == null) continue;
    tokens.push(m[0]);
    off.push(m.index);
  }
  if (tokens.length > MAX_TOKENS) return null;
  return { tokens, off };
}

/**
 * 与 `lineDiffRows` 同样的 O(nm) LCS 回溯，对象换成词元表。
 * `a0/a1` 在 kind===same|del 时有意义；`b0/b1` 在 same|ins 时有意义；另一侧用 -1 标无效。
 */
export function buildShengHuiTokenDiffOps(
  a: string,
  b: string,
): ShengHuiTokenDiffOp[] | null {
  const ta = tokenizeShengHuiProse(a);
  const tb = tokenizeShengHuiProse(b);
  if (ta == null || tb == null) return null;
  if (ta.tokens.length === 0 && tb.tokens.length === 0) return [];
  const { tokens: la, off: sa } = ta;
  const { tokens: lb, off: sb } = tb;
  const n = la.length;
  const m = lb.length;
  if (n === 0) {
    return lb.map((t, j) => ({
      kind: "ins" as const,
      t,
      a0: 0,
      a1: 0,
      b0: sb[j]!,
      b1: sb[j]! + t.length,
    }));
  }
  if (m === 0) {
    return la.map((t, i) => ({
      kind: "del" as const,
      t,
      a0: sa[i]!,
      a1: sa[i]! + t.length,
      b0: 0,
      b1: 0,
    }));
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (la[i] === lb[j]) dp[i]![j]! = 1 + dp[i + 1]![j + 1]!;
      else dp[i]![j]! = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: ShengHuiTokenDiffOp[] = [];
  let i = 0;
  let j = 0;
  const push = (o: ShengHuiTokenDiffOp) => {
    out.push(o);
  };
  while (i < n && j < m) {
    if (la[i] === lb[j]) {
      const t = la[i]!;
      push({ kind: "same", t, a0: sa[i]!, a1: sa[i]! + t.length, b0: sb[j]!, b1: sb[j]! + t.length });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      const t = la[i]!;
      push({ kind: "del", t, a0: sa[i]!, a1: sa[i]! + t.length, b0: -1, b1: -1 });
      i++;
    } else {
      const t = lb[j]!;
      push({ kind: "ins", t, a0: -1, a1: -1, b0: sb[j]!, b1: sb[j]! + t.length });
      j++;
    }
  }
  while (i < n) {
    const t = la[i]!;
    push({ kind: "del", t, a0: sa[i]!, a1: sa[i]! + t.length, b0: -1, b1: -1 });
    i++;
  }
  while (j < m) {
    const t = lb[j]!;
    push({ kind: "ins", t, a0: -1, a1: -1, b0: sb[j]!, b1: sb[j]! + t.length });
    j++;
  }
  return out;
}

/**
 * 将「两次 same 之间」的 del+ins 合并为一块。纯插入用上一段 `same` 的 `a1` 为锚点（0 起亦覆盖）。
 */
export function mergeShengHuiHunksFromOps(
  a: string,
  ops: ShengHuiTokenDiffOp[],
): ShengHuiTextHunk[] {
  if (ops.length === 0) return [];
  const result: ShengHuiTextHunk[] = [];
  let n = 0;
  const flush = (buf: ShengHuiTokenDiffOp[], insertAt: number) => {
    if (buf.length === 0) return;
    const dels = buf.filter((x) => x.kind === "del");
    const inss = buf.filter((x) => x.kind === "ins");
    if (dels.length === 0 && inss.length === 0) return;
    const newText = inss.map((x) => x.t).join("");
    n++;
    if (dels.length > 0) {
      const oldStart = Math.min(...dels.map((d) => d.a0));
      const oldEnd = Math.max(...dels.map((d) => d.a1));
      result.push({
        id: `h${n}`,
        oldStart,
        oldEnd,
        newText,
        oldText: a.slice(oldStart, oldEnd),
      });
    } else {
      const p = insertAt;
      result.push({
        id: `h${n}`,
        oldStart: p,
        oldEnd: p,
        newText,
        oldText: "",
      });
    }
  };
  let buf: ShengHuiTokenDiffOp[] = [];
  let insertAtAfterPrevSame = 0;
  for (const o of ops) {
    if (o.kind === "same") {
      flush(buf, insertAtAfterPrevSame);
      buf = [];
      insertAtAfterPrevSame = o.a1;
    } else {
      buf.push(o);
    }
  }
  flush(buf, insertAtAfterPrevSame);
  return result;
}

/**
 * 自后向前应用 hunk 列表，使偏移不被前面替换破坏。
 */
export function applyShengHuiHunks(
  oldText: string,
  hunks: Pick<ShengHuiTextHunk, "oldStart" | "oldEnd" | "newText">[],
): string {
  if (hunks.length === 0) return oldText;
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  let t = oldText;
  for (const { oldStart, oldEnd, newText } of sorted) {
    t = t.slice(0, oldStart) + newText + t.slice(oldEnd);
  }
  return t;
}

/** 并排行：同一段在左右各一列。 */
export type ShengHuiTokenSideBySideLine = { left: string; right: string; key: string; isChange: boolean };

/**
 * 为并排 UI 生成分行：合并连续 `same`；`same` 之间的 `del`/`ins` 合并为一行，左=删、右=插（可一侧为空）。
 */
export function buildShengHuiTokenSideBySideLines(ops: ShengHuiTokenDiffOp[] | null): ShengHuiTokenSideBySideLine[] {
  if (!ops?.length) return [];
  const out: ShengHuiTokenSideBySideLine[] = [];
  let k = 0;
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === "same") {
      const s: string[] = [];
      while (i < ops.length && ops[i]!.kind === "same") {
        s.push(ops[i]!.t);
        i++;
      }
      const t = s.join("");
      k++;
      out.push({ left: t, right: t, key: `L${k}`, isChange: false });
    } else {
      const ch: ShengHuiTokenDiffOp[] = [];
      while (i < ops.length && ops[i]!.kind !== "same") {
        ch.push(ops[i]!);
        i++;
      }
      const left = ch.filter((o) => o.kind === "del").map((o) => o.t).join("");
      const right = ch.filter((o) => o.kind === "ins").map((o) => o.t).join("");
      k++;
      if (left || right) {
        out.push({ left, right, key: `L${k}`, isChange: true });
      }
    }
  }
  return out;
}

/** 词元 diff 失败或 `null` 时回退行级（保持现有 `lineDiffRows` 行为）。 */
export function lineDiffOrNull(a: string, b: string): TextLineDiffRow[] | null {
  return lineDiffRows(a, b);
}
