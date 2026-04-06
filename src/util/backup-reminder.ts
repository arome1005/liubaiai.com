/** 设置页「备份软提醒」（总体规划 §11 步 26），仅存 localStorage */

const LAST_EXPORT_MS_KEY = "liubai:lastBackupExportAt";
const REMINDER_ON_KEY = "liubai:backupReminderEnabled";

export const BACKUP_NUDGE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export function readBackupReminderEnabled(): boolean {
  try {
    const v = localStorage.getItem(REMINDER_ON_KEY);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeBackupReminderEnabled(on: boolean): void {
  try {
    localStorage.setItem(REMINDER_ON_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readLastBackupExportMs(): number | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_MS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function recordBackupExportSuccess(): void {
  try {
    localStorage.setItem(LAST_EXPORT_MS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * @param lastMsOverride 若传入则优先使用（与设置页 React state 一致，避免与 localStorage 读写时序差一帧）
 */
export function formatBackupNudgeDetail(nowMs: number, lastMsOverride?: number | null): string {
  const last = lastMsOverride !== undefined ? lastMsOverride : readLastBackupExportMs();
  if (last == null) return "尚未在本机记录过「导出备份 zip」成功时间；建议尽快导出并妥善保存。";
  const days = Math.floor((nowMs - last) / (24 * 60 * 60 * 1000));
  return `距离上次记录导出已超过 ${days} 天；建议再次导出 zip 并异地保存。`;
}
