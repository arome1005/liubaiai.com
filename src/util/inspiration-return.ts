export const INSPIRATION_RETURN_KEY = "liubai:inspirationReturn:v1";

export type InspirationReturnState = {
  searchQuery: string;
  selectedType: string;
  selectedCollection: string | null;
  selectedTag: string | null;
  showFavoritesOnly: boolean;
  viewMode: "grid" | "list" | "masonry";
  density: "comfortable" | "cozy" | "compact";
  createdAt: number;
};

export function writeInspirationReturnState(s: InspirationReturnState): void {
  try {
    sessionStorage.setItem(INSPIRATION_RETURN_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function readInspirationReturnState(): InspirationReturnState | null {
  try {
    const raw = sessionStorage.getItem(INSPIRATION_RETURN_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<InspirationReturnState>;
    if (typeof obj.searchQuery !== "string") return null;
    if (typeof obj.selectedType !== "string") return null;
    const okView = obj.viewMode === "grid" || obj.viewMode === "list" || obj.viewMode === "masonry";
    const okDensity = obj.density === "comfortable" || obj.density === "cozy" || obj.density === "compact";
    if (!okView || !okDensity) return null;
    return {
      searchQuery: obj.searchQuery,
      selectedType: obj.selectedType,
      selectedCollection: typeof obj.selectedCollection === "string" ? obj.selectedCollection : null,
      selectedTag: typeof obj.selectedTag === "string" ? obj.selectedTag : null,
      showFavoritesOnly: !!obj.showFavoritesOnly,
      viewMode: obj.viewMode,
      density: obj.density,
      createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearInspirationReturnState(): void {
  try {
    sessionStorage.removeItem(INSPIRATION_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

