/** 与 AppShell 中 `liubai:lastWorkId` 同步：用户最近一次进入作品域路由时的作品 ID */
const LS_LAST_WORK = "liubai:lastWorkId";

export function readLastWorkId(): string | null {
  try {
    return localStorage.getItem(LS_LAST_WORK);
  } catch {
    return null;
  }
}
