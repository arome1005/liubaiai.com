export type EditorHitSourceModule = "tuiyan" | "wence" | "reference" | "inspiration" | "writing" | "manual";

export type EditorHitHandoffPayload = {
  v: 1;
  workId: string;
  chapterId: string;
  /** 用于 scrollToMatch 的搜索词（字面量或正则） */
  query: string;
  isRegex?: boolean;
  /** 从该偏移开始找（可选） */
  offset?: number;
  /** UI 回显 */
  source: {
    module: EditorHitSourceModule;
    title: string;
    hint?: string;
  };
  createdAt: number;
};

const KEY = "liubai:editorHitHandoff:v1";

export function writeEditorHitHandoff(input: Omit<EditorHitHandoffPayload, "v" | "createdAt">): void {
  const full: EditorHitHandoffPayload = { v: 1, createdAt: Date.now(), ...input };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export function readEditorHitHandoff(): EditorHitHandoffPayload | null {
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
    if (typeof j.query !== "string") return null;
    if (j.isRegex !== undefined && typeof j.isRegex !== "boolean") return null;
    if (j.offset !== undefined && typeof j.offset !== "number") return null;
    const src = j.source;
    if (!src || typeof src !== "object") return null;
    if (typeof src.module !== "string") return null;
    if (typeof src.title !== "string") return null;
    if (src.hint !== undefined && typeof src.hint !== "string") return null;
    if (typeof j.createdAt !== "number" || !Number.isFinite(j.createdAt)) return null;
    return {
      v: 1,
      workId: j.workId,
      chapterId: j.chapterId,
      query: j.query,
      isRegex: j.isRegex ?? undefined,
      offset: j.offset ?? undefined,
      source: { module: src.module as EditorHitSourceModule, title: src.title, hint: src.hint ?? undefined },
      createdAt: j.createdAt,
    };
  } catch {
    return null;
  }
}

export function clearEditorHitHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

