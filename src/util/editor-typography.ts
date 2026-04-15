/**
 * §G-11：写作页排版（字体、行高、纸面护眼色）— 本机 localStorage，与 CodeMirror 通过 CSS 变量衔接，不改编辑器逻辑。
 */
const LS_KEY = "liubai:editorTypography:v1";

export const EDITOR_TYPOGRAPHY_EVENT = "liubai-editor-typography";

export type EditorFontFamily = "system" | "serif" | "mono" | "kaiti";
export type EditorLineHeightPreset = "1.5" | "1.65" | "1.8" | "2";
export type EditorPaperTint = "none" | "sepia" | "green";

export type EditorTypographyState = {
  fontFamily: EditorFontFamily;
  lineHeight: EditorLineHeightPreset;
  paperTint: EditorPaperTint;
};

export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypographyState = {
  fontFamily: "system",
  lineHeight: "1.8",
  paperTint: "none",
};

const FONT_STACKS: Record<EditorFontFamily, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", Georgia, "Times New Roman", serif',
  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  kaiti: '"KaiTi", "STKaiti", "FangSong", "Noto Serif SC", serif',
};

function parseState(raw: unknown): EditorTypographyState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fontFamily = o.fontFamily;
  const lineHeight = o.lineHeight;
  const paperTint = o.paperTint;
  const ff = ["system", "serif", "mono", "kaiti"].includes(fontFamily as string)
    ? (fontFamily as EditorFontFamily)
    : null;
  const lh = ["1.5", "1.65", "1.8", "2"].includes(lineHeight as string)
    ? (lineHeight as EditorLineHeightPreset)
    : null;
  const pt = ["none", "sepia", "green"].includes(paperTint as string)
    ? (paperTint as EditorPaperTint)
    : null;
  if (!ff || !lh || !pt) return null;
  return { fontFamily: ff, lineHeight: lh, paperTint: pt };
}

export function loadEditorTypography(): EditorTypographyState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_TYPOGRAPHY };
    const j = JSON.parse(raw) as unknown;
    const p = parseState(j);
    return p ?? { ...DEFAULT_EDITOR_TYPOGRAPHY };
  } catch {
    return { ...DEFAULT_EDITOR_TYPOGRAPHY };
  }
}

export function saveEditorTypography(s: EditorTypographyState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

/** 将字体与行高写入 `:root`，供 `.editor-textarea` / CodeMirror 继承 */
export function applyEditorTypographyCssVars(s: EditorTypographyState) {
  const root = document.documentElement;
  root.style.setProperty("--editor-line-height", s.lineHeight);
  root.style.setProperty("--editor-font-stack", FONT_STACKS[s.fontFamily]);
}

export function dispatchEditorTypographyChanged() {
  window.dispatchEvent(new Event(EDITOR_TYPOGRAPHY_EVENT));
}
