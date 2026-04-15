/**
 * §G-09：藏经批量导出 — 将选中参考书目全文合并为 ZIP 内多个 .txt（本地，不上传）。
 */
import JSZip from "jszip";
import { listReferenceChunks } from "../db/repo";
import type { ReferenceLibraryEntry } from "../db/types";

function sanitizeFilenameBase(name: string): string {
  const t = name.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ");
  return t.slice(0, 120) || "未命名";
}

function uniqueZipName(base: string, used: Set<string>): string {
  let name = `${base}.txt`;
  let i = 1;
  while (used.has(name)) {
    name = `${base}-${i}.txt`;
    i++;
  }
  used.add(name);
  return name;
}

export async function concatReferenceFullText(refWorkId: string): Promise<string> {
  const chunks = await listReferenceChunks(refWorkId);
  return chunks.map((c) => c.content).join("");
}

/**
 * 生成 ZIP 并触发浏览器下载。
 */
export async function downloadReferenceLibraryZip(
  entries: ReferenceLibraryEntry[],
  refIds: string[],
  filenameBase = "藏经导出",
): Promise<void> {
  const ids = [...new Set(refIds)];
  if (ids.length === 0) return;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const id of ids) {
    const meta = entries.find((e) => e.id === id);
    const base = sanitizeFilenameBase(meta?.title ?? id);
    const path = uniqueZipName(base, usedNames);
    const text = await concatReferenceFullText(id);
    zip.file(path, text);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilenameBase(filenameBase)}-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
