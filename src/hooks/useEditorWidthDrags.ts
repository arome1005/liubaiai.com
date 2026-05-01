import { useEffect } from "react";
import {
  EDITOR_AUTO_MAX_CAP_PX,
  EDITOR_WIDTH_KEY,
} from "../util/editor-layout-prefs";

interface DragState {
  startX: number;
  startW: number;
}

export interface UseEditorPaperWidthDragParams {
  widthDragRef: React.MutableRefObject<DragState | null>;
  editorMaxWidthPx: number;
  setEditorMaxWidthPx: (n: number) => void;
}

/**
 * 正文「最大宽度」拖拽：mousemove 计算新宽度，mouseup 写入 localStorage。
 */
export function useEditorPaperWidthDrag({
  widthDragRef,
  editorMaxWidthPx,
  setEditorMaxWidthPx,
}: UseEditorPaperWidthDragParams): void {
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!widthDragRef.current) return;
      const dx = e.clientX - widthDragRef.current.startX;
      const next = Math.max(720, Math.min(EDITOR_AUTO_MAX_CAP_PX, Math.floor(widthDragRef.current.startW + dx)));
      setEditorMaxWidthPx(next);
    }
    function onUp() {
      if (!widthDragRef.current) return;
      widthDragRef.current = null;
      try {
        localStorage.setItem(EDITOR_WIDTH_KEY, String(editorMaxWidthPx));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editorMaxWidthPx, widthDragRef, setEditorMaxWidthPx]);
}

export interface UseEditorSidebarWidthDragParams {
  sidebarDragRef: React.MutableRefObject<DragState | null>;
  sidebarWidthPx: number;
  setSidebarWidthPx: (n: number) => void;
}

/**
 * 左侧栏宽度拖拽：mousemove 计算新宽度（160-480），mouseup 写入 localStorage。
 */
export function useEditorSidebarWidthDrag({
  sidebarDragRef,
  sidebarWidthPx,
  setSidebarWidthPx,
}: UseEditorSidebarWidthDragParams): void {
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!sidebarDragRef.current) return;
      const dx = e.clientX - sidebarDragRef.current.startX;
      const next = Math.max(160, Math.min(480, Math.floor(sidebarDragRef.current.startW + dx)));
      setSidebarWidthPx(next);
    }
    function onUp() {
      if (!sidebarDragRef.current) return;
      sidebarDragRef.current = null;
      try {
        localStorage.setItem("liubai:sidebarWidthPx", String(sidebarWidthPx));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidthPx, sidebarDragRef, setSidebarWidthPx]);
}
