import { toast } from "sonner";
import { listChapters } from "../db/repo";
import { type ReferenceKeyCard, formatKeyCardText } from "../util/reference-key-cards";
import { writeWenceRefsImport } from "../util/wence-refs-import";
import { writeAiPanelDraft } from "../util/ai-panel-draft";
import { writeEditorHitHandoff } from "../util/editor-hit-handoff";
import { writeEditorRefsImport } from "../util/editor-refs-import";
import type { ReferenceExcerpt } from "../db/types";

export interface HandoffContext {
  importWorkId: string;
  activeRefId: string | null;
  activeTitle: string;
  progressCursor: string | null;
  navigate: (path: string) => void;
  refWorkPathSeg: (id: string) => string;
}

export function applyKeyCardToWenceRefs(card: ReferenceKeyCard, ctx: HandoffContext) {
  if (!ctx.importWorkId) {
    toast.error("请先选择一个作品（用于关联作品上下文）。");
    return;
  }
  const content = formatKeyCardText(card);
  writeWenceRefsImport({
    workId: ctx.importWorkId,
    title: `藏经卡片：${card.title}`.slice(0, 80),
    content,
    refWorkId: ctx.activeRefId ?? undefined,
    hint: `来自藏经·${ctx.activeTitle} · ${card.kind}`,
  });
  ctx.navigate("/chat?refsImport=1");
}

export async function applyKeyCardToAiDraft(card: ReferenceKeyCard, ctx: HandoffContext) {
  const wid = ctx.importWorkId;
  if (!wid) {
    toast.error("请先选择要写入草稿的作品。");
    return;
  }
  const chapters = await listChapters(wid);
  if (chapters.length === 0) {
    toast.error("该作品还没有章节，请先在写作页创建章节。");
    return;
  }
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapterId =
    (ctx.progressCursor && sorted.some((c) => c.id === ctx.progressCursor) ? ctx.progressCursor : null) ??
    sorted[0]!.id;
  const text = formatKeyCardText(card);
  const r = writeAiPanelDraft(wid, chapterId, text);
  if (!r.ok) {
    toast.error(r.error);
    return;
  }
  ctx.navigate(`/work/${ctx.refWorkPathSeg(wid)}?chapter=${encodeURIComponent(chapterId)}`);
}

export async function jumpKeyCardToWritingHit(card: ReferenceKeyCard, ctx: HandoffContext) {
  const wid = ctx.importWorkId;
  if (!wid) {
    toast.error("请先选择要跳转的作品。");
    return;
  }
  const chapters = await listChapters(wid);
  if (chapters.length === 0) {
    toast.error("该作品还没有章节，请先在写作页创建章节。");
    return;
  }
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapterId =
    (ctx.progressCursor && sorted.some((c) => c.id === ctx.progressCursor) ? ctx.progressCursor : null) ??
    sorted[0]!.id;
  const needle = (card.title || card.body || "").trim().slice(0, 80);
  if (!needle) {
    toast.error("该卡片没有可用于定位的标题/正文。");
    return;
  }
  writeEditorHitHandoff({
    workId: wid,
    chapterId,
    query: needle,
    isRegex: false,
    offset: 0,
    source: {
      module: "reference",
      title: `藏经卡片：${card.title}`.slice(0, 80),
      hint: `来自《${ctx.activeTitle}》`,
    },
  });
  ctx.navigate(`/work/${ctx.refWorkPathSeg(wid)}?hit=1&chapter=${encodeURIComponent(chapterId)}`);
}

export async function sendExcerptToWritingAsRef(ex: ReferenceExcerpt, ctx: HandoffContext) {
  const wid = ex.linkedWorkId ?? ctx.importWorkId;
  if (!wid) {
    toast.error("请先选择要跳转的作品（或先在摘录里绑定作品/章节）。");
    return;
  }
  const chapters = await listChapters(wid);
  if (chapters.length === 0) {
    toast.error("该作品还没有章节，请先在写作页创建章节。");
    return;
  }
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapterId =
    ex.linkedChapterId ??
    ((ctx.progressCursor && sorted.some((c) => c.id === ctx.progressCursor) ? ctx.progressCursor : null) ??
      sorted[0]!.id);

  writeEditorRefsImport({
    workId: wid,
    chapterId,
    items: [
      {
        id: ex.id,
        title: `藏经摘录：${ctx.activeTitle}`.slice(0, 80),
        content: [ex.text, ex.note ? `\n\n备注：${ex.note}` : ""].join("").trim(),
        createdAt: Date.now(),
        source: { module: "reference", hint: "来自藏经摘录" },
      },
    ],
  });
  ctx.navigate(`/work/${ctx.refWorkPathSeg(wid)}?refsImport=1&chapter=${encodeURIComponent(chapterId)}`);
}
