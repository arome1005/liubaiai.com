/** 顶栏等 UI：快捷键修饰键展示（Mac 系 ⌘，其余 Ctrl） */
export function shortcutModifierSymbol(): "⌘" | "Ctrl" {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

/** 流光全局速记（步 36）：Windows/Linux Alt+S，Mac Option+S */
export function liuguangQuickCaptureShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Alt+S";
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent) ? "⌥+S" : "Alt+S";
}
