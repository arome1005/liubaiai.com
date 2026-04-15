import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleForeshadowStatus,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  GlobalPromptTemplate,
  InspirationCollection,
  InspirationFragment,
  PromptStatus,
  PromptType,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
  LogicPlaceEvent,
  LogicPlaceNode,
} from "../db/types";
import { normalizeWorkTagList } from "../util/work-tags";
import type { MergeRemapResult } from "./backup-merge-remap";

type Json = Record<string, unknown>;

export function parseWorkRow(r: Json): Work {
  const cov = r.cover_image;
  const tg = r.tags;
  const desc = r.description;
  const status = r.status;
  let tags: string[] | undefined;
  if (Array.isArray(tg)) {
    const t = tg.filter((x): x is string => typeof x === "string");
    tags = normalizeWorkTagList(t);
  }
  return {
    id: r.id as string,
    title: r.title as string,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    progressCursor: (r.progress_cursor as string | null) ?? null,
    description: typeof desc === "string" && desc.trim().length ? desc : undefined,
    status:
      status === "serializing" || status === "completed" || status === "archived"
        ? (status as Work["status"])
        : undefined,
    coverImage: typeof cov === "string" && cov.length > 0 ? cov : undefined,
    tags,
  };
}

export function parseVolumeRow(r: Json): Volume {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    title: r.title as string,
    order: Number(r.order),
    createdAt: Number(r.created_at),
    summary: (r.summary as string | null) ?? "",
  };
}

export function parseChapterRow(r: Json): Chapter {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    volumeId: r.volume_id as string,
    title: r.title as string,
    content: (r.content as string) ?? "",
    summary: (r.summary as string | null) ?? "",
    summaryUpdatedAt:
      r.summary_updated_at != null ? Number(r.summary_updated_at as number | string) : undefined,
    summaryScopeFromOrder:
      r.summary_scope_from != null ? Number(r.summary_scope_from as number | string) : undefined,
    summaryScopeToOrder: r.summary_scope_to != null ? Number(r.summary_scope_to as number | string) : undefined,
    order: Number(r.order),
    updatedAt: Number(r.updated_at),
    wordCountCache: r.word_count_cache != null ? Number(r.word_count_cache) : undefined,
    outlineDraft: typeof r.outline_draft === "string" && r.outline_draft.length > 0 ? r.outline_draft : undefined,
    outlineNodeId: typeof r.outline_node_id === "string" && r.outline_node_id.length > 0 ? r.outline_node_id : undefined,
    outlinePushedAt: r.outline_pushed_at != null ? Number(r.outline_pushed_at) : undefined,
  };
}

export function parseSnapshotRow(r: Json): ChapterSnapshot {
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    content: r.content as string,
    createdAt: Number(r.created_at),
  };
}

