import { wordCount } from "./wordCount";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 今日新增字数（相对上次持久化正文的增量之和） */
export function addDailyWordsFromDelta(prevContent: string, nextContent: string): void {
  const delta = Math.max(0, wordCount(nextContent) - wordCount(prevContent));
  if (delta <= 0) return;
  try {
    const k = `liubai:dailyWords:${todayKey()}`;
    const n = Number(localStorage.getItem(k));
    localStorage.setItem(k, String((Number.isFinite(n) ? n : 0) + delta));
  } catch {
    /* ignore */
  }
}

export function getDailyWordsToday(): number {
  try {
    const k = `liubai:dailyWords:${todayKey()}`;
    const n = Number(localStorage.getItem(k));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
