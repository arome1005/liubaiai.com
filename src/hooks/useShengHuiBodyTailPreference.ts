import { useEffect, useState } from "react";
import type { BodyTailParagraphCount } from "../ai/sheng-hui-generate";

const LS_KEY = "liubai:shengHuiBodyTail:v1";

function readBodyTailFromLs(): BodyTailParagraphCount | false {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v == null) return false;
    const p = JSON.parse(v) as unknown;
    if (p === false) return false;
    if (p === 1 || p === 3 || p === 5) return p;
    if (p === "all") return "all";
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 生辉「续接正文末尾」开关 + 段数，持久化到 localStorage。
 */
export function useShengHuiBodyTailPreference() {
  const [bodyTailCount, setBodyTailCount] = useState<BodyTailParagraphCount | false>(readBodyTailFromLs);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(bodyTailCount));
    } catch {
      /* ignore */
    }
  }, [bodyTailCount]);

  return { bodyTailCount, setBodyTailCount };
}
