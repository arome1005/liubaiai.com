import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { LineEndingMode } from "../util/lineEnding";
import { normalizeLineEndings } from "../util/lineEnding";

const UTF8_BOM = "\uFEFF";

/** P2-C/E：全书导出选项 */
export interface ExportBookOptions {
  /** 前言文字（为空则不插入） */
  foreword?: string;
  /** 后记文字（为空则不插入） */
  afterword?: string;
  /** 仅导出 order 在此范围内的章节（含边界），undefined = 全书 */
  fromOrder?: number;
  toOrder?: number;
}

/** 纯文本 Blob，带 UTF-8 BOM，便于 Windows 记事本正确显示中文 */
export function txtBlob(text: string): Blob {
  return new Blob([UTF8_BOM + text], { type: "text/plain;charset=utf-8" });
}

/** 本章：标题 + 空行 + 正文（无 Markdown 符号） */
export function buildChapterTxt(
  title: string,
  content: string,
  lineEnding: LineEndingMode = "lf",
): Blob {
  const nl = lineEnding === "crlf" ? "\r\n" : "\n";
  const body = normalizeLineEndings(`${title}${nl}${nl}${content}`, lineEnding);
  return txtBlob(body);
}

/** 全书：书名 + 各章标题与正文，章之间用分隔线 */
export function buildBookTxt(
  workTitle: string,
  chapters: { title: string; content: string; order?: number }[],
  lineEnding: LineEndingMode = "lf",
  opts: ExportBookOptions = {},
): Blob {
  const nl = lineEnding === "crlf" ? "\r\n" : "\n";
  const sep = "—".repeat(24);
  const parts: string[] = [workTitle, "", sep, ""];

  if (opts.foreword?.trim()) {
    parts.push("前言", "", normalizeLineEndings(opts.foreword.trim(), lineEnding), "", sep, "");
  }

  const filtered =
    opts.fromOrder !== undefined || opts.toOrder !== undefined
      ? chapters.filter((c) => {
          const o = c.order ?? 0;
          if (opts.fromOrder !== undefined && o < opts.fromOrder) return false;
          if (opts.toOrder !== undefined && o > opts.toOrder) return false;
          return true;
        })
      : chapters;

  for (const ch of filtered) {
    parts.push(
      ch.title,
      "",
      normalizeLineEndings(ch.content, lineEnding),
      "",
      sep,
      "",
    );
  }

  if (opts.afterword?.trim()) {
    parts.push("后记", "", normalizeLineEndings(opts.afterword.trim(), lineEnding), "", sep, "");
  }

  return txtBlob(parts.join(nl));
}

function linesToParagraphs(text: string): Paragraph[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) =>
    line.length
      ? new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: { eastAsia: "Microsoft YaHei" },
            }),
          ],
        })
      : new Paragraph({}),
  );
}

export async function buildChapterDocx(title: string, content: string): Promise<Blob> {
  const doc = new Document({
    creator: "留白写作",
    title,
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
          }),
          ...linesToParagraphs(content),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function buildBookDocx(
  workTitle: string,
  chapters: { title: string; content: string; order?: number }[],
  opts: ExportBookOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      text: workTitle,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({}),
  ];

  if (opts.foreword?.trim()) {
    children.push(
      new Paragraph({ text: "前言", heading: HeadingLevel.HEADING_2 }),
      ...linesToParagraphs(opts.foreword.trim()),
      new Paragraph({}),
    );
  }

  const filtered =
    opts.fromOrder !== undefined || opts.toOrder !== undefined
      ? chapters.filter((c) => {
          const o = c.order ?? 0;
          if (opts.fromOrder !== undefined && o < opts.fromOrder) return false;
          if (opts.toOrder !== undefined && o > opts.toOrder) return false;
          return true;
        })
      : chapters;

  for (const ch of filtered) {
    children.push(
      new Paragraph({
        text: ch.title,
        heading: HeadingLevel.HEADING_2,
      }),
      ...linesToParagraphs(ch.content),
      new Paragraph({}),
    );
  }

  if (opts.afterword?.trim()) {
    children.push(
      new Paragraph({ text: "后记", heading: HeadingLevel.HEADING_2 }),
      ...linesToParagraphs(opts.afterword.trim()),
      new Paragraph({}),
    );
  }

  const doc = new Document({
    creator: "留白写作",
    title: workTitle,
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