export function parseInspirationFragmentRow(r: Json): InspirationFragment {
  const tg = r.tags;
  const tags =
    (Array.isArray(tg)
      ? normalizeWorkTagList(tg.filter((x): x is string => typeof x === "string"))
      : undefined) ?? [];
  const cid = r.collection_id as string | null | undefined;
  const rawLinks = r.links;
  const links = Array.isArray(rawLinks) ? (rawLinks as InspirationFragment["links"]) : [];
  return {
    id: r.id as string,
    workId: (r.work_id as string | null) ?? null,
    collectionId: cid != null && String(cid).trim() ? String(cid) : null,
    title: (r.title as string | null) ?? undefined,
    sourceName: (r.source_name as string | null) ?? undefined,
    sourceUrl: (r.source_url as string | null) ?? undefined,
    urlTitle: (r.url_title as string | null) ?? undefined,
    urlSite: (r.url_site as string | null) ?? undefined,
    urlDescription: (r.url_description as string | null) ?? undefined,
    urlFetchedAt: r.url_fetched_at != null ? Number(r.url_fetched_at as number | string) : undefined,
    links,
    body: (r.body as string) ?? "",
    tags,
    isFavorite: !!r.is_favorite,
    isPrivate: !!r.is_private,
    archived: !!r.archived,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseInspirationCollectionRow(r: Json): InspirationCollection {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "",
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseStyleCardRow(r: Json): WorkStyleCard {
  const wid = r.work_id as string;
  return {
    id: wid,
    workId: wid,
    pov: (r.pov as string) ?? "",
    tone: (r.tone as string) ?? "",
    bannedPhrases: (r.banned_phrases as string) ?? "",
    styleAnchor: (r.style_anchor as string) ?? "",
    extraRules: (r.extra_rules as string) ?? "",
    updatedAt: Number(r.updated_at),
  };
}

export function parseBibleCharacterRow(r: Json): BibleCharacter {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    name: r.name as string,
    motivation: (r.motivation as string) ?? "",
    relationships: (r.relationships as string) ?? "",
    voiceNotes: (r.voice_notes as string) ?? "",
    taboos: (r.taboos as string) ?? "",
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseBibleWorldRow(r: Json): BibleWorldEntry {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    entryKind: r.entry_kind as string,
    title: r.title as string,
    body: (r.body as string) ?? "",
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseBibleForeRow(r: Json): BibleForeshadow {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    title: r.title as string,
    plantedWhere: (r.planted_where as string) ?? "",
    plannedResolve: (r.planned_resolve as string) ?? "",
    status: (r.status as BibleForeshadowStatus | undefined) ?? "pending",
    note: (r.note as string) ?? "",
    chapterId: (r.chapter_id as string | null) ?? null,
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseBibleTimelineRow(r: Json): BibleTimelineEvent {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    label: r.label as string,
    sortOrder: Number(r.sort_order),
    note: (r.note as string) ?? "",
    chapterId: (r.chapter_id as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseLogicPlaceNodeRow(r: Json): LogicPlaceNode {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    name: (r.name as string) ?? "",
    note: (r.note as string) ?? "",
    x: Number(r.x ?? 50),
    y: Number(r.y ?? 50),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseLogicPlaceEventRow(r: Json): LogicPlaceEvent {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    placeId: r.place_id as string,
    label: (r.label as string) ?? "",
    note: (r.note as string) ?? "",
    chapterId: (r.chapter_id as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function toLogicPlaceNodeInsert(p: LogicPlaceNode): Json {
  return {
    id: p.id,
    work_id: p.workId,
    name: p.name,
    note: p.note ?? "",
    x: p.x ?? 50,
    y: p.y ?? 50,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function toLogicPlaceEventInsert(e: LogicPlaceEvent): Json {
  return {
    id: e.id,
    work_id: e.workId,
    place_id: e.placeId,
    label: e.label,
    note: e.note ?? "",
    chapter_id: e.chapterId ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function parseBibleTplRow(r: Json): BibleChapterTemplate {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    name: r.name as string,
    goalText: (r.goal_text as string) ?? "",
    forbidText: (r.forbid_text as string) ?? "",
    povText: (r.pov_text as string) ?? "",
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseChapterBibleRow(r: Json): ChapterBible {
  return {
    id: r.id as string,
    chapterId: r.chapter_id as string,
    workId: r.work_id as string,
    goalText: (r.goal_text as string) ?? "",
    forbidText: (r.forbid_text as string) ?? "",
    povText: (r.pov_text as string) ?? "",
    sceneStance: (r.scene_stance as string) ?? "",
    characterStateText: (r.character_state as string) ?? "",
    updatedAt: Number(r.updated_at),
  };
}

export function parseGlossaryRow(r: Json): BibleGlossaryTerm {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    term: r.term as string,
    category: r.category as BibleGlossaryTerm["category"],
    note: (r.note as string) ?? "",
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseWritingPromptTemplateRow(r: Json): WritingPromptTemplate {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    category: (r.category as string) ?? "",
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseWritingStyleSampleRow(r: Json): WritingStyleSample {
  return {
    id: r.id as string,
    workId: r.work_id as string,
    title: (r.title as string) ?? "",
    body: (r.body as string) ?? "",
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function parseGlobalPromptTemplateRow(r: Json): GlobalPromptTemplate {
  const reviewNote = (r.review_note as string | null | undefined) ?? undefined;
  return {
    id: r.id as string,
    title: (r.title as string) ?? "",
    type: ((r.type as string) ?? "continue") as PromptType,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    body: (r.body as string) ?? "",
    status: ((r.status as string) ?? "draft") as PromptStatus,
    ...(reviewNote ? { reviewNote } : {}),
    userId: (r.user_id as string) ?? undefined,
    sortOrder: Number(r.sort_order),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function toWorkInsert(uid: string, w: Work): Json {
  const tagRow = normalizeWorkTagList(w.tags) ?? [];
  return {
    id: w.id,
    user_id: uid,
    title: w.title,
    description: w.description && w.description.trim().length ? w.description.trim() : null,
    status: w.status ?? "serializing",
    created_at: w.createdAt,
    updated_at: w.updatedAt,
    progress_cursor: w.progressCursor,
    cover_image: w.coverImage && w.coverImage.length > 0 ? w.coverImage : null,
    tags: tagRow,
  };
}

export function toVolumeInsert(v: Volume): Json {
  return {
    id: v.id,
    work_id: v.workId,
    title: v.title,
    order: v.order,
    created_at: v.createdAt,
    summary: v.summary === "" || v.summary === undefined ? null : v.summary,
  };
}

export function toChapterInsert(c: Chapter): Json {
  return {
    id: c.id,
    work_id: c.workId,
    volume_id: c.volumeId,
    title: c.title,
    content: c.content,
    summary: c.summary === "" || c.summary === undefined ? null : c.summary,
    order: c.order,
    updated_at: c.updatedAt,
    word_count_cache: c.wordCountCache ?? null,
    summary_updated_at: c.summaryUpdatedAt ?? null,
    summary_scope_from: c.summaryScopeFromOrder ?? null,
    summary_scope_to: c.summaryScopeToOrder ?? null,
    outline_draft: c.outlineDraft ?? null,
    outline_node_id: c.outlineNodeId ?? null,
    outline_pushed_at: c.outlinePushedAt ?? null,
  };
}

export function toSnapshotInsert(s: ChapterSnapshot): Json {
  return {
    id: s.id,
    chapter_id: s.chapterId,
    content: s.content,
    created_at: s.createdAt,
  };
}

export function toStyleCardInsert(card: WorkStyleCard, rowId: string): Json {
  return {
    id: rowId,
    work_id: card.workId,
    pov: card.pov,
    tone: card.tone,
    banned_phrases: card.bannedPhrases,
    style_anchor: card.styleAnchor,
    extra_rules: card.extraRules,
    updated_at: card.updatedAt,
  };
}

export function toStyleCardUpsert(card: WorkStyleCard): Json {
  return {
    work_id: card.workId,
    pov: card.pov,
    tone: card.tone,
    banned_phrases: card.bannedPhrases,
    style_anchor: card.styleAnchor,
    extra_rules: card.extraRules,
    updated_at: card.updatedAt,
  };
}

export function mergeWritingRowsToInserts(uid: string, m: MergeRemapResult): {
  works: Json[];
  volumes: Json[];
  chapters: Json[];
  snaps: Json[];
  bibleChars: Json[];
  bibleWorld: Json[];
  bibleFore: Json[];
  bibleTime: Json[];
  bibleTpl: Json[];
  chapterBible: Json[];
  bibleGloss: Json[];
  styleCards: Json[];
  inspirationCollections: Json[];
  inspirationFrags: Json[];
  writingPromptTpl: Json[];
  writingStyleSamples: Json[];
  logicPlaceNodes: Json[];
  logicPlaceEvents: Json[];
} {
  const works = m.newWorks.map((w) => toWorkInsert(uid, w));
  const volumes = m.newVolumes.map(toVolumeInsert);
  const chapters = m.newChapters.map(toChapterInsert);
  const snaps = m.newSnaps.map(toSnapshotInsert);
  const bibleChars = m.newBibleChars.map((c) => ({
    id: c.id,
    work_id: c.workId,
    name: c.name,
    motivation: c.motivation,
    relationships: c.relationships,
    voice_notes: c.voiceNotes,
    taboos: c.taboos,
    sort_order: c.sortOrder,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const bibleWorld = m.newBibleWorld.map((c) => ({
    id: c.id,
    work_id: c.workId,
    entry_kind: c.entryKind,
    title: c.title,
    body: c.body,
    sort_order: c.sortOrder,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const bibleFore = m.newBibleFore.map((c) => ({
    id: c.id,
    work_id: c.workId,
    title: c.title,
    planted_where: c.plantedWhere,
    planned_resolve: c.plannedResolve,
    status: c.status,
    note: c.note,
    chapter_id: c.chapterId,
    sort_order: c.sortOrder,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const bibleTime = m.newBibleTime.map((c) => ({
    id: c.id,
    work_id: c.workId,
    label: c.label,
    sort_order: c.sortOrder,
    note: c.note,
    chapter_id: c.chapterId,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const bibleTpl = m.newBibleTpl.map((c) => ({
    id: c.id,
    work_id: c.workId,
    name: c.name,
    goal_text: c.goalText,
    forbid_text: c.forbidText,
    pov_text: c.povText,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const chapterBible = m.newChapterBible.map((c) => ({
    id: c.id,
    chapter_id: c.chapterId,
    work_id: c.workId,
    goal_text: c.goalText,
    forbid_text: c.forbidText,
    pov_text: c.povText,
    scene_stance: c.sceneStance,
    character_state: c.characterStateText ?? "",
    updated_at: c.updatedAt,
  }));
  const bibleGloss = m.newBibleGloss.map((c) => ({
    id: c.id,
    work_id: c.workId,
    term: c.term,
    category: c.category,
    note: c.note,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const styleCards = m.newStyleCards.map((s) => ({
    id: crypto.randomUUID(),
    work_id: s.workId,
    pov: s.pov,
    tone: s.tone,
    banned_phrases: s.bannedPhrases,
    style_anchor: s.styleAnchor,
    extra_rules: s.extraRules,
    updated_at: s.updatedAt,
  }));
  const inspirationCollections = (m.newInspirationCollections ?? []).map((c) => ({
    id: c.id,
    user_id: uid,
    name: c.name,
    sort_order: c.sortOrder,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));
  const inspirationFrags = m.newInspirationFragments.map((f) => ({
    id: f.id,
    user_id: uid,
    work_id: f.workId,
    collection_id: f.collectionId ?? null,
    title: f.title ?? null,
    source_name: f.sourceName ?? null,
    source_url: f.sourceUrl ?? null,
    url_title: f.urlTitle ?? null,
    url_site: f.urlSite ?? null,
    url_description: f.urlDescription ?? null,
    url_fetched_at: f.urlFetchedAt ?? null,
    links: f.links ?? [],
    body: f.body,
    tags: normalizeWorkTagList(f.tags) ?? [],
    is_favorite: !!f.isFavorite,
    is_private: !!f.isPrivate,
    archived: !!f.archived,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  }));
  const writingPromptTpl = m.newWritingPromptTemplates.map((p) => ({
    id: p.id,
    work_id: p.workId,
    category: p.category,
    title: p.title,
    body: p.body,
    sort_order: p.sortOrder,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));
  const writingStyleSamples = m.newWritingStyleSamples.map((s) => ({
    id: s.id,
    work_id: s.workId,
    title: s.title,
    body: s.body,
    sort_order: s.sortOrder,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }));
  const logicPlaceNodes = (m as unknown as { newLogicPlaceNodes?: LogicPlaceNode[] }).newLogicPlaceNodes
    ? (m as unknown as { newLogicPlaceNodes: LogicPlaceNode[] }).newLogicPlaceNodes.map(toLogicPlaceNodeInsert)
    : [];
  const logicPlaceEvents = (m as unknown as { newLogicPlaceEvents?: LogicPlaceEvent[] }).newLogicPlaceEvents
    ? (m as unknown as { newLogicPlaceEvents: LogicPlaceEvent[] }).newLogicPlaceEvents.map(toLogicPlaceEventInsert)
    : [];
  return {
    works,
    volumes,
    chapters,
    snaps,
    bibleChars,
    bibleWorld,
    bibleFore,
    bibleTime,
    bibleTpl,
    chapterBible,
    bibleGloss,
    styleCards,
    inspirationCollections,
    inspirationFrags,
    writingPromptTpl,
    writingStyleSamples,
    logicPlaceNodes,
    logicPlaceEvents,
  };
}
