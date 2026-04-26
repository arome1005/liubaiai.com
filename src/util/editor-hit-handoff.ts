import { readSessionPayloadV1, writeSessionPayloadV1, clearSessionPayload } from "./session-payload";

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
  writeSessionPayloadV1(KEY, input);
}

export function readEditorHitHandoff(): EditorHitHandoffPayload | null {
  const j = readSessionPayloadV1(KEY);
  if (!j) return null;
  if (typeof j.query !== "string") return null;
  if (j.isRegex !== undefined && typeof j.isRegex !== "boolean") return null;
  if (j.offset !== undefined && typeof j.offset !== "number") return null;
  const src = j.source;
  if (!src || typeof src !== "object") return null;
  if (typeof src.module !== "string") return null;
  if (typeof src.title !== "string") return null;
  if (src.hint !== undefined && typeof src.hint !== "string") return null;
  return {
    v: 1,
    workId: j.workId as string,
    chapterId: j.chapterId as string,
    query: j.query as string,
    isRegex: j.isRegex ?? undefined,
    offset: j.offset ?? undefined,
    source: { module: src.module as EditorHitSourceModule, title: src.title as string, hint: (src.hint as string) ?? undefined },
    createdAt: j.createdAt as number,
  };
}

export function clearEditorHitHandoff(): void {
  clearSessionPayload(KEY);
}
