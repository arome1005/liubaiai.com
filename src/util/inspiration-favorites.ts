const LS_KEY = "liubai:inspirationFavoriteIds:v1";

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

export function loadInspirationFavoriteIds(): Set<string> {
  try {
    return parseIds(localStorage.getItem(LS_KEY));
  } catch {
    return new Set();
  }
}

export function saveInspirationFavoriteIds(ids: Set<string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function clearInspirationFavoriteIds(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
