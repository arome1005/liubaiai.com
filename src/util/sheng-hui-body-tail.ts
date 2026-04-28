import {
  takeTailByParagraphs,
  type BodyTailParagraphCount,
  type ShengHuiGenerateMode,
} from "../ai/sheng-hui-generate";

/**
 * 生辉 — 从章节全文中切出「续接位置：正文末尾节选」注入用片段。
 * - 关闭续接时：除「分段接龙」会强制带末尾 1 段外，不注入章末正文。
 * - 打开时：按 1/3/5 段或全部末尾（字符上限见 `takeTailByParagraphs`）。
 */
export function computeShengHuiChapterBodyTail(input: {
  fullChapterText: string;
  bodyTailCount: BodyTailParagraphCount | false;
  generateMode: ShengHuiGenerateMode;
}): string {
  const raw = input.fullChapterText.trim();
  if (!raw) return "";

  if (input.bodyTailCount === false) {
    if (input.generateMode === "segment") {
      return takeTailByParagraphs(raw, 1);
    }
    return "";
  }

  return takeTailByParagraphs(raw, input.bodyTailCount);
}

/** 与素材区下拉一致，供 `ShengHuiContextInjectSection` 等复用。 */
export const SHENG_HUI_BODY_TAIL_SELECT_OPTIONS: { value: BodyTailParagraphCount; label: string }[] = [
  { value: 1, label: "最近 1 段" },
  { value: 3, label: "最近 3 段" },
  { value: 5, label: "最近 5 段" },
  { value: "all", label: "全部末尾" },
];
