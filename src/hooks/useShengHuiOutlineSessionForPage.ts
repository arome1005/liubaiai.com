import { useEffect, useMemo, useRef } from "react";
import { shengHuiOutlineStorageKey } from "../util/sheng-hui-workspace-constants";
import type { Dispatch, SetStateAction } from "react";

/** D.4：大纲高频编辑时对 sessionStorage 写操作做 debounce，避免大稿卡顿。 */
const OUTLINE_DEBOUNCE_MS = 400;

/**
 * 大纲与文策在 sessionStorage 中的按 `workId` 分桶读/写（与 `loading` / `outlineHydrated` 协同）。
 */
export function useShengHuiOutlineSessionForPage(
  workId: string | null,
  loading: boolean,
  outline: string,
  outlineHydrated: boolean,
  setOutline: Dispatch<SetStateAction<string>>,
  setOutlineHydrated: Dispatch<SetStateAction<boolean>>,
) {
  const outlineKey = useMemo(() => shengHuiOutlineStorageKey(workId), [workId]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) {
      setOutlineHydrated(false);
      return;
    }
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(outlineKey);
    } catch {
      raw = null;
    }
    setOutline(raw ?? "");
    setOutlineHydrated(true);
  }, [loading, outlineKey, setOutline, setOutlineHydrated]);

  useEffect(() => {
    if (!outlineHydrated || loading) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(outlineKey, outline);
      } catch {
        /* quota */
      }
      debounceRef.current = null;
    }, OUTLINE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [outline, outlineKey, outlineHydrated, loading]);
}
