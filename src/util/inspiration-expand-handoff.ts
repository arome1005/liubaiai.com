/** 全局速记 → 流光页「AI 五段扩容」接力（步 37 后续） */
export const INSPIRATION_EXPAND_HANDOFF_KEY = "liubai:inspirationExpandDraft";
export const INSPIRATION_DRAFT_EXPAND_SOURCE_ID = "__liubai:draft-expand__";

export type InspirationExpandHandoffPayload = {
  body: string;
  tags: string[];
  workId: string | null;
  collectionId: string | null;
};

export function parseInspirationExpandHandoff(raw: string): InspirationExpandHandoffPayload | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const body = typeof rec.body === "string" ? rec.body.trim() : "";
    if (!body) return null;
    const tags = Array.isArray(rec.tags)
      ? rec.tags.filter((t): t is string => typeof t === "string")
      : [];
    const wid = rec.workId;
    const cid = rec.collectionId;
    return {
      body,
      tags,
      workId: wid === null || typeof wid === "string" ? wid : null,
      collectionId: cid === null || typeof cid === "string" ? cid : null,
    };
  } catch {
    return null;
  }
}
