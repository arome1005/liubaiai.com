import { createChapter, createWork, updateChapter } from "../db/repo";
import type { Work } from "../db/types";
import { CHAPTER_ID_AFTER_DI } from "../util/chapter-heading-pattern";

export type ParsedChapter = { title: string; content: string };

export type ParsedWorkForImport = {
  /** 作品标题（书架显示） */
  workTitle: string;
  chapters: ParsedChapter[];
};

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

function basenameTitle(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  return base.replace(/\.[^.]+$/, "").trim() || "导入的作品";
}

function normalizeTextBody(text: string): string {
  return stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isMeaningfulBody(s: string): boolean {
  return s.replace(/\s+/g, "").length > 0;
}

function stripInvisible(s: string): string {
  // Remove common invisible/control chars that break trimming & display
  return s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\t/g, " ");
}

function stripMarkdownLinePrefix(s: string): string {
  // Docx->Markdown 常见前缀：ATX 标题、引用、列表符号等；切章时先忽略这些"版式符号"
  // e.g. "## 第1章 xxx" / "> 第1章" / "- 第1章"
  return s
    .replace(/^\s{0,4}(?:#{1,6}\s+)?/, "")
    .replace(/^\s{0,4}(?:>\s+)?/, "")
    .replace(/^\s{0,4}(?:[-*+]\s+)?/, "")
    .trim();
}

function firstNonEmptyLine(s: string): { line: string; rest: string } | null {
  const lines = s.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = stripMarkdownLinePrefix(stripInvisible(lines[i] ?? ""));
    if (t) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const line = stripMarkdownLinePrefix(stripInvisible(lines[idx] ?? ""));
  const rest = lines.slice(idx + 1).join("\n").trim();
  return { line, rest };
}

/**
 * 纯文本（.txt / 无 `##` 的 markdown）按常见中文网文章回标题切章。
 * - 支持：第X章/回/卷；序章/楔子/引子/前言/后记/终章/尾声 等
 * - 若无可识别标题，则返回单章「全文」
 */
export function splitPlainTextIntoChapters(text: string): ParsedChapter[] {
  const body = normalizeTextBody(text).trim();
  if (!isMeaningfulBody(body)) return [];

  // Detect heads but don't overmatch normal content lines（节号规则见 chapter-heading-pattern）
  // 禁止用 \s 匹配换行，否则「第1章」后的 \n 会被当成副标题起始，.* 吞掉全书只剩一次 match
  //
  // titleSuffixRe：章号（第X章）之后的可选标题文本，支持三种格式：
  //   1. 有分隔符：「：/:/·/、/-/—」后接任意文字  e.g. "第47章：葬皇！"
  //   2. 有空格：空格/制表符后接任意文字           e.g. "第47章 葬皇！"
  //   3. 无分隔符：直接跟任意文字（聚合站常见格式） e.g. "第47章葬皇！"
  // 三种均以行尾 \s*$ 收尾，确保只匹配整行标题而非段落中间的引用。
  const titleSuffixRe = String.raw`[^\n]*`;
  const mdPrefixRe = String.raw`(?:#{1,6}\s+|>\s+|[-*+]\s+)?`;
  const headRe = new RegExp(
    [
      // 第X章 / 第十二回 / 第3卷……（支持【】括号、各种分隔符）
      String.raw`^\s*${mdPrefixRe}(?:【\s*)?${CHAPTER_ID_AFTER_DI}(?:\s*】)?${titleSuffixRe}\s*$`,
      // 其他常见单行标题（不含正文）
      String.raw`^\s*${mdPrefixRe}(?:【\s*)?(?:序章|楔子|引子|前言|后记|终章|尾声|番外)(?:\s*】)?[^\n]*\s*$`,
    ].join("|"),
    "gm",
  );
  // headReTest：不带 g 标志的纯检测用正则，避免 headRe.test() 修改 lastIndex 污染后续匹配
  const headReTest = new RegExp(headRe.source, "m");

  const matches = [...body.matchAll(headRe)];
  if (matches.length === 0) {
    return [{ title: "全文", content: body }];
  }

  const chapters: ParsedChapter[] = [];

  // 开篇（标题前有正文则作为「前言」）
  const first = matches[0];
  const firstIdx = first?.index ?? 0;
  const preface = body.slice(0, firstIdx).trim();
  if (isMeaningfulBody(preface)) {
    chapters.push({ title: "前言", content: preface });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const titleLineRaw = stripMarkdownLinePrefix(stripInvisible(m[0] ?? ""));
    const headStart = m.index ?? 0;
    const headEnd = headStart + (m[0] ?? "").length;
    const nextStart = i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
    let content = body.slice(headEnd, nextStart).trim();

    // 有些导出文本会出现重复标题/空章，过滤掉无内容的章
    if (!isMeaningfulBody(content)) continue;

    // 标题补全：有些源文本会写成「第2章」下一行才是章名
    const titleLine = titleLineRaw.replace(/^\s*【\s*/, "").replace(/\s*】\s*$/, "").trim();
    const onlyId = new RegExp(String.raw`^${CHAPTER_ID_AFTER_DI}\s*$`).test(titleLine);
    if (onlyId) {
      const next = firstNonEmptyLine(content);
      if (next && next.line.length <= 40 && !headReTest.test(next.line)) {
        const mergedTitle = `${titleLine} · ${next.line}`;
        content = next.rest;
        if (isMeaningfulBody(content)) {
          chapters.push({ title: mergedTitle, content });
          continue;
        }
      }
    }

    chapters.push({ title: titleLine || `第${i + 1}章`, content });
  }

  return chapters.length > 0 ? chapters : [{ title: "全文", content: body }];
}

/**
 * 按 Markdown ATX 标题（行首 `#`～`######`）切章；首个标题前的正文记为「前言」。
 * Word→docx→mammoth 常把章节做成一级标题 `#`，旧逻辑只认 `##` 会只剩几章。
 */
function splitByAtxHeadings(body: string): ParsedChapter[] {
  const re = /^#{1,6}\s+(.+)$/gm;
  const matches = [...body.matchAll(re)];
  if (matches.length === 0) return [];

  const chapters: ParsedChapter[] = [];
  const firstIdx = matches[0]?.index ?? 0;
  const preface = body.slice(0, firstIdx).trim();
  if (isMeaningfulBody(preface)) {
    chapters.push({ title: "前言", content: preface });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const title = stripInvisible(m[1] ?? "").trim() || "未命名";
    const headEnd = (m.index ?? 0) + (m[0] ?? "").length;
    const nextStart = i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
    const content = body.slice(headEnd, nextStart).trim();
    chapters.push({ title, content });
  }

  return chapters;
}

function medianChapterContentLen(chapters: ParsedChapter[]): number {
  if (chapters.length === 0) return 0;
  const lens = chapters.map((c) => c.content.length).sort((a, b) => a - b);
  const mid = Math.floor(lens.length / 2);
  return lens.length % 2 ? lens[mid]! : (lens[mid - 1]! + lens[mid]!) / 2;
}

/**
 * Markdown：可选首行 `# 书名`；按 ATX 标题（`#`～`######`）切章。
 * 若「第X章」纯文本切分得到的章数 **不少于** Markdown，则采用纯文本（相等时优先「第X章」路径）。
 * 若 Markdown 章数更多但多为 mammoth 误标的极短 `#` 块，而「第X章」切分章更长、更可信，则回退到纯文本。
 */
export function parseMarkdownToWork(text: string, fallbackTitle: string): ParsedWorkForImport {
  let body = normalizeTextBody(text).trim();
  let workTitle = fallbackTitle;

  const lines = body.split("\n");
  const first = lines[0] ?? "";
  if (/^#\s+/.test(first)) {
    workTitle = first.replace(/^#\s+/, "").trim() || workTitle;
    body = lines.slice(1).join("\n").trim();
  }

  const plainChapters = splitPlainTextIntoChapters(body);
  const mdChapters = splitByAtxHeadings(body);

  if (mdChapters.length === 0) {
    return {
      workTitle,
      chapters: plainChapters.length ? plainChapters : [{ title: "正文", content: body }],
    };
  }

  if (plainChapters.length >= mdChapters.length) {
    return { workTitle, chapters: plainChapters };
  }

  // 均值会被「前言」整块正文或单块巨文拉爆；用中位数对比 mammoth 误标的短 `#` 章与「第X章」章
  const mdMed = medianChapterContentLen(mdChapters);
  const plainMed = medianChapterContentLen(plainChapters);
  if (plainChapters.length >= 5 && mdMed < 900 && plainMed > mdMed * 1.4) {
    return { workTitle, chapters: plainChapters };
  }

  return { workTitle, chapters: mdChapters };
}

export function parsePlainTextToWork(text: string, fallbackTitle: string): ParsedWorkForImport {
  const content = normalizeTextBody(text).trim();
  return {
    workTitle: fallbackTitle,
    chapters: splitPlainTextIntoChapters(content),
  };
}

type MammothMd = {
  convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{
    value: string;
    messages: readonly { type: string; message: string }[];
  }>;
};

async function parseDocxToWork(file: File, fallbackTitle: string): Promise<ParsedWorkForImport> {
  const mammoth = (await import("mammoth")) as unknown as MammothMd;
  const buf = await file.arrayBuffer();
  const { value, messages } = await mammoth.convertToMarkdown({ arrayBuffer: buf });
  const errMsg = messages.find((m) => m.type === "error");
  if (errMsg) {
    throw new Error(errMsg.message || "解析 Word 失败");
  }
  return parseMarkdownToWork(value, fallbackTitle);
}

const EXT = {
  txt: true,
  md: true,
  markdown: true,
  docx: true,
} as const;

export function isSupportedImportExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ext in EXT;
}

/**
 * 从用户选择的文件解析为作品结构（不写库）。
 */
export async function parseWorkImportFile(file: File): Promise<ParsedWorkForImport> {
  const fallback = basenameTitle(file.name);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "doc") {
    throw new Error("暂不支持 .doc，请在 Word 中「另存为」.docx 后再导入。");
  }

  if (ext === "docx") {
    return parseDocxToWork(file, fallback);
  }

  if (ext === "txt") {
    const text = await file.text();
    return parsePlainTextToWork(text, fallback);
  }

  if (ext === "md" || ext === "markdown") {
    const text = await file.text();
    return parseMarkdownToWork(text, fallback);
  }

  throw new Error(`不支持的格式 .${ext}，请使用 .txt、.md 或 .docx。`);
}

/** 将解析结果写入 IndexedDB，返回新作品。 */
export async function commitParsedWorkImport(parsed: ParsedWorkForImport): Promise<Work> {
  const work = await createWork(parsed.workTitle);
  for (const ch of parsed.chapters) {
    const row = await createChapter(work.id, ch.title);
    if (ch.content.length > 0) {
      await updateChapter(row.id, { content: ch.content });
    }
  }
  return work;
}

export async function importWorkFromFile(file: File): Promise<Work> {
  const parsed = await parseWorkImportFile(file);
  if (parsed.chapters.length === 0) {
    throw new Error("文件中没有可导入的正文。");
  }
  return commitParsedWorkImport(parsed);
}
