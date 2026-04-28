/**
 * 推演 chip 子组件的共享类型 / 常量 / 工具函数。
 * 不导出 React 组件；UI 元素见同目录下的具体文件。
 */
import type { BibleCharacter, BibleGlossaryTerm } from "../../../db/types";

export type CharGender = BibleCharacter["gender"];

export const GENDER_LABELS: Record<NonNullable<CharGender>, string> = {
  male: "男",
  female: "女",
  unknown: "未知",
  none: "无",
};

export const CATEGORY_LABELS: Record<BibleGlossaryTerm["category"], string> = {
  name: "人名·地名",
  term: "术语",
  dead: "死亡角色",
};

/** popover 内常用样式 — 提取为常量避免组件间重复 */
export const POPOVER_LABEL = "mb-0.5 text-[10px] text-muted-foreground/70";
export const POPOVER_TEXTAREA =
  "w-full resize-none rounded-md border border-border/35 bg-background/70 px-2.5 py-1.5 text-xs leading-relaxed shadow-inner outline-none transition focus:border-primary/45 focus:ring-2 focus:ring-primary/15";
export const SAVE_BTN =
  "rounded-md border border-primary/30 bg-primary/12 px-2.5 py-1 text-[10px] font-medium text-primary shadow-sm transition hover:bg-primary/20 hover:shadow disabled:opacity-50";

/** 把 chip 字段值（"a, b\nc"）拆成名称数组 */
export function parseChips(value: string): string[] {
  return value
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 把名称数组写回字段值（用换行分隔，便于阅读） */
export function serializeChips(chips: string[]): string {
  return chips.join("\n");
}
