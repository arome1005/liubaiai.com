import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

function ensurePdfWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

export type ExtractPdfProgress = { page: number; totalPages: number };

/**
 * 浏览器端从 PDF 提取纯文本（藏经导入，本地解析）。
 * 依赖 pdf.js worker；扫描版无文本层时结果为空并抛错。
 */
export async function extractPlainTextFromPdf(
  data: ArrayBuffer,
  options?: { onProgress?: (p: ExtractPdfProgress) => void; signal?: AbortSignal },
): Promise<{ text: string; pageCount: number }> {
  ensurePdfWorker();
  let pdf: PDFDocumentProxy;
  try {
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    });
    pdf = await loadingTask.promise;
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/password|encrypt/i.test(msg)) {
      throw new Error("PDF 已加密或需要密码，当前版本不支持解密导入。");
    }
    throw new Error(`无法打开 PDF：${msg}`);
  }

  const totalPages = pdf.numPages;
  const parts: string[] = [];

  try {
    for (let i = 1; i <= totalPages; i++) {
      if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      options?.onProgress?.({ page: i, totalPages });
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const line = tc.items
        .map((item) => ("str" in item && typeof (item as { str?: string }).str === "string" ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      parts.push(line);
      if (i % 4 === 0) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    }
  } finally {
    await pdf.destroy();
  }

  const text = parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error("未能从 PDF 提取到文字，可能是扫描版（无文本层）或页面仅为图片。");
  }
  return { text, pageCount: totalPages };
}
