export type WenceRefsImportPayload = {
  v: 1;
  workId: string | null;
  title: string;
  content: string;
  refWorkId?: string | null;
  hint?: string;
  createdAt: number;
};

const KEY = "liubai:wenceRefsImport:v1";

export function writeWenceRefsImport(input: Omit<WenceRefsImportPayload, "v" | "createdAt">): void {
  const full: WenceRefsImportPayload = { v: 1, createdAt: Date.now(), ...input };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export function readWenceRefsImport(): WenceRefsImportPayload | null {
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
    if (j.workId !== null && typeof j.workId !== "string") return null;
    if (typeof j.title !== "string") return null;
    if (typeof j.content !== "string") return null;
    if (j.refWorkId !== undefined && j.refWorkId !== null && typeof j.refWorkId !== "string") return null;
    if (j.hint !== undefined && typeof j.hint !== "string") return null;
    if (typeof j.createdAt !== "number" || !Number.isFinite(j.createdAt)) return null;
    return {
      v: 1,
      workId: j.workId,
      title: j.title,
      content: j.content,
      refWorkId: j.refWorkId ?? undefined,
      hint: j.hint ?? undefined,
      createdAt: j.createdAt,
    };
  } catch {
    return null;
  }
}

export function clearWenceRefsImport(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

