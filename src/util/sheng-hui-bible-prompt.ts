import type { ChapterBible } from "../db/types";

/** 将「本章锦囊」行对象格式化为提示词用字符串（生辉装配）。 */
export function formatShengHuiChapterBibleForPrompt(b: ChapterBible | undefined): string {
  if (!b) return "";
  const parts: string[] = [];
  if (b.goalText.trim()) parts.push(`本章目标：\n${b.goalText.trim()}`);
  if (b.forbidText.trim()) parts.push(`禁止：\n${b.forbidText.trim()}`);
  if (b.povText.trim()) parts.push(`视角/口吻：\n${b.povText.trim()}`);
  if (b.sceneStance.trim()) parts.push(`场景状态：\n${b.sceneStance.trim()}`);
  if (b.characterStateText.trim()) parts.push(`本章人物状态：\n${b.characterStateText.trim()}`);
  return parts.join("\n\n");
}
