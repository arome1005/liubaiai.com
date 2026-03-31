/**
 * 浏览器端以 UTF-8 解码 .txt；检测替换字符 U+FFFD 比例以提示可能非 UTF-8（如 GBK 源文件）。
 */
export async function readUtf8TextFileWithCheck(file: File): Promise<{
  text: string;
  /** 替换字符占比超过阈值，建议用户另存 UTF-8 */
  suspiciousEncoding: boolean;
}> {
  const buf = await file.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (text.length === 0) {
    return { text, suspiciousEncoding: false };
  }
  let replacement = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) replacement++;
  }
  const ratio = replacement / text.length;
  const suspiciousEncoding = replacement >= 8 || ratio > 0.002;
  return { text, suspiciousEncoding };
}

/** 供路由与链接：打开参考阅读器到指定块与高亮 */
export function referenceReaderHref(ex: {
  refWorkId: string;
  ordinal: number;
  startOffset: number;
  endOffset: number;
}): string {
  const q = new URLSearchParams({
    ref: ex.refWorkId,
    ord: String(ex.ordinal),
    hs: String(ex.startOffset),
    he: String(ex.endOffset),
  });
  return `/reference?${q.toString()}`;
}
