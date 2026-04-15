/**
 * 对输入文本做 **粗估 token 数**，仅用于 UI 提示（规模/成本预期）。
 * **不是**计费凭证；无 API `usage` 时界面应标明「非精确计费」——见总体规划 §5.3.1。
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
