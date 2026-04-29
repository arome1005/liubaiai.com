import type { AiChatMessage } from "./types";

export const SHENG_HUI_SELF_REVIEW_TASK = "生辉·成稿复盘" as const;

const SYSTEM = `你是一位严谨的中文网文/类型小说编辑。作者刚刚完成一稿，请你按下面固定小节在「复盘清单」层面给出**短评**；不要重写成正文、不要改稿。

规则：
- 每个小节 2～4 行内；**总输出不超过 800 个汉字**。
- 就事论事：若本段信息不足以判断，写「信息不足，建议补充 xx」。
- 不编造原文中不存在的情节或人物关系。
- 用 Markdown 输出，**必须**包含且仅使用下列二级标题，顺序一致：
## 一句话
## 语气与锚点
## 设定与矛盾
## 人名与称谓
## 套话与节奏
## 可优先改的三点

若某小节无问题，可写「暂无明显问题」。`;

/**
 * 生成后「一键成稿复盘」；笔感/锦囊仅作**参照摘要**，避免长文灌入。
 */
export function buildShengHuiSelfReviewMessages(args: {
  workTitle: string;
  chapterTitle: string;
  /** 笔感卡与禁忌等摘要行 */
  styleBlock: string;
  /** 单段锦囊/世界观提示（可空、宜短） */
  bibleHint: string;
  body: string;
}): AiChatMessage[] {
  const w = (args.workTitle || "未命名").trim();
  const c = (args.chapterTitle || "未命名章节").trim();
  const user = `【书】${w}　【章】${c}

【笔感/禁忌（参照）】
${(args.styleBlock || "").trim() || "（未配置）"}

【世界/人物线（参照，可空）】
${(args.bibleHint || "").trim() || "（未提供）"}

【待复盘正文】
${args.body.trim()}
`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
}
