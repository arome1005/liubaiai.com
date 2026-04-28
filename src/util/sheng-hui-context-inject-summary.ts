import type { BodyTailParagraphCount } from "../ai/sheng-hui-generate";

/** 右栏「说明」里一条可读摘要，与左侧「上下文注入」勾选状态一致（只读，不维护第二套状态）。 */
export function summarizeShengHuiContextInject(p: {
  includeSummary: boolean;
  includeBible: boolean;
  bodyTailCount: BodyTailParagraphCount | false;
  includeSettingIndex: boolean;
  settingIndexLoading: boolean;
}): string {
  if (p.settingIndexLoading) return "设定索引加载中…";
  const parts: string[] = [];
  if (p.includeSummary) parts.push("本章概要");
  if (p.includeBible) parts.push("本章锦囊");
  if (p.bodyTailCount !== false) {
    parts.push(p.bodyTailCount === "all" ? "续接全文末" : `续接末${p.bodyTailCount}段`);
  }
  if (p.includeSettingIndex) parts.push("设定索引");
  if (parts.length === 0) return "未开启（可在左侧勾选）";
  return parts.join(" · ");
}

export function summarizeShengHuiRagSelection(selectedCount: number, resultCount: number): string {
  if (resultCount === 0) return "未检索或尚无命中";
  return `已选 ${selectedCount}/${resultCount} 条风格参考`;
}
