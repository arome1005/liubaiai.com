/** 与创作中心「用量洞察」同级的轻量氛围底，不抢主稿。 */
export function ShengHuiAmbientBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-[240px] -top-[120px] size-[420px] rounded-full bg-chart-1/20 blur-[90px] dark:bg-chart-1/15" />
      <div className="absolute -right-[120px] top-1/3 size-[360px] rounded-full bg-primary/8 blur-[80px]" />
      <div className="absolute -bottom-24 left-[20%] size-72 rounded-full bg-chart-2/10 blur-[70px] dark:bg-chart-2/8" />
    </div>
  );
}
