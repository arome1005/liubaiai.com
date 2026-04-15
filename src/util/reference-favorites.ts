/**
 * §G-09：藏经「收藏」— 仅存本机 localStorage（参考书目不随写作云同步）。
 */
const LS_IDS = "liubai:referenceRefFavorites:v1";
const LS_SCOPE = "liubai:referenceFavoritesScope:v1";

export type ReferenceFavoriteScope = "all" | "favorites";

export function loadReferenceFavoriteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_IDS);
    if (!raw) return new Set();
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return new Set();
    return new Set(j.filter((x): x is string => typeof x === "string" && x.length > 0));
  } catch {
    return new Set();
  }
}

export function saveReferenceFavoriteIds(ids: Set<string>) {
  try {
    localStorage.setItem(LS_IDS, JSON.stringify([...ids]));
  } catch {
    /* quota */
  }
}

export function loadReferenceFavoriteScope(): ReferenceFavoriteScope {
  try {
    return localStorage.getItem(LS_SCOPE) === "favorites" ? "favorites" : "all";
  } catch {
    return "all";
  }
}

export function saveReferenceFavoriteScope(scope: ReferenceFavoriteScope) {
  try {
    localStorage.setItem(LS_SCOPE, scope);
  } catch {
    /* ignore */
  }
}
