import type { WritingSkillMode } from "./assemble-context";

/**
 * 仅这些侧栏「技能」在设了**目标正文字数**时启用：估 max output tokens + 偏短时多轮续写。
 * 排除偏短答式任务（如抽卡、概括）等，避免水字数与成本浪费。
 */
const BODY_TEXT_MULT_ROUND_MODES = new Set<WritingSkillMode>(["outline", "continue", "rewrite"]);

export function writingSkillModeUsesBodyMultiRound(mode: WritingSkillMode): boolean {
  return BODY_TEXT_MULT_ROUND_MODES.has(mode);
}
