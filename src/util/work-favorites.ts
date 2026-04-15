const LS_KEY = "liubai:workFavoriteIds:v1";

function parseIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const a = JSON.parse(raw) as unknown;
    if (!Array.isArray(a)) return new Set();
    return new Set(a.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function loadWorkFavoriteIds(): Set<string> {
  try {
    return parseIds(localStorage.getItem(LS_KEY));
  } catch {
    return new Set();
  }
}

export function saveWorkFavoriteIds(ids: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}
