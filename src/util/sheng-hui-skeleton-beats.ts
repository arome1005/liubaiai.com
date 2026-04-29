/**
 * 生辉「场景骨架」第一步：将模型输出的编号节拍列表解析为节点，便于行级展示与单条重生。
 * 与 prompt 约定一致：「序号. 简短描述」一行一条。
 */
export type ShengHuiParsedSkeletonBeat = {
  /** 1-based，与原文序号一致 */
  index1Based: number;
  /** 正文中一行 */
  rawLine: string;
  /** 去序号后的描述文本 */
  body: string;
};

const BEAT_LINE_RE = /^\s*(\d+)\s*[\.、．]\s*(.+)\s*$/;

/**
 * 从完整骨架稿解析节拍行；无匹配时返回空数组（调用方可提示用户手工编辑后再试）。
 */
export function parseShengHuiSkeletonBeats(text: string): ShengHuiParsedSkeletonBeat[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ShengHuiParsedSkeletonBeat[] = [];
  for (const rawLine of lines) {
    const m = rawLine.match(BEAT_LINE_RE);
    if (!m) continue;
    const n = parseInt(m[1] ?? "0", 10);
    if (!Number.isFinite(n) || n < 1) continue;
    out.push({ index1Based: n, rawLine, body: (m[2] ?? "").trim() });
  }
  return out;
}

/**
 * 用新生成的一行替换第 `index1Based` 条；保留其余行与换行风格（按 \n 拼接）。
 */
export function replaceShengHuiSkeletonBeatLine(
  fullText: string,
  index1Based: number,
  newLineTrimmed: string,
): { ok: true; next: string } | { ok: false; error: string } {
  const lines = fullText.split(/\r?\n/);
  let replaced = 0;
  const next = lines
    .map((line) => {
      const m = line.trim().match(BEAT_LINE_RE);
      if (m) {
        const n = parseInt(m[1] ?? "0", 10);
        if (n === index1Based) {
          replaced++;
          // 保留行首缩进略难；骨架通常不缩进，整行替换
          return newLineTrimmed;
        }
      }
      return line;
    })
    .join("\n");
  if (replaced === 0) {
    return { ok: false, error: "未在文本中找到该序号的节拍行，请检查骨架格式。" };
  }
  return { ok: true, next };
}

const FIRST_LINE_RE = (n: number) => new RegExp(`^\\s*${n}\\s*[.、．]\\s*(.+)\\s*$`);

/**
 * 从模型输出中取出一条节拍行；优先匹配「序号.」开头的第一行，否则用全文首行。
 */
export function pickSkeletonBeatLineFromModelOutput(
  text: string,
  index1Based: number,
): string | null {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return null;
  for (const line of cleaned.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (FIRST_LINE_RE(index1Based).test(t)) return t;
  }
  const first = cleaned.split(/\r?\n/)[0]?.trim();
  if (!first) return null;
  if (/^\d+\s*[.、．]/.test(first)) return first;
  return `${index1Based}. ${first}`;
}
