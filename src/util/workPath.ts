/** 从路由 pathname 解析当前写作作品 id（`/work/:id` 及其子路径）。 */
export function workIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/work\/([^/]+)(?:\/|$)/);
  return m?.[1] ?? null;
}

/** 作品下「圣经 / 概要」子页：`BiblePage` / `SummaryOverviewPage` 自带 `page-header`，可隐藏 AppShell 薄 `app-topbar` */
export function isWorkBibleOrSummaryPath(pathname: string): boolean {
  return /^\/work\/[^/]+\/(bible|summary)$/.test(pathname);
}
