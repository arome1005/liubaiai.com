/**
 * 推演 chip 子组件的共享类型 / 常量 / 工具函数。
 * 不导出 React 组件；UI 元素见同目录下的具体文件。
 */
import type { BibleCharacter } from "../../../db/types";

export type CharGender = BibleCharacter["gender"];

export const GENDER_LABELS: Record<NonNullable<CharGender>, string> = {
  male: "男",
  female: "女",
  unknown: "未知",
  none: "无",
};

/** popover 内常用样式 — 提取为常量避免组件间重复 */
export const POPOVER_LABEL = "mb-0.5 text-[10px] text-muted-foreground/70";
export const POPOVER_TEXTAREA =
  "w-full resize-none rounded-md border border-border/35 bg-background/70 px-2.5 py-1.5 text-xs leading-relaxed shadow-inner outline-none transition focus:border-primary/45 focus:ring-2 focus:ring-primary/15";
export const SAVE_BTN =
  "rounded-md border border-primary/30 bg-primary/12 px-2.5 py-1 text-[10px] font-medium text-primary shadow-sm transition hover:bg-primary/20 hover:shadow disabled:opacity-50";

/**
 * 把 chip 字段值拆成名称数组。
 * 括号感知：仅在 `（）()【】[]「」『』` 嵌套深度为 0 时才切；
 * 这样 AI 写出的「方源（主角苏醒、筑基、初显锋芒）」会保持为单条 chip，
 * 而不会被中文顿号 `、` 切碎成 `方源（主角苏醒` `筑基` `初显锋芒）`。
 */
const CHIP_OPEN_BRACKETS = new Set(["（", "(", "【", "[", "「", "『"]);
const CHIP_CLOSE_BRACKETS = new Set(["）", ")", "】", "]", "」", "』"]);
const CHIP_SEPARATORS = new Set([",", "，", "、", "；", ";", "\n"]);

export function parseChips(value: string): string[] {
  const chips: string[] = [];
  let buf = "";
  let depth = 0;

  for (const ch of value) {
    if (CHIP_OPEN_BRACKETS.has(ch)) {
      depth++;
      buf += ch;
    } else if (CHIP_CLOSE_BRACKETS.has(ch)) {
      depth = Math.max(0, depth - 1);
      buf += ch;
    } else if (depth === 0 && CHIP_SEPARATORS.has(ch)) {
      const trimmed = buf.trim();
      if (trimmed) chips.push(trimmed);
      buf = "";
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) chips.push(tail);
  return chips;
}

/** 把名称数组写回字段值（用换行分隔，便于阅读） */
export function serializeChips(chips: string[]): string {
  return chips.join("\n");
}
