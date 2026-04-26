/**
 * 编辑器体验偏好 — 打字机模式、专注模式、字数统计显示、紧凑布局。
 * 通过在 document.documentElement 上切换 class 实现，应用启动时应用一次。
 */

const LS_KEY = "liubai:editorExperience:v1";

export type EditorExperienceState = {
  /** 打字机模式：当前行居中 */
  typewriterMode: boolean;
  /** 专注模式：淡化非当前段落 */
  focusMode: boolean;
  /** 显示底部字数统计 */
  showWordCount: boolean;
  /** 紧凑布局：减少顶栏/导航间距 */
  compactMode: boolean;
};

export const DEFAULT_EDITOR_EXPERIENCE: EditorExperienceState = {
  typewriterMode: false,
  focusMode:      false,
  showWordCount:  true,
  compactMode:    false,
};

function parse(raw: unknown): EditorExperienceState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_EDITOR_EXPERIENCE };
  const o = raw as Record<string, unknown>;
  return {
    typewriterMode: typeof o.typewriterMode === "boolean" ? o.typewriterMode : DEFAULT_EDITOR_EXPERIENCE.typewriterMode,
    focusMode:      typeof o.focusMode      === "boolean" ? o.focusMode      : DEFAULT_EDITOR_EXPERIENCE.focusMode,
    showWordCount:  typeof o.showWordCount  === "boolean" ? o.showWordCount  : DEFAULT_EDITOR_EXPERIENCE.showWordCount,
    compactMode:    typeof o.compactMode    === "boolean" ? o.compactMode    : DEFAULT_EDITOR_EXPERIENCE.compactMode,
  };
}

export function loadEditorExperience(): EditorExperienceState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_EXPERIENCE };
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_EDITOR_EXPERIENCE };
  }
}

export function saveEditorExperience(s: EditorExperienceState): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** 将体验状态以 CSS class 形式应用到 document.documentElement */
export function applyEditorExperience(s: EditorExperienceState): void {
  const cl = document.documentElement.classList;
  cl.toggle("liubai-typewriter", s.typewriterMode);
  cl.toggle("liubai-focus",      s.focusMode);
  cl.toggle("liubai-wordcount",  s.showWordCount);
  cl.toggle("liubai-compact",    s.compactMode);
}
