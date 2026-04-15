/**
 * §11 步 48：写作侧栏「本会话」粗估 token 累计（sessionStorage，关标签页即清零）。
 * §G-10：同口径「本机累计」写入 localStorage（仅写作侧栏 AI 成功生成后累加，不上传）。
 */

const KEY = "liubai:aiSidepanelSessionTokensApprox";
const LIFETIME_KEY = "liubai:aiSidepanelApproxTokensLifetime";

const CAP = 2_000_000_000;

function parseNonNegInt(raw: string | null): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(CAP, n) : 0;
}

export function readSessionApproxTokens(): number {
  try {
    return parseNonNegInt(sessionStorage.getItem(KEY));
  } catch {
    return 0;
  }
}

/** 本机累计（localStorage，与侧栏 `addSessionApproxTokens` 同源增量）。 */
export function readLifetimeApproxTokens(): number {
  try {
    return parseNonNegInt(localStorage.getItem(LIFETIME_KEY));
  } catch {
    return 0;
  }
}

export function addSessionApproxTokens(delta: number): void {
  if (!Number.isFinite(delta) || delta <= 0) return;
  const d = Math.floor(delta);
  try {
    const next = readSessionApproxTokens() + d;
    sessionStorage.setItem(KEY, String(Math.min(CAP, next)));
  } catch {
    /* quota / private mode */
  }
  try {
    const next = readLifetimeApproxTokens() + d;
    localStorage.setItem(LIFETIME_KEY, String(Math.min(CAP, next)));
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

export function resetLifetimeApproxTokens(): void {
  try {
    localStorage.removeItem(LIFETIME_KEY);
  } catch {
    /* ignore */
  }
}
