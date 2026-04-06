/**
 * §11 步 48：写作侧栏「本会话」粗估 token 累计（sessionStorage，关标签页即清零）。
 */

const KEY = "liubai:aiSidepanelSessionTokensApprox";

export function readSessionApproxTokens(): number {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function addSessionApproxTokens(delta: number): void {
  if (!Number.isFinite(delta) || delta <= 0) return;
  try {
    const next = readSessionApproxTokens() + Math.floor(delta);
    sessionStorage.setItem(KEY, String(Math.min(2_000_000_000, next)));
  } catch {
    /* quota / private mode */
  }
}

export function resetSessionApproxTokens(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
