import { useState } from "react";
import { toast } from "sonner";
import { addChapterSnapshot, listChapters } from "../db/repo";
import type { Chapter, Work } from "../db/types";
import {
  buildBookDocx,
  buildBookTxt,
  buildChapterDocx,
  buildChapterTxt,
  type ExportBookOptions,
} from "../storage/export-txt-docx";
import { downloadBlob, safeFilename } from "../util/download";
import { readLineEndingMode } from "../util/lineEnding";

export interface UseEditorExportActionsParams {
  activeChapter: Chapter | null;
  activeId: string | null;
  work: Work | null;
  workId: string | null;
  content: string;
  persistContent: (chapterId: string, text: string) => Promise<unknown>;
}

export function useEditorExportActions({
  activeChapter,
  activeId,
  work,
  workId,
  content,
  persistContent,
}: UseEditorExportActionsParams) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"txt" | "docx">("txt");

  async function exportChapterTxt() {
    if (!activeChapter || !activeId) return;
    await persistContent(activeId, content);
    await addChapterSnapshot(activeId, content);
    const blob = buildChapterTxt(activeChapter.title, content, readLineEndingMode());
    downloadBlob(blob, `${safeFilename(activeChapter.title)}.txt`);
  }

  async function exportBookTxt() {
    if (!work || !workId || !activeId) return;
    setExportFormat("txt");
    setExportDialogOpen(true);
  }

  async function doExportBookTxt(opts: ExportBookOptions) {
    if (!work || !workId || !activeId) return;
    await persistContent(activeId, content);
    const list = await listChapters(workId);
    await Promise.all(list.map((c) => addChapterSnapshot(c.id, c.content)));
    const merged = list.map((c) => ({ title: c.title, content: c.content, order: c.order }));
    const blob = buildBookTxt(work.title, merged, readLineEndingMode(), opts);
    downloadBlob(blob, `${safeFilename(work.title)}.txt`);
  }

  async function exportChapterDocx() {
    if (!activeChapter || !activeId) return;
    try {
      await persistContent(activeId, content);
      await addChapterSnapshot(activeId, content);
      const blob = await buildChapterDocx(activeChapter.title, content);
      downloadBlob(blob, `${safeFilename(activeChapter.title)}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  async function exportBookDocx() {
    if (!work || !workId || !activeId) return;
    setExportFormat("docx");
    setExportDialogOpen(true);
  }

  async function doExportBookDocx(opts: ExportBookOptions) {
    if (!work || !workId || !activeId) return;
    try {
      await persistContent(activeId, content);
      const list = await listChapters(workId);
      await Promise.all(list.map((c) => addChapterSnapshot(c.id, c.content)));
      const merged = list.map((c) => ({ title: c.title, content: c.content, order: c.order }));
      const blob = await buildBookDocx(work.title, merged, opts);
      downloadBlob(blob, `${safeFilename(work.title)}.docx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Word 失败");
    }
  }

  return {
    exportDialogOpen,
    setExportDialogOpen,
    exportFormat,
    exportChapterTxt,
    exportBookTxt,
    doExportBookTxt,
    exportChapterDocx,
    exportBookDocx,
    doExportBookDocx,
  };
}
