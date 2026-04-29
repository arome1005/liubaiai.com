/** 主稿纸面叠层（N8）：`public/images/paper-grain.png` 平铺 + overlay，父级须 `relative` + `rounded-*`。 */
export function ShengHuiManuscriptPaperGrain() {
  return (
    <div
      className="sheng-hui-manuscript-paper-grain pointer-events-none absolute inset-0 z-0 rounded-xl"
      aria-hidden
    />
  );
}
