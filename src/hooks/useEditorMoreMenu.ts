/**
 * 工具栏「更多」下拉菜单：
 * - `moreOpen` 状态
 * - `moreWrapRef`：菜单容器 ref（点击其外部时关闭）
 * - 监听全局 mousedown 与 ESC 键关闭
 *
 * 行为与原 `EditorPage.tsx` 内联实现完全一致。
 */
import { useEffect, useRef, useState } from "react";

export interface UseEditorMoreMenuReturn {
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreWrapRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useEditorMoreMenu(): UseEditorMoreMenuReturn {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!moreOpen) return;
      const el = moreWrapRef.current;
      if (!el) return;
      const t = e.target as Node | null;
      if (t && el.contains(t)) return;
      setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (!moreOpen) return;
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  return { moreOpen, setMoreOpen, moreWrapRef };
}
