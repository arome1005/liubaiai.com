import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createReferenceFromPlainText } from "../../../db/repo";
import { REFERENCE_IMPORT_HEAVY_BYTES } from "../../../db/types";
import type { ReferenceLibraryEntry } from "../../../db/types";
import { extractPlainTextFromDocx } from "../../../util/extract-docx-text";
import { extractPlainTextFromPdf } from "../../../util/extract-pdf-text";
import { readUtf8TextFileWithCheck } from "../../../util/readUtf8TextFile";

type ImportHeavyJob = {
  phase: "chunks" | "index";
  percent: number;
  label?: string;
  fileName?: string;
  batchCurrent?: number;
  batchTotal?: number;
};

type ImportProgress = {
  current: number;
  total: number;
  fileName: string;
};

export type PendingImport = {
  files: File[];
  type: "txt" | "pdf" | "docx";
  isBatch: boolean;
};

type UseReferenceImportProps = {
  refreshLibrary: () => Promise<any>;
  openReader: (entry: ReferenceLibraryEntry, ordinal: number, highlight: any) => Promise<void>;
  confirmOnce: (opts: any) => Promise<boolean>;
  setBusy: (busy: boolean) => void;
};

export function useReferenceImport({ refreshLibrary, openReader, confirmOnce, setBusy }: UseReferenceImportProps) {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [heavyJob, setHeavyJob] = useState<ImportHeavyJob | null>(null);
  const [pendingImportFiles, setPendingImportFiles] = useState<PendingImport | null>(null);

  const importAbortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const isAbortError = (err: unknown) =>
    (err instanceof DOMException && err.name === "AbortError") ||
    (typeof err === "object" && err !== null && "name" in err && (err as { name?: unknown }).name === "AbortError");

  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const txtFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".txt"));
    const pdfFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const docxFiles = picked.filter((f) => f.name.toLowerCase().endsWith(".docx"));

    const formatCount =
      (txtFiles.length > 0 ? 1 : 0) + (pdfFiles.length > 0 ? 1 : 0) + (docxFiles.length > 0 ? 1 : 0);
    if (formatCount > 1) {
      toast.error("请勿在同一批选择中混合 .txt、.pdf 与 .docx，请按格式分开导入。");
      return;
    }

    if (formatCount === 0) {
      toast.info(
        "支持 UTF-8 的 .txt、带文本层的 .pdf、以及 Word 的 .docx（均在浏览器内本地解析，不上传）。旧版 .doc 请先用 Word 另存为 .docx。可多选同类型文件。"
      );
      return;
    }

    let filesToProcess: File[] = [];
    let type: "txt" | "pdf" | "docx" = "txt";

    if (txtFiles.length > 0) {
      if (txtFiles.length < picked.length) {
        toast.info(`已忽略 ${picked.length - txtFiles.length} 个非 .txt 文件，将导入 ${txtFiles.length} 个 .txt。`);
      }
      filesToProcess = txtFiles;
      type = "txt";
    } else if (pdfFiles.length > 0) {
      if (pdfFiles.length < picked.length) {
        toast.info(`已忽略 ${picked.length - pdfFiles.length} 个非 .pdf 文件，将导入 ${pdfFiles.length} 个 .pdf。`);
      }
      filesToProcess = pdfFiles;
      type = "pdf";
    } else if (docxFiles.length < picked.length) {
      toast.info(`已忽略 ${picked.length - docxFiles.length} 个非 .docx 文件，将导入 ${docxFiles.length} 个 .docx。`);
      filesToProcess = docxFiles;
      type = "docx";
    }

    setPendingImportFiles({
      files: filesToProcess,
      type,
      isBatch: filesToProcess.length > 1,
    });
  }, []);

  const cancelImport = useCallback(() => {
    setPendingImportFiles(null);
  }, []);

  const confirmImport = useCallback(
    async (titleOrBatchCat: string, singleCat: string = "") => {
      if (!pendingImportFiles) return;
      const { files, type, isBatch } = pendingImportFiles;
      setPendingImportFiles(null);

      const abort = new AbortController();
      importAbortRef.current?.abort();
      importAbortRef.current = abort;

      setBusy(true);

      type ParserFn = (file: File) => Promise<{ text: string; suspiciousEncoding?: boolean }>;
      let parser: ParserFn;

      if (type === "txt") {
        parser = async (file) => {
          const { text, suspiciousEncoding } = await readUtf8TextFileWithCheck(file);
          if (suspiciousEncoding) {
            const go = await confirmOnce({
              title: "继续导入？",
              description: `${file.name}：文本疑似非 UTF-8，或含较多无法解码字符；继续导入可能出现乱码。请将 .txt 另存为 UTF-8 后导入更稳妥。`,
              actionText: "继续导入",
            });
            if (!go) throw new DOMException("Aborted", "AbortError");
          }
          return { text };
        };
      } else if (type === "pdf") {
        parser = async (file) => {
          const buf = await file.arrayBuffer();
          const { text } = await extractPlainTextFromPdf(buf, {
            onProgress: ({ page, totalPages }) => {
              setHeavyJob((prev) => ({
                phase: "chunks",
                percent: Math.min(48, Math.round((page / Math.max(1, totalPages)) * 48)),
                label: `解析 PDF ${page}/${totalPages} 页`,
                fileName: file.name,
                batchCurrent: prev?.batchCurrent,
                batchTotal: prev?.batchTotal,
              }));
            },
            signal: abort.signal,
          });
          return { text };
        };
      } else {
        parser = async (file) => {
          const buf = await file.arrayBuffer();
          const text = await extractPlainTextFromDocx(buf);
          return { text };
        };
      }

      if (!isBatch) {
        const file = files[0]!;
        try {
          if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
          setHeavyJob({ phase: "chunks", percent: 0, label: "正在读取文件…", fileName: file.name });
          const { text } = await parser(file);

          const title = titleOrBatchCat.trim() || file.name.replace(new RegExp(`\\.${type}$`, "i"), "").trim() || "未命名";
          const cat = singleCat.trim();
          
          const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
          if (large) {
            setHeavyJob({ phase: "chunks", percent: 0, label: "解析完成，准备写入…", fileName: file.name });
          }

          const entry = await createReferenceFromPlainText(
            {
              title,
              sourceName: file.name,
              fullText: text,
              category: cat,
            },
            large
              ? {
                  onProgress: (p) =>
                    setHeavyJob({
                      phase: p.phase,
                      percent: p.percent,
                      label: p.label,
                      fileName: file.name,
                    }),
                  signal: abort.signal,
                }
              : { signal: abort.signal }
          );

          setHeavyJob(null);
          await refreshLibrary();
          await openReader(entry, 0, null);
        } catch (err) {
          setHeavyJob(null);
          if (!isAbortError(err)) {
            toast.error(err instanceof Error ? err.message : "导入失败");
          }
        } finally {
          setBusy(false);
          if (importAbortRef.current === abort) importAbortRef.current = null;
        }
      } else {
        setImportProgress({ current: 0, total: files.length, fileName: "" });
        const errors: string[] = [];
        let ok = 0;
        const batchCat = titleOrBatchCat.trim();

        try {
          for (let i = 0; i < files.length; i++) {
            if (abort.signal.aborted) throw new DOMException("Aborted", "AbortError");
            const file = files[i]!;
            const nBatch = files.length;
            setImportProgress({ current: i + 1, total: nBatch, fileName: file.name });
            setHeavyJob({
              phase: "chunks",
              percent: Math.round((i / Math.max(1, nBatch)) * 100),
              label: "正在读取文件…",
              fileName: file.name,
              batchCurrent: i + 1,
              batchTotal: nBatch,
            });

            try {
              const { text } = await parser(file);
              const stem = file.name.replace(new RegExp(`\\.${type}$`, "i"), "").trim() || "未命名";

              const large = new Blob([text]).size >= REFERENCE_IMPORT_HEAVY_BYTES;
              if (large) {
                setHeavyJob({
                  phase: "chunks",
                  percent: 0,
                  label: `批量 ${i + 1}/${nBatch}`,
                  fileName: file.name,
                  batchCurrent: i + 1,
                  batchTotal: nBatch,
                });
              }

              await createReferenceFromPlainText(
                {
                  title: stem,
                  sourceName: file.name,
                  fullText: text,
                  category: batchCat,
                },
                {
                  onProgress: (p) => {
                    const overall = ((i + p.percent / 100) / Math.max(1, nBatch)) * 100;
                    setHeavyJob({
                      phase: p.phase,
                      percent: Math.min(100, Math.round(overall)),
                      label: `${p.label ?? ""}（${i + 1}/${nBatch}）`,
                      fileName: file.name,
                      batchCurrent: i + 1,
                      batchTotal: nBatch,
                    });
                  },
                  signal: abort.signal,
                }
              );
              ok++;
              await refreshLibrary();
            } catch (err) {
              setHeavyJob(null);
              if (isAbortError(err)) throw err;
              errors.push(`${file.name}：${err instanceof Error ? err.message : "导入失败"}`);
            }
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
        } catch (err) {
          if (!isAbortError(err)) throw err;
        } finally {
          setImportProgress(null);
          setHeavyJob(null);
          setBusy(false);
          if (importAbortRef.current === abort) importAbortRef.current = null;
        }

        if (abort.signal.aborted) return;
        if (errors.length > 0) {
          toast.info(`批量导入完成：成功 ${ok}，失败 ${errors.length}。`);
        } else if (ok > 0) {
          toast.success(`批量导入完成，共 ${ok} 份`);
        }
      }
    },
    [pendingImportFiles, confirmOnce, refreshLibrary, openReader, setBusy]
  );

  return {
    importProgress,
    heavyJob,
    setHeavyJob,
    pendingImportFiles,
    importAbortRef,
    fileRef,
    openPicker,
    handleFiles,
    cancelImport,
    confirmImport,
  };
}
