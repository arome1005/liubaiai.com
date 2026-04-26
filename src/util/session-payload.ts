/**
 * Shared read/parse/validate logic for v1 sessionStorage payloads
 * that follow the { v: 1, workId, chapterId, createdAt, ... } envelope.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawPayload = Record<string, any>;

export function readSessionPayloadV1(key: string): RawPayload | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    if (j.v !== 1) return null;
    if (typeof j.workId !== "string" || !j.workId) return null;
    if (typeof j.chapterId !== "string" || !j.chapterId) return null;
    if (typeof j.createdAt !== "number" || !Number.isFinite(j.createdAt)) return null;
    return j as RawPayload;
  } catch {
    return null;
  }
}

export function writeSessionPayloadV1(
  key: string,
  data: Omit<RawPayload, "v" | "createdAt">,
): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ v: 1, createdAt: Date.now(), ...data }));
  } catch {
    /* ignore */
  }
}

export function clearSessionPayload(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
