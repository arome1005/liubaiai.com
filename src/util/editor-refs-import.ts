import { readSessionPayloadV1, writeSessionPayloadV1, clearSessionPayload } from "./session-payload";

export type EditorRefsImportItem = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source: {
    module: "reference" | "tuiyan" | "wence" | "inspiration" | "manual";
    hint?: string;
  };
};

export type EditorRefsImportPayload = {
  v: 1;
  workId: string;
  chapterId: string;
  items: EditorRefsImportItem[];
  createdAt: number;
};

const KEY = "liubai:editorRefsImport:v1";

export function writeEditorRefsImport(input: Omit<EditorRefsImportPayload, "v" | "createdAt">): void {
  writeSessionPayloadV1(KEY, input);
}

export function readEditorRefsImport(): EditorRefsImportPayload | null {
  const j = readSessionPayloadV1(KEY);
  if (!j) return null;
  if (!Array.isArray(j.items)) return null;
  const items: EditorRefsImportItem[] = [];
  for (const row of j.items) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id) continue;
    if (typeof row.title !== "string") continue;
    if (typeof row.content !== "string") continue;
    if (typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)) continue;
    const src = row.source;
    if (!src || typeof src !== "object") continue;
    if (typeof src.module !== "string") continue;
    if (src.hint !== undefined && typeof src.hint !== "string") continue;
    items.push({
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt,
      source: { module: src.module, hint: src.hint ?? undefined },
    });
  }
  return { v: 1, workId: j.workId as string, chapterId: j.chapterId as string, items, createdAt: j.createdAt as number };
}

export function clearEditorRefsImport(): void {
  clearSessionPayload(KEY);
}
