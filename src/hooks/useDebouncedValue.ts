import { useEffect, useState } from "react";

/**
 * 通用防抖：仅在 `value` 稳定 `delayMs` 后才更新返回值。
 *
 * 行为与 `EditorPage.tsx` 原内联实现一致；用于降低高频状态变化
 * （如正文 content）对副作用的触发频率。
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
