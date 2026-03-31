/** 字数：非空白字符数（含中文标点），与常见网文统计接近 */
export function wordCount(text: string): number {
  return text.replace(/\s/g, "").length;
}
