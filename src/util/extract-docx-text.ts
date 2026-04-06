import mammoth from "mammoth";

/**
 * 浏览器端从 Word .docx（Office 2007+）提取纯文本；本地解析，不上传。
 * 旧版二进制 .doc 不支持，需另存为 .docx。
 */
export async function extractPlainTextFromDocx(data: ArrayBuffer): Promise<string> {
  let value: string;
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: data });
    value = result.value;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/zip|central directory|end of central directory/i.test(msg)) {
      throw new Error("无法读取该文件：可能不是有效的 .docx（旧版 .doc 请先另存为 .docx）。");
    }
    throw new Error(`无法解析 Word 文档：${msg}`);
  }

  const text = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new Error("未能从 Word 文档提取到正文，文件可能为空或仅含图片。");
  }
  return text;
}
