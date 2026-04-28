/**
 * 对输入文本做 **粗估 token 数**（CJK/ASCII 启发式），仅用于无 API `usage` 回退、规模提示与预检。
 * 各提供方在响应中返回 `usage` 时，应优先用 `tokenUsage`（`AiTokenUsage`）的厂商计数字段，无返回时才用本粗估作回退。
 */
export function approxRoughTokenCount(text: string): number {
  const chars = Array.from(text);
  let cjk = 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    const isCjk =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0x2a700 && code <= 0x2b73f) ||
      (code >= 0x2b740 && code <= 0x2b81f) ||
      (code >= 0x2b820 && code <= 0x2ceaf) ||
      (code >= 0x3000 && code <= 0x303f);
    if (isCjk) cjk++;
  }
  const total = chars.length;
  const ascii = Math.max(0, total - cjk);
  return Math.max(1, Math.ceil(cjk / 1.5 + ascii / 4));
}
