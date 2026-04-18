/**
 * 浏览器端解码 .txt：
 * - 默认 UTF-8
 * - 若替换字符 U+FFFD 比例过高，尝试使用 gb18030 作为回退（Chrome 等现代浏览器支持）
 * - 返回 `suspiciousEncoding` 供 UI 提示用户"可能仍存在乱码风险"
 */
export async function readUtf8TextFileWithCheck(file: File): Promise<{
  text: string;
  /** 替换字符占比超过阈值，建议用户另存 UTF-8 */
  suspiciousEncoding: boolean;
  /** 实际采用的解码（用于调试/提示；不保证所有浏览器支持 gb18030） */
  encoding: "utf-8" | "gb18030";
}> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  function decode(encoding: "utf-8" | "gb18030"): string {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  }

  function replacementRatio(s: string): { replacement: number; ratio: number } {
    if (s.length === 0) return { replacement: 0, ratio: 0 };
    let replacement = 0;
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) === 0xfffd) replacement++;
    }
    return { replacement, ratio: replacement / s.length };
  }

  let text = decode("utf-8");
  let encoding: "utf-8" | "gb18030" = "utf-8";
  let r = replacementRatio(text);

  // 初筛：替换字符占比过高时，尝试 gb18030（常见中文 Windows 文本）
  const suspiciousUtf8 = r.replacement >= 8 || r.ratio > 0.002;
  if (suspiciousUtf8) {
    try {
      const gb = decode("gb18030");
      const gr = replacementRatio(gb);
      // 若 gb18030 明显更"干净"，则采用它
      if (gr.replacement + 2 < r.replacement || gr.ratio < r.ratio * 0.5) {
        text = gb;
        encoding = "gb18030";
        r = gr;
      }
    } catch {
      // 某些环境不支持 gb18030：忽略，保留 utf-8 结果
    }
  }

  const suspiciousEncoding = r.replacement >= 8 || r.ratio > 0.002;
  return { text, suspiciousEncoding, encoding };
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
