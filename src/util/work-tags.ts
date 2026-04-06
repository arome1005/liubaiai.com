/** 留白作品标签（路线图 3.5）：入库规范化与装配器侧写（`tagProfileText`） */

export function normalizeWorkTagList(input: string[] | undefined | null): string[] | undefined {
  if (!input?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of input) {
    const t = String(s).trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.length ? out : undefined;
}

/** 用户输入一行：逗号、顿号或空白分隔 */
export function parseWorkTagsInputLine(line: string): string[] {
  return line
    .split(/[,，、\s]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 装配器用短侧写；无标签时返回 undefined */
export function workTagsToProfileText(tags: string[] | undefined | null): string | undefined {
  const n = normalizeWorkTagList(tags ?? undefined);
  if (!n?.length) return undefined;
  return n.map((x) => `- ${x}`).join("\n");
}
