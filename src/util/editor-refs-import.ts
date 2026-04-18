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
  const full: EditorRefsImportPayload = { v: 1, createdAt: Date.now(), ...input };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export function readEditorRefsImport(): EditorRefsImportPayload | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as any;
    if (!j || typeof j !== "object") return null;
    if (j.v !== 1) return null;
    if (typeof j.workId !== "string" || !j.workId) return null;
    if (typeof j.chapterId !== "string" || !j.chapterId) return null;
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
    if (typeof j.createdAt !== "number" || !Number.isFinite(j.createdAt)) return null;
    return { v: 1, workId: j.workId, chapterId: j.chapterId, items, createdAt: j.createdAt };
  } catch {
    return null;
  }
}

export function clearEditorRefsImport(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

