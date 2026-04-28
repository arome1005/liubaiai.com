import { useEffect, useState } from "react";

/** 与 Tailwind `lg`（1024px）等断点对齐的媒体查询。首帧在客户端同步读取，避免整页屏闪。 */
export function useMinWidthMedia(minPx: number) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${minPx}px)`).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${minPx}px)`);
    const on = () => setMatches(mql.matches);
    mql.addEventListener("change", on);
    on();
    return () => mql.removeEventListener("change", on);
  }, [minPx]);

  return matches;
}
