export type LineEndingMode = "lf" | "crlf";

/** 将正文中的换行统一为 LF 或 CRLF（用于导出） */
export function normalizeLineEndings(text: string, mode: LineEndingMode): string {
  const unified = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return mode === "crlf" ? unified.replace(/\n/g, "\r\n") : unified;
}

export function readLineEndingMode(): LineEndingMode {
  try {
    const v = localStorage.getItem("liubai:exportLineEnding");
    return v === "crlf" ? "crlf" : "lf";
  } catch {
    return "lf";
  }
}
