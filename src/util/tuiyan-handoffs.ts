import type { Chapter, ReferenceLibraryEntry } from "../db/types"
import type { WenCeEntry } from "../components/tuiyan/WenCeCard"

/** 写回正文的 hit handoff source 元信息（供 `writeEditorHitHandoff` 使用）。 */
export type EditorHitHandoffSource = {
  module: "tuiyan"
  title: string
  hint?: string
}

export function buildEditorHitHandoffSource(
  selectedNodeTitle?: string | null,
): EditorHitHandoffSource {
  return {
    module: "tuiyan",
    title: "推演写回草稿",
    hint: selectedNodeTitle ? `节点：${selectedNodeTitle}` : undefined,
  }
}

/**
 * 构建「跳转到写作页 + 高亮命中草稿」的 URL。
 * - 草稿前 80 字非空时返回 hit URL（带搜索锚点）
 * - 否则返回直跳指定章节的 URL
 */
export function buildEditorHitNavUrl(opts: {
  workLinkSeg: string | null
  workId: string
  chapterId: string
  draft: string
}): { url: string; needle: string | null } {
  const seg = opts.workLinkSeg ?? opts.workId
  const needle = opts.draft.trim().slice(0, 80)
  if (needle) {
    return {
      url: `/work/${seg}?hit=1&chapter=${encodeURIComponent(opts.chapterId)}`,
      needle,
    }
  }
  return {
    url: `/work/${seg}?chapter=${encodeURIComponent(opts.chapterId)}`,
    needle: null,
  }
}

/** 构建「推演 → 文策」的跳转 payload（标题 / prompt / refs）。 */
export function buildWenceHandoffPayload(opts: {
  workId: string | null
  workTitle: string
  chapter: Chapter | null
  content: string
}): {
  workId: string | null
  title: string
  prompt: string
  refs?: string
} {
  const { workId, workTitle, chapter, content } = opts
  const refs = [
    workId ? `作品：${workTitle}` : "",
    chapter ? `章节：${chapter.title}` : "",
    chapter?.summary ? `章节概要：${chapter.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim()

  const prompt = [
    "我想基于下面的推演结果继续问策，请给我：",
    "1）下一步最关键的修改点（按优先级）",
    "2）如何把它落实到当前章节（给出可直接写进大纲/正文的措辞）",
    "",
    "【推演结果】",
    content.trim(),
  ].join("\n")

  return {
    workId,
    title: chapter ? `推演跟进：${chapter.title}` : "推演跟进",
    prompt,
    refs: refs || undefined,
  }
}

/** 把藏经摘录拼成「引用入文策」的卡片正文。 */
export function buildRefExcerptContent(
  ref: ReferenceLibraryEntry,
  excerpts: { text?: string; note?: string }[],
): string {
  const top = excerpts.slice(0, 3)
  return [
    `引用书目：${ref.title}${ref.category ? `（${ref.category}）` : ""}`,
    "",
    top.length
      ? top
          .map((x, i) => {
            const note = (x.note ?? "").trim()
            const text = (x.text ?? "").trim()
            return [`摘录 ${i + 1}${note ? ` · ${note}` : ""}`, text]
              .filter(Boolean)
              .join("\n")
          })
          .join("\n\n---\n\n")
      : "（暂无摘录：你可以在「藏经」里选中内容并添加摘录，推演侧就能直接复用。）",
  ].join("\n")
}

/** 生成一条新的「引用入文策」WenCe 条目（自动绑定当前规划节点）。 */
export function makeRefWenCeEntry(opts: {
  ref: ReferenceLibraryEntry
  excerpts: { text?: string; note?: string }[]
  selectedOutlineId?: string | null
  planningSelectedNodeId?: string | null
}): WenCeEntry {
  return {
    id: `w${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(),
    type: "user_note",
    title: `引用：${opts.ref.title}`,
    content: buildRefExcerptContent(opts.ref, opts.excerpts),
    relatedOutlineId: opts.selectedOutlineId ?? undefined,
    planningNodeId: opts.planningSelectedNodeId ?? undefined,
    isPinned: true,
    tags: ["引用", "藏经"],
  }
}
