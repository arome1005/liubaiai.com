/** 与创作中心「用量洞察」同级的轻量氛围底，不抢主稿。 */
export function ShengHuiAmbientBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute -left-[240px] -top-[120px] size-[420px] rounded-full bg-chart-1/20 blur-[90px] dark:bg-chart-1/15" />
      <div className="absolute -right-[120px] top-1/3 size-[360px] rounded-full bg-primary/8 blur-[80px]" />
      <div className="absolute -bottom-24 left-[20%] size-72 rounded-full bg-chart-2/10 blur-[70px] dark:bg-chart-2/8" />
    </div>
  );
}
