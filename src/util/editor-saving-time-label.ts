/** 保存进行中顶栏提示：`保存时间：05:37/05/03/2026`（本地时：分 / 月 / 日 / 年） */
export function formatEditorSavingTimeLabel(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `保存时间：${p(d.getHours())}:${p(d.getMinutes())}/${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}
