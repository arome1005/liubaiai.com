/**
 * 推演 → 问策（/chat）预填交接：使用 sessionStorage，避免 URL 过长。
 */

export type WenceHandoffPayload = {
  v: 1;
  /** 可选：关联作品，便于问策页展示/后续装配上下文 */
  workId: string | null;
  /** 预填输入框 */
  prompt: string;
  /** 可选：展示在问策页顶栏/系统提示 */
  title?: string;
  /** 引用材料（纯文本） */
  refs?: string;
  createdAt: number;
};

const KEY = "liubai:wenceHandoff:v1";

export function writeWenceHandoff(payload: Omit<WenceHandoffPayload, "v" | "createdAt">): void {
  const full: WenceHandoffPayload = { v: 1, createdAt: Date.now(), ...payload };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    /* ignore */
  }
}

export function readWenceHandoff(): WenceHandoffPayload | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    if ((j as any).v !== 1) return null;
    const prompt = (j as any).prompt;
    if (typeof prompt !== "string") return null;
    const workId = (j as any).workId;
    const title = (j as any).title;
    const refs = (j as any).refs;
    const createdAt = (j as any).createdAt;
    if (workId !== null && typeof workId !== "string") return null;
    if (title !== undefined && typeof title !== "string") return null;
    if (refs !== undefined && typeof refs !== "string") return null;
    if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;
    return { v: 1, workId, prompt, title, refs, createdAt };
  } catch {
    return null;
  }
}

export function clearWenceHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

