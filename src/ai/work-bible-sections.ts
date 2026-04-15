/**
 * 与 `buildBibleMarkdownExport`（`src/storage/bible-markdown.ts`）中 `## ` 标题一致，
 * 用于写作侧栏「本书锦囊」导出 Markdown 的板块级勾选注入（步 9 可选增强）。
 */
export const WORK_BIBLE_SECTION_HEADERS = [
  "人物卡",
  "世界观条目",
  "伏笔",
  "时间线",
  "章头/章尾模板",
  "术语 / 人名表",
] as const;

export function defaultWorkBibleSectionMask(): Record<string, boolean> {
  return Object.fromEntries(WORK_BIBLE_SECTION_HEADERS.map((h) => [h, true]));
}

export function filterWorkBibleMarkdownBySections(md: string, include: Record<string, boolean>): string {
  const trimmed = md.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\n(?=## )/);
  const sectionParts: string[] = [];
  let preamble = "";
  for (const part of parts) {
    if (/^##\s/m.test(part)) sectionParts.push(part);
    else preamble = part;
  }
  const keptSections = sectionParts.filter((part) => {
    const m = part.match(/^##\s+(.+?)\s*$/m);
    if (!m) return true;
    return include[m[1].trim()] !== false;
  });
  if (keptSections.length === 0) return "";
  return [preamble, ...keptSections].join("\n").trim();
}
