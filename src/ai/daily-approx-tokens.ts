/**
 * §11 步 16：日累计粗估 token（localStorage，仅本机展示，不上传）。
 * 口径：与写作侧栏 `addSessionApproxTokens` 相同（请求 messages + 输出粗估/预留）。
 */

const KEY_PREFIX = "liubai:aiApproxTokensDaily:";
const CAP = 2_000_000_000;

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNonNegInt(raw: string | null): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(CAP, n) : 0;
}

export function readTodayApproxTokens(): number {
  try {
    return parseNonNegInt(localStorage.getItem(KEY_PREFIX + todayKey()));
  } catch {
    return 0;
  }
}

export function addTodayApproxTokens(delta: number): void {
  if (!Number.isFinite(delta) || delta <= 0) return;
  const d = Math.floor(delta);
  try {
    const k = KEY_PREFIX + todayKey();
    const next = parseNonNegInt(localStorage.getItem(k)) + d;
    localStorage.setItem(k, String(Math.min(CAP, next)));
  } catch {
    /* quota / private mode */
  }
}

export function resetTodayApproxTokens(): void {
  try {
    localStorage.removeItem(KEY_PREFIX + todayKey());
  } catch {
    /* ignore */
  }
}

