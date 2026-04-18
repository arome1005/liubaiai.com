/**
 * §G-11：写作页排版（字体、行高、纸面护眼色）— 本机 localStorage，与 CodeMirror 通过 CSS 变量衔接，不改编辑器逻辑。
 */
const LS_KEY = "liubai:editorTypography:v1";

export const EDITOR_TYPOGRAPHY_EVENT = "liubai-editor-typography";

export type EditorFontFamily =
  | "system"       // 系统无衬线
  | "serif"        // 思源宋体
  | "mono"         // 等宽
  | "kaiti"        // 楷体
  | "songti"       // 宋体-简 (Songti SC)
  | "fangSong"     // 仿宋
  | "stSong"       // 华文宋体
  | "zhongSong"    // 华文中宋
  | "stFangSong"   // 华文仿宋
  | "xihei"        // 华文细黑
  | "stKaiti"      // 华文楷体
  | "xingkai"      // 华文行楷
  | "liti"         // 华文隶书
  | "caiyun"       // 华文彩云
  | "msYahei"      // 微软雅黑
  | "lantingHei"   // 兰亭黑-繁
  | "hiragino"     // 冬青黑字体简体中文
  | "yuanti"       // 圆体-简
  | "hannotate"    // 手札体-简
  | "wawati";      // 娃娃体-简

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

export const FONT_LABELS: Record<EditorFontFamily, string> = {
  system:    "系统无衬线",
  serif:     "思源宋体",
  mono:      "等宽",
  kaiti:     "楷体",
  songti:    "宋体-简",
  fangSong:  "仿宋",
  stSong:    "华文宋体",
  zhongSong: "华文中宋",
  stFangSong:"华文仿宋",
  xihei:     "华文细黑",
  stKaiti:   "华文楷体",
  xingkai:   "华文行楷",
  liti:      "华文隶书",
  caiyun:    "华文彩云",
  msYahei:   "微软雅黑",
  lantingHei:"兰亭黑-繁",
  hiragino:  "冬青黑字体",
  yuanti:    "圆体-简",
  hannotate: "手札体-简",
  wawati:    "娃娃体-简",
};

export const FONT_GROUPS: { label: string; fonts: EditorFontFamily[] }[] = [
  { label: "通用", fonts: ["system", "mono"] },
  { label: "宋体 / 衬线", fonts: ["serif", "songti", "stSong", "zhongSong"] },
  { label: "仿宋 / 楷体", fonts: ["kaiti", "stKaiti", "fangSong", "stFangSong"] },
  { label: "黑体 / 圆体", fonts: ["msYahei", "lantingHei", "hiragino", "xihei", "yuanti"] },
  { label: "艺术字体", fonts: ["xingkai", "hannotate", "wawati", "liti", "caiyun"] },
];

const FONT_STACKS: Record<EditorFontFamily, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif:
    '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", Georgia, "Times New Roman", serif',
  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  kaiti:
    '"KaiTi", "STKaiti", "FangSong", "Noto Serif SC", serif',
  songti:
    '"Songti SC", "Songti TC", "SimSun", "STSong", serif',
  fangSong:
    '"FangSong", "FangSong_GB2312", "STFangsong", serif',
  stSong:
    '"STSong", "Songti SC", "SimSun", serif',
  zhongSong:
    '"STZhongsong", "STSong", "Songti SC", serif',
  stFangSong:
    '"STFangsong", "FangSong", "FangSong_GB2312", serif',
  xihei:
    '"STXihei", "PingFang SC", "Microsoft YaHei", sans-serif',
  stKaiti:
    '"STKaiti", "KaiTi", "KaiTi_GB2312", serif',
  xingkai:
    '"STXingkai", "KaiTi", serif',
  liti:
    '"STLiti", serif',
  caiyun:
    '"STCaiyun", serif',
  msYahei:
    '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  lantingHei:
    '"Lantinghei TC", "Lantinghei SC", "PingFang TC", "PingFang SC", sans-serif',
  hiragino:
    '"Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif',
  yuanti:
    '"Yuanti SC", "Yuanti TC", "PingFang SC", sans-serif',
  hannotate:
    '"Hannotate SC", "Hannotate TC", serif',
  wawati:
    '"Wawati SC", "Wawati TC", serif',
};

const ALL_FONT_KEYS = Object.keys(FONT_LABELS) as EditorFontFamily[];

function parseState(raw: unknown): EditorTypographyState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fontFamily = o.fontFamily;
  const lineHeight = o.lineHeight;
  const paperTint = o.paperTint;
  const ff = ALL_FONT_KEYS.includes(fontFamily as EditorFontFamily)
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
