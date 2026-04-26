/**
 * renderPromptTemplate — Sprint 5 变量装配函数
 *
 * 将 GlobalPromptTemplate.body 中的 {{变量名}} 替换为上下文值。
 * 缺失变量一律回退为空字符串（不报错）。
 *
 * ## 支持的变量白名单
 *
 * | 变量名                  | 来源            | 说明                     |
 * |------------------------|----------------|--------------------------|
 * | work_title             | Work.title      | 作品标题                  |
 * | work_tags              | Work.tags       | 逗号分隔标签               |
 * | chapter_title          | Chapter.title   | 当前章节标题               |
 * | chapter_summary        | Chapter.summary | 章节概要                  |
 * | chapter_content        | Chapter.content | 章节正文（截断 500 字）     |
 * | outline_node_title     | OutlineNode     | 推演大纲节点标题            |
 * | outline_node_summary   | OutlineNode     | 推演大纲节点概要            |
 *
 * ## 示例模板
 * ```
 * 书名：{{work_title}}，标签：{{work_tags}}
 * 当前章节：{{chapter_title}}
 * 请根据以上信息推演三条走向。
 * ```
 */

export type PromptTemplateContext = {
  work_title?: string;
  work_tags?: string;
  chapter_title?: string;
  chapter_summary?: string;
  /** 章节正文；内部会截断至 500 字以控制 token 量 */
  chapter_content?: string;
  outline_node_title?: string;
  outline_node_summary?: string;
  parent_context?: string;
  lineage_context?: string;
  planning_level?: string;
  idea_text?: string;
};

/** 已知变量白名单（用于 UI 提示，非运行时过滤） */
export const PROMPT_TEMPLATE_VARS: Array<{ key: keyof PromptTemplateContext; label: string }> = [
  { key: "work_title",           label: "作品标题" },
  { key: "work_tags",            label: "作品标签" },
  { key: "chapter_title",        label: "章节标题" },
  { key: "chapter_summary",      label: "章节概要" },
  { key: "chapter_content",      label: "章节正文（节选）" },
  { key: "outline_node_title",   label: "大纲节点标题" },
  { key: "outline_node_summary", label: "大纲节点概要" },
  { key: "parent_context",       label: "父层上下文" },
  { key: "lineage_context",      label: "完整上层链路" },
  { key: "planning_level",       label: "规划层级" },
  { key: "idea_text",            label: "作品构思" },
];

const CHAPTER_CONTENT_LIMIT = 500;

/**
 * 渲染模板：将 `{{变量名}}` 替换为 ctx 中对应值。
 * - 未知变量 → 空字符串（不报错）
 * - `chapter_content` 超过 500 字时自动截断并附注「…（节选）」
 */
export function renderPromptTemplate(
  body: string,
  ctx: PromptTemplateContext,
): string {
  const resolved: Record<string, string> = {
    work_title:           (ctx.work_title ?? "").trim(),
    work_tags:            (ctx.work_tags ?? "").trim(),
    chapter_title:        (ctx.chapter_title ?? "").trim(),
    chapter_summary:      (ctx.chapter_summary ?? "").trim(),
    chapter_content:      truncateContent(ctx.chapter_content ?? ""),
    outline_node_title:   (ctx.outline_node_title ?? "").trim(),
    outline_node_summary: (ctx.outline_node_summary ?? "").trim(),
    parent_context:       (ctx.parent_context ?? "").trim(),
    lineage_context:      (ctx.lineage_context ?? "").trim(),
    planning_level:       (ctx.planning_level ?? "").trim(),
    idea_text:            (ctx.idea_text ?? "").trim(),
  };

  // 替换所有 {{任意变量名}}，白名单外的也替换为空字符串
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    return Object.prototype.hasOwnProperty.call(resolved, k) ? resolved[k]! : "";
  });
}

function truncateContent(text: string): string {
  const t = text.trim();
  if (t.length <= CHAPTER_CONTENT_LIMIT) return t;
  return t.slice(0, CHAPTER_CONTENT_LIMIT) + "…（节选）";
}