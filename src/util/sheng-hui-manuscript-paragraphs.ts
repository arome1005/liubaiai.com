/**
 * 将主稿纯文本拆成段落，供阅读态渲染（双换行优先，无则按单行断段）。
 * 不引入 Markdown/HTML，避免 XSS；React 中仍按文本子节点输出。
 */
export function splitShengHuiManuscriptIntoParagraphs(text: string): string[] {
  const t = text.replace(/\r\n/g, "\n").trimEnd();
  if (!t.trim()) return [];
  const byDouble = t
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byDouble.length > 1) return byDouble;
  const single = byDouble[0] ?? t;
  if (single.includes("\n") && !single.includes("\n\n")) {
    return single
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [single.trim()];
}

/**
 * 将主稿中第 `paragraphIndex` 段替换为 `newParagraph`（与 {@link splitShengHuiManuscriptIntoParagraphs} 切分规则一致）。
 * 段间连接：原稿为双换行切出的段用 `\n\n` 拼回；单换行切出的用 `\n`。
 */
export function replaceShengHuiManuscriptParagraph(
  text: string,
  paragraphIndex: number,
  newParagraph: string,
): string {
  const t = text.replace(/\r\n/g, "\n").trimEnd();
  const nextPara = newParagraph.replace(/\r\n/g, "\n").trim();
  if (!t.trim()) return nextPara;
  if (paragraphIndex < 0) return text;

  const byDouble = t
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byDouble.length > 1) {
    if (paragraphIndex >= byDouble.length) return text;
    const parts = [...byDouble];
    parts[paragraphIndex] = nextPara;
    return parts.join("\n\n");
  }
  const single = byDouble[0] ?? t;
  if (single.includes("\n") && !single.includes("\n\n")) {
    const lines = single
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (paragraphIndex >= lines.length) return text;
    const parts = [...lines];
    parts[paragraphIndex] = nextPara;
    return parts.join("\n");
  }
  if (paragraphIndex !== 0) return text;
  return nextPara;
}
