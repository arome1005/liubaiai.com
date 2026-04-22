/** 与提示词页 `PromptsPage` 共用同一 key，收藏互通 */
export const PROMPT_FAVORITES_STORAGE_KEY = "liubai:promptFavorites";

export function loadPromptFavoriteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PROMPT_FAVORITES_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
