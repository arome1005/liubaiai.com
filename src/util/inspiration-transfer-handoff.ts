export const INSPIRATION_TRANSFER_HANDOFF_KEY = "liubai:inspirationTransferHandoff:v1";

export type InspirationTransferMode = "appendEnd" | "insertCursor" | "mergeAiDraft";

export type InspirationTransferHandoffPayload = {
  workId: string;
  chapterId: string;
  mode: InspirationTransferMode;
  /** 已带分隔线（如需要）；写作页直接消费 */
  text: string;
  createdAt: number;
  sourceId?: string;
};

export function writeInspirationTransferHandoff(payload: InspirationTransferHandoffPayload): { ok: true } | { ok: false; error: string } {
  try {
    sessionStorage.setItem(INSPIRATION_TRANSFER_HANDOFF_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "写入失败";
    return { ok: false, error: `转入信息写入失败（${msg}）。可能是浏览器存储空间不足或被禁用。` };
  }
}

export function readInspirationTransferHandoff(): InspirationTransferHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(INSPIRATION_TRANSFER_HANDOFF_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<InspirationTransferHandoffPayload>;
    if (typeof obj.workId !== "string" || typeof obj.chapterId !== "string" || typeof obj.mode !== "string") return null;
    if (typeof obj.text !== "string") return null;
    if (typeof obj.createdAt !== "number" || !Number.isFinite(obj.createdAt)) return null;
    if (obj.mode !== "appendEnd" && obj.mode !== "insertCursor" && obj.mode !== "mergeAiDraft") return null;
    return {
      workId: obj.workId,
      chapterId: obj.chapterId,
      mode: obj.mode,
      text: obj.text,
      createdAt: obj.createdAt,
      sourceId: typeof obj.sourceId === "string" ? obj.sourceId : undefined,
    };
  } catch {
    return null;
  }
}

export function clearInspirationTransferHandoff(): void {
  try {
    sessionStorage.removeItem(INSPIRATION_TRANSFER_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

