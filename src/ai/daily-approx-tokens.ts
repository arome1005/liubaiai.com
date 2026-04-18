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

function keyForDate(d: Date): string {
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

/**
 * 最近 N 天（含今天）的日累计粗估 tokens。
 * - 日期格式：YYYY-MM-DD
 * - 若某天无记录则 tokens=0
 */
export function listRecentDailyApproxTokens(days: number): Array<{ date: string; tokens: number }> {
  const n = Math.max(1, Math.min(90, Math.floor(days || 0)));
  const out: Array<{ date: string; tokens: number }> = [];
  const base = new Date();
  // 本地时区：从今天回溯
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const date = keyForDate(d);
    let tokens = 0;
    try {
      tokens = parseNonNegInt(localStorage.getItem(KEY_PREFIX + date));
    } catch {
      tokens = 0;
    }
    out.push({ date, tokens });
  }
  return out;
}

