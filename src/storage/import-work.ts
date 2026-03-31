import { createChapter, createWork, updateChapter } from "../db/repo";
import type { Work } from "../db/types";

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

function firstNonEmptyLine(s: string): { line: string; rest: string } | null {
  const lines = s.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = stripInvisible(lines[i] ?? "").trim();
    if (t) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const line = stripInvisible(lines[idx] ?? "").trim();
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

  // Detect heads but don't overmatch normal content lines.
  const chapterIdRe = String.raw`第[一二三四五六七八九十百千万\d]+[章节回卷]`;
  const titleSuffixRe = String.raw`(?:[：:\s·、\-—].*)?`;
  const headRe = new RegExp(
    [
      // 第X章 / 第十二回 / 第3卷……（支持【】括号、各种分隔符）
      String.raw`^\s*(?:【\s*)?${chapterIdRe}(?:\s*】)?${titleSuffixRe}\s*$`,
      // 其他常见单行标题（不含正文）
      String.raw`^\s*(?:【\s*)?(?:序章|楔子|引子|前言|后记|终章|尾声|番外)(?:\s*】)?(?:[：:\s·、\-—].*)?\s*$`,
    ].join("|"),
    "gm",
  );

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
    const titleLineRaw = stripInvisible(m[0] ?? "").trim();
    const headStart = m.index ?? 0;
    const headEnd = headStart + (m[0] ?? "").length;
    const nextStart = i + 1 < matches.length ? (matches[i + 1]!.index ?? body.length) : body.length;
    let content = body.slice(headEnd, nextStart).trim();

    // 有些导出文本会出现重复标题/空章，过滤掉无内容的章
    if (!isMeaningfulBody(content)) continue;

    // 标题补全：有些源文本会写成「第2章」下一行才是章名
    const titleLine = titleLineRaw.replace(/^\s*【\s*/, "").replace(/\s*】\s*$/, "").trim();
    const onlyId = new RegExp(String.raw`^${chapterIdRe}\s*$`).test(titleLine);
    if (onlyId) {
      const next = firstNonEmptyLine(content);
      if (next && next.line.length <= 40 && !headRe.test(next.line)) {
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
 * Markdown：可选首行 `# 书名`；按 `## 章节名` 切章；无 `##` 时整篇为单章「正文」。
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

  const re = /^##\s+(.+)$/gm;
  const matches = [...body.matchAll(re)];
  if (matches.length === 0) {
    // 兜底：有些 docx->md 或用户 md 没有用 `##` 分章，但仍可能存在「第X章」文本标题
    const chapters = splitPlainTextIntoChapters(body);
    return { workTitle, chapters: chapters.length ? chapters : [{ title: "正文", content: body }] };
  }

  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = (m[1] ?? "未命名").trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
    const content = body.slice(start, end).trim();
    chapters.push({ title, content });
  }

  return { workTitle, chapters };
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
