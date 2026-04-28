import { getSupabase } from "../lib/supabase";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  GlobalPromptTemplate,
  LogicPlaceEvent,
  LogicPlaceNode,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
  InspirationCollection,
  InspirationFragment,
  ReferenceChapterHead,
  ReferenceChunk,
  ReferenceExcerpt,
  ReferenceExcerptTag,
  ReferenceLibraryEntry,
  ReferenceSearchHit,
  ReferenceTag,
  ReferenceTokenPosting,
  Volume,
  Work,
  WorkStyleCard,
  WritingPromptTemplate,
  WritingStyleSample,
  TuiyanState,
} from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import { normalizeWorkTagList } from "../util/work-tags";
import { wordCount } from "../util/wordCount";
import { ChapterSaveConflictError } from "./chapter-save-conflict";
import type { UpdateChapterOptions, WritingStore } from "./writing-store";
import { remapImportMergePayload, type MergeRemapResult } from "./backup-merge-remap";
import { normalizeImportRows } from "./import-normalize";
import {
  mergeWritingRowsToInserts,
  parseBibleCharacterRow,
  parseBibleForeRow,
  parseBibleTplRow,
  parseBibleTimelineRow,
  parseLogicPlaceEventRow,
  parseLogicPlaceNodeRow,
  parseBibleWorldRow,
  parseGlobalPromptTemplateRow,
  parseInspirationCollectionRow,
  parseInspirationFragmentRow,
  parseChapterBibleRow,
  parseChapterRow,
  parseGlossaryRow,
  parseSnapshotRow,
  parseStyleCardRow,
  parseVolumeRow,
  parseWorkRow,
  parseWritingPromptTemplateRow,
  parseWritingStyleSampleRow,
  toChapterInsert,
  toSnapshotInsert,
  toStyleCardUpsert,
  toVolumeInsert,
  toWorkInsert,
  toLogicPlaceEventInsert,
  toLogicPlaceNodeInsert,
} from "./supabase-writing-rows";

type Json = Record<string, unknown>;
const PLANNING_PUSHED_OUTLINES_META_KEY = "__planning_pushed_outlines__";

function now() {
  return Date.now();
}

async function requireUid(): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("请先登录");
  return uid;
}

async function maybeUid(): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function chunkedInsert(table: string, rows: Json[], size = 250): Promise<void> {
  if (rows.length === 0) return;
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await sb.from(table).insert(batch as never);
    if (error) throw new Error(error.message);
  }
}

function refOnly(): never {
  throw new Error("参考库仅保存在本机 IndexedDB，请使用默认 Hybrid 存储。");
}

/**
 * 写作 / 本书锦囊 / 风格卡存 Supabase；不包含参考库表。
 * 生产环境请通过 {@link WritingStoreHybrid} 与 IndexedDB 组合使用。
 */
export class WritingStoreSupabase implements WritingStore {
  async init(): Promise<void> {
    getSupabase();
  }

  async applyRemappedMergeWritingOnly(m: MergeRemapResult): Promise<void> {
    const uid = await requireUid();
    const rows = mergeWritingRowsToInserts(uid, m);
    await chunkedInsert("work", rows.works);
    await chunkedInsert("volume", rows.volumes);
    await chunkedInsert("chapter", rows.chapters);
    await chunkedInsert("chapter_snapshot", rows.snaps);
    await chunkedInsert("bible_character", rows.bibleChars);
    await chunkedInsert("bible_world_entry", rows.bibleWorld);
    await chunkedInsert("bible_foreshadow", rows.bibleFore);
    await chunkedInsert("bible_timeline_event", rows.bibleTime);
    await chunkedInsert("bible_chapter_template", rows.bibleTpl);
    await chunkedInsert("chapter_bible", rows.chapterBible);
    await chunkedInsert("bible_glossary_term", rows.bibleGloss);
    await chunkedInsert("work_style_card", rows.styleCards);
    await chunkedInsert("inspiration_collection", rows.inspirationCollections);
    await chunkedInsert("inspiration_fragment", rows.inspirationFrags);
    await chunkedInsert("writing_prompt_template", rows.writingPromptTpl);
    await chunkedInsert("writing_style_sample", rows.writingStyleSamples);
  }

  async getTuiyanState(workId: string): Promise<TuiyanState | undefined> {
    const uid = await maybeUid();
    if (!uid) return undefined;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("tuiyan_state")
      .select("*")
      .eq("user_id", uid)
      .eq("work_id", workId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    const row = data as Json;
    return {
      id: String(row.id),
      workId: String(row.work_id),
      updatedAt: Number(row.updated_at ?? 0) || now(),
      chatHistory: (row.chat_history as TuiyanState["chatHistory"]) ?? [],
      chatThreads: (row.chat_threads as TuiyanState["chatThreads"] | undefined) ?? undefined,
      activeChatThreadId: (row.active_chat_thread_id as string | null | undefined) ?? undefined,
      wenCe: (row.wence as TuiyanState["wenCe"]) ?? [],
      finalizedNodeIds: (row.finalized_node_ids as string[]) ?? [],
      statusByNodeId: (row.status_by_node_id as TuiyanState["statusByNodeId"]) ?? {},
      linkedRefWorkIds: (row.linked_ref_work_ids as string[]) ?? [],
      referenceBindings: (row.reference_bindings as TuiyanState["referenceBindings"] | undefined) ?? [],
      referencePolicy: (row.reference_policy as TuiyanState["referencePolicy"] | undefined) ?? undefined,
      mindmap: (row.mindmap as TuiyanState["mindmap"]) ?? undefined,
      scenes: (row.scenes as TuiyanState["scenes"]) ?? [],
      selectedPromptTemplateId: (row.selected_prompt_template_id as string | null | undefined) ?? null,
      planningIdea: (row.planning_idea as string | undefined) ?? "",
      planningTree: (row.planning_tree as TuiyanState["planningTree"]) ?? [],
      planningDraftsByNodeId:
        (row.planning_drafts_by_node_id as TuiyanState["planningDraftsByNodeId"]) ?? {},
      planningMetaByNodeId:
        (row.planning_meta_by_node_id as TuiyanState["planningMetaByNodeId"]) ?? {},
      planningSelectedNodeId: (row.planning_selected_node_id as string | null | undefined) ?? null,
      planningStructuredMetaByNodeId:
        (row.planning_structured_meta_by_node_id as TuiyanState["planningStructuredMetaByNodeId"]) ?? {},
      planningOutlineTargetVolumesByNodeId:
        (row.planning_outline_target_volumes_by_node_id as TuiyanState["planningOutlineTargetVolumesByNodeId"]) ?? {},
      planningVolumeTargetChaptersByNodeId:
        (row.planning_volume_target_chapters_by_node_id as TuiyanState["planningVolumeTargetChaptersByNodeId"]) ?? {},
      planningPushedOutlines: (() => {
        const col = row.planning_pushed_outlines as TuiyanState["planningPushedOutlines"] | null | undefined;
        if (col?.length) return col;
        const embedded = ((row.planning_meta_by_node_id as Json | undefined)?.[
          PLANNING_PUSHED_OUTLINES_META_KEY
        ] as { entries?: TuiyanState["planningPushedOutlines"] } | undefined)?.entries;
        return embedded?.length ? embedded : [];
      })(),
    };
  }

  async upsertTuiyanState(
    workId: string,
    patch: Partial<Omit<TuiyanState, "id" | "workId" | "updatedAt">> & { updatedAt?: number },
  ): Promise<TuiyanState> {
    const uid = await requireUid();
    const sb = getSupabase();
    const t = Number.isFinite(patch.updatedAt) ? Number(patch.updatedAt) : now();

    const { data: existing, error: e0 } = await sb
      .from("tuiyan_state")
      .select("*")
      .eq("user_id", uid)
      .eq("work_id", workId)
      .maybeSingle();
    if (e0) throw new Error(e0.message);

    const prev = existing as Json | null;
    const chatHistory = (patch.chatHistory ?? (prev?.chat_history as TuiyanState["chatHistory"]) ?? []) as TuiyanState["chatHistory"];
    const chatThreads = (patch.chatThreads !== undefined
      ? patch.chatThreads
      : (prev?.chat_threads as TuiyanState["chatThreads"] | undefined)) as
      | TuiyanState["chatThreads"]
      | undefined;
    const activeChatThreadId =
      patch.activeChatThreadId !== undefined
        ? patch.activeChatThreadId
        : ((prev?.active_chat_thread_id as string | null | undefined) ?? null);
    const wenCe = (patch.wenCe ?? (prev?.wence as TuiyanState["wenCe"]) ?? []) as TuiyanState["wenCe"];
    const finalizedNodeIds = (patch.finalizedNodeIds ?? (prev?.finalized_node_ids as string[]) ?? []) as string[];
    const statusByNodeId = (patch.statusByNodeId ?? (prev?.status_by_node_id as TuiyanState["statusByNodeId"]) ?? {}) as TuiyanState["statusByNodeId"];
    const linkedRefWorkIds = (patch.linkedRefWorkIds ?? (prev?.linked_ref_work_ids as string[]) ?? []) as string[];
    const referenceBindings = (patch.referenceBindings ?? (prev?.reference_bindings as TuiyanState["referenceBindings"] | undefined) ?? []) as TuiyanState["referenceBindings"];
    const referencePolicy = (patch.referencePolicy ?? (prev?.reference_policy as TuiyanState["referencePolicy"] | undefined) ?? undefined) as TuiyanState["referencePolicy"] | undefined;
    const mindmap = (patch.mindmap ?? (prev?.mindmap as TuiyanState["mindmap"]) ?? undefined) as
      | TuiyanState["mindmap"]
      | undefined;
    const scenes = (patch.scenes ?? (prev?.scenes as TuiyanState["scenes"]) ?? []) as TuiyanState["scenes"];
    const selectedPromptTemplateId = (patch.selectedPromptTemplateId ??
      (prev?.selected_prompt_template_id as string | null | undefined) ??
      null) as string | null;
    const planningIdea = (patch.planningIdea ?? (prev?.planning_idea as string | undefined) ?? "") as string;
    const planningTree = (patch.planningTree ?? (prev?.planning_tree as TuiyanState["planningTree"]) ?? []) as
      TuiyanState["planningTree"];
    const planningDraftsByNodeId = (patch.planningDraftsByNodeId ??
      (prev?.planning_drafts_by_node_id as TuiyanState["planningDraftsByNodeId"]) ??
      {}) as TuiyanState["planningDraftsByNodeId"];
    const rawPlanningMetaByNodeId = (patch.planningMetaByNodeId ??
      (prev?.planning_meta_by_node_id as TuiyanState["planningMetaByNodeId"]) ??
      {}) as TuiyanState["planningMetaByNodeId"];
    const planningSelectedNodeId = (patch.planningSelectedNodeId ??
      (prev?.planning_selected_node_id as string | null | undefined) ??
      null) as string | null;
    const planningStructuredMetaByNodeId = (patch.planningStructuredMetaByNodeId ??
      (prev?.planning_structured_meta_by_node_id as TuiyanState["planningStructuredMetaByNodeId"]) ??
      {}) as TuiyanState["planningStructuredMetaByNodeId"];
    const planningOutlineTargetVolumesByNodeId = (patch.planningOutlineTargetVolumesByNodeId ??
      (prev?.planning_outline_target_volumes_by_node_id as TuiyanState["planningOutlineTargetVolumesByNodeId"]) ??
      {}) as TuiyanState["planningOutlineTargetVolumesByNodeId"];
    const planningVolumeTargetChaptersByNodeId = (patch.planningVolumeTargetChaptersByNodeId ??
      (prev?.planning_volume_target_chapters_by_node_id as TuiyanState["planningVolumeTargetChaptersByNodeId"]) ??
      {}) as TuiyanState["planningVolumeTargetChaptersByNodeId"];
    const planningPushedOutlines = (patch.planningPushedOutlines ??
      (prev?.planning_pushed_outlines as TuiyanState["planningPushedOutlines"]) ??
      ((prev?.planning_meta_by_node_id as Json | undefined)?.[PLANNING_PUSHED_OUTLINES_META_KEY] as
        | { entries?: TuiyanState["planningPushedOutlines"] }
        | undefined)?.entries ??
      []) as TuiyanState["planningPushedOutlines"];
    const planningMetaByNodeId = {
      ...rawPlanningMetaByNodeId,
      [PLANNING_PUSHED_OUTLINES_META_KEY]: { entries: planningPushedOutlines },
    } as unknown as TuiyanState["planningMetaByNodeId"];

    const payload = {
      user_id: uid,
      work_id: workId,
      updated_at: t,
      chat_history: chatHistory as unknown,
      chat_threads: (Array.isArray(chatThreads) ? chatThreads : []) as unknown,
      active_chat_thread_id: activeChatThreadId,
      wence: wenCe as unknown,
      finalized_node_ids: finalizedNodeIds as unknown,
      status_by_node_id: statusByNodeId as unknown,
      linked_ref_work_ids: linkedRefWorkIds as unknown,
      reference_bindings: (referenceBindings ?? []) as unknown,
      reference_policy: (referencePolicy ?? {}) as unknown,
      mindmap: (mindmap ?? {}) as unknown,
      scenes: (scenes ?? []) as unknown,
      selected_prompt_template_id: selectedPromptTemplateId,
      planning_idea: planningIdea,
      planning_tree: (planningTree ?? []) as unknown,
      planning_drafts_by_node_id: (planningDraftsByNodeId ?? {}) as unknown,
      planning_meta_by_node_id: (planningMetaByNodeId ?? {}) as unknown,
      planning_selected_node_id: planningSelectedNodeId,
      planning_structured_meta_by_node_id: (planningStructuredMetaByNodeId ?? {}) as unknown,
      planning_outline_target_volumes_by_node_id: (planningOutlineTargetVolumesByNodeId ?? {}) as unknown,
      planning_volume_target_chapters_by_node_id: (planningVolumeTargetChaptersByNodeId ?? {}) as unknown,
      planning_pushed_outlines: (planningPushedOutlines ?? []) as unknown,
    };

    const { data, error } = await sb
      .from("tuiyan_state")
      .upsert(payload as never, { onConflict: "user_id,work_id" })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? payload) as unknown as Json;
    const persisted = row as { id?: unknown; updated_at?: unknown };
    return {
      id: String(persisted.id ?? `${uid}:${workId}`),
      workId,
      updatedAt: Number(persisted.updated_at ?? t) || t,
      chatHistory,
      chatThreads,
      activeChatThreadId,
      wenCe,
      finalizedNodeIds,
      statusByNodeId,
      linkedRefWorkIds,
      referenceBindings,
      referencePolicy,
      mindmap: mindmap ?? undefined,
      scenes,
      selectedPromptTemplateId,
      planningIdea,
      planningTree,
      planningDraftsByNodeId,
      planningMetaByNodeId,
      planningSelectedNodeId,
      planningStructuredMetaByNodeId,
      planningOutlineTargetVolumesByNodeId,
      planningVolumeTargetChaptersByNodeId,
      planningPushedOutlines,
    };
  }

  async listWorks(): Promise<Work[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    const sb = getSupabase();
    const { data, error } = await sb
      .from("work")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseWorkRow);
  }

  async getWork(id: string): Promise<Work | undefined> {
    const uid = await maybeUid();
    if (!uid) return undefined;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("work")
      .select("*")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    return parseWorkRow(data as Json);
  }

  async getWorkIdByBookNo(bookNo: number): Promise<string | undefined> {
    const uid = await maybeUid();
    if (!uid) return undefined;
    if (!Number.isFinite(bookNo) || bookNo <= 0) return undefined;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("work")
      .select("id")
      .eq("user_id", uid)
      .eq("book_no", bookNo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id;
  }

  private async allocateNextBookNo(uid: string): Promise<number> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("work")
      .select("book_no")
      .eq("user_id", uid)
      .order("book_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { book_no: number | null } | null;
    const max = row?.book_no != null ? Number(row.book_no) : 0;
    return (Number.isFinite(max) && max > 0 ? max : 0) + 1;
  }

  async createWork(title: string, opts?: { tags?: string[]; description?: string; status?: Work["status"] }): Promise<Work> {
    const uid = await requireUid();
    const sb = getSupabase();
    const id = crypto.randomUUID();
    const t = now();
    const tags = normalizeWorkTagList(opts?.tags);
    const desc = (opts?.description ?? "").trim();
    const status = opts?.status ?? "serializing";
    const bookNo = await this.allocateNextBookNo(uid);
    const work: Work = {
      id,
      title: title.trim() || "未命名作品",
      createdAt: t,
      updatedAt: t,
      progressCursor: null,
      bookNo,
      ...(desc ? { description: desc } : {}),
      ...(status ? { status } : {}),
      ...(tags?.length ? { tags } : {}),
    };
    const { error: e1 } = await sb.from("work").insert(toWorkInsert(uid, work) as never);
    if (e1) throw new Error(e1.message);
    const vid = crypto.randomUUID();
    const vol: Volume = {
      id: vid,
      workId: id,
      title: "正文",
      order: 0,
      createdAt: t,
      summary: "",
    };
    const { error: e2 } = await sb.from("volume").insert(toVolumeInsert(vol) as never);
    if (e2) throw new Error(e2.message);
    return work;
  }

  async updateWork(
    id: string,
    patch: Partial<Pick<Work, "title" | "progressCursor" | "coverImage" | "tags" | "description" | "status" | "bookNo">>,
  ): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = String(patch.description ?? "").trim();
    if (patch.status !== undefined) row.status = patch.status ?? "serializing";
    if (patch.progressCursor !== undefined) row.progress_cursor = patch.progressCursor;
    if (patch.coverImage !== undefined) row.cover_image = patch.coverImage === "" ? null : patch.coverImage;
    if (patch.tags !== undefined) row.tags = normalizeWorkTagList(patch.tags) ?? [];
    if (patch.bookNo !== undefined) {
      row.book_no = typeof patch.bookNo === "number" && patch.bookNo > 0 ? patch.bookNo : null;
    }
    const { error } = await sb.from("work").update(row as never).eq("id", id).eq("user_id", uid);
    if (error) throw new Error(error.message);
  }

  async deleteWork(id: string): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const { error } = await sb.from("work").delete().eq("id", id).eq("user_id", uid);
    if (error) throw new Error(error.message);
  }

  async listVolumes(workId: string): Promise<Volume[]> {
    await requireUid();
    const sb = getSupabase();
    const { data, error } = await sb
      .from("volume")
      .select("*")
      .eq("work_id", workId)
      .order("order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseVolumeRow);
  }

  async createVolume(workId: string, title?: string): Promise<Volume> {
    await requireUid();
    const sb = getSupabase();
    const existing = await this.listVolumes(workId);
    const maxOrder = existing.length === 0 ? -1 : Math.max(...existing.map((v) => v.order));
    const id = crypto.randomUUID();
    const t = now();
    const vol: Volume = {
      id,
      workId,
      title: title?.trim() || `第 ${existing.length + 1} 卷`,
      order: maxOrder + 1,
      createdAt: t,
      summary: "",
    };
    const { error: e1 } = await sb.from("volume").insert(toVolumeInsert(vol) as never);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb.from("work").update({ updated_at: t } as never).eq("id", workId);
    if (e2) throw new Error(e2.message);
    return vol;
  }

  async updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order" | "summary">>): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const row: Json = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.order !== undefined) row.order = patch.order;
    if (patch.summary !== undefined) row.summary = patch.summary === "" ? null : patch.summary;
    const { error } = await sb.from("volume").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteVolume(volumeId: string): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const vol = (await sb.from("volume").select("*").eq("id", volumeId).maybeSingle()).data as Json | null;
    if (!vol) return;
    const workId = vol.work_id as string;
    const siblings = await this.listVolumes(workId);
    if (siblings.length <= 1) throw new Error("至少保留一卷");
    const target = siblings.find((v) => v.id !== volumeId)!;
    const t = now();
    const { data: chRows } = await sb.from("chapter").select("id").eq("volume_id", volumeId);
    const chIds = (chRows as { id: string }[] | null)?.map((c) => c.id) ?? [];
    for (const chId of chIds) {
      const { error } = await sb
        .from("chapter")
        .update({ volume_id: target.id, updated_at: t } as never)
        .eq("id", chId);
      if (error) throw new Error(error.message);
    }
    const { error: ev } = await sb.from("volume").delete().eq("id", volumeId);
    if (ev) throw new Error(ev.message);
    await sb.from("work").update({ updated_at: t } as never).eq("id", workId);
  }

  async listChapters(workId: string): Promise<Chapter[]> {
    await requireUid();
    const sb = getSupabase();
    const { data, error } = await sb
      .from("chapter")
      .select(
        [
          "id",
          "work_id",
          "volume_id",
          "title",
          "content",
          "summary",
          "summary_updated_at",
          "summary_scope_from",
          "summary_scope_to",
          "outline_draft",
          "outline_node_id",
          "outline_pushed_at",
          "order",
          "updated_at",
          "word_count_cache",
        ].join(","),
      )
      .eq("work_id", workId)
      .order("order", { ascending: true })
      .limit(100_000);
    if (error) throw new Error(error.message);
    return (data as unknown as Json[]).map(parseChapterRow);
  }

  async createChapter(workId: string, title?: string, volumeId?: string): Promise<Chapter> {
    await requireUid();
    const vols = await this.listVolumes(workId);
    const vid = volumeId ?? vols[0]?.id;
    if (!vid) throw new Error("作品无卷，请先创建作品");
    const existing = await this.listChapters(workId);
    const maxOrder = existing.length === 0 ? -1 : Math.max(...existing.map((c) => c.order));
    const id = crypto.randomUUID();
    const t = now();
    const chapter: Chapter = {
      id,
      workId,
      volumeId: vid,
      title: title?.trim() || `第 ${maxOrder + 2} 章`,
      content: "",
      summary: "",
      order: maxOrder + 1,
      updatedAt: t,
      wordCountCache: 0,
    };
    const sb = getSupabase();
    const { error: e1 } = await sb.from("chapter").insert(toChapterInsert(chapter) as never);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb.from("work").update({ updated_at: t } as never).eq("id", workId);
    if (e2) throw new Error(e2.message);
    return chapter;
  }

  async updateChapter(
    id: string,
    patch: Partial<
      Pick<
        Chapter,
        "title" | "content" | "volumeId" | "summary" | "summaryUpdatedAt" | "summaryScopeFromOrder" | "summaryScopeToOrder" | "outlineDraft" | "outlineNodeId" | "outlinePushedAt" | "chapterNote"
      >
    >,
    options?: UpdateChapterOptions,
  ): Promise<number | undefined> {
    await requireUid();
    const sb = getSupabase();
    const t = now();
    const row: Json = { updated_at: t };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.volumeId !== undefined) row.volume_id = patch.volumeId;
    if (patch.summary !== undefined) {
      row.summary = patch.summary === "" ? null : patch.summary;
      row.summary_updated_at = patch.summaryUpdatedAt ?? t;
    } else if (patch.summaryUpdatedAt !== undefined) {
      row.summary_updated_at = patch.summaryUpdatedAt;
    }
    if (patch.summaryScopeFromOrder !== undefined) row.summary_scope_from = patch.summaryScopeFromOrder;
    if (patch.summaryScopeToOrder !== undefined) row.summary_scope_to = patch.summaryScopeToOrder;
    if (patch.content !== undefined) {
      row.content = patch.content;
      row.word_count_cache = wordCount(patch.content);
    }
    if (patch.outlineDraft !== undefined) row.outline_draft = patch.outlineDraft ?? null;
    if (patch.outlineNodeId !== undefined) row.outline_node_id = patch.outlineNodeId ?? null;
    if (patch.outlinePushedAt !== undefined) row.outline_pushed_at = patch.outlinePushedAt ?? null;
    if (patch.chapterNote !== undefined) row.chapter_note = patch.chapterNote ?? null;
    let qb = sb.from("chapter").update(row as never).eq("id", id);
    if (options?.expectedUpdatedAt !== undefined) {
      qb = qb.eq("updated_at", options.expectedUpdatedAt);
    }
    const { data, error } = await qb.select("updated_at");
    if (error) throw new Error(error.message);
    if (options?.expectedUpdatedAt !== undefined && (!data || data.length === 0)) {
      throw new ChapterSaveConflictError();
    }
    const written =
      (data as { updated_at: number }[] | null | undefined)?.[0]?.updated_at;
    if (typeof written === "number" && Number.isFinite(written) && written > 0) return written;
    return t;
  }

  async deleteChapter(id: string): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const { data: ch } = await sb.from("chapter").select("id,work_id").eq("id", id).maybeSingle();
    const row = ch as { id: string; work_id: string } | null;
    if (!row) return;
    const { data: w } = await sb
      .from("work")
      .select("progress_cursor")
      .eq("id", row.work_id)
      .eq("user_id", uid)
      .maybeSingle();
    const prog = (w as { progress_cursor: string | null } | null)?.progress_cursor;
    const { error: e1 } = await sb.from("chapter").delete().eq("id", id);
    if (e1) throw new Error(e1.message);
    if (prog === id) {
      await sb
        .from("work")
        .update({ progress_cursor: null, updated_at: now() } as never)
        .eq("id", row.work_id)
        .eq("user_id", uid);
    } else {
      await sb.from("work").update({ updated_at: now() } as never).eq("id", row.work_id).eq("user_id", uid);
    }
  }

  async reorderChapters(workId: string, orderedIds: string[]): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const t = now();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("chapter")
        .update({ order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
    await sb.from("work").update({ updated_at: t } as never).eq("id", workId);
  }

  async searchWork(workId: string, query: string, scope?: BookSearchScope, isRegex?: boolean): Promise<BookSearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    let re: RegExp;
    try {
      re = isRegex ? new RegExp(q, "g") : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    } catch {
      re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    }
    const work = await this.getWork(workId);
    let chapters = await this.listChapters(workId);
    if (scope === "beforeProgress" && work?.progressCursor) {
      const cur = chapters.find((c) => c.id === work.progressCursor);
      const curOrder = cur?.order ?? Infinity;
      chapters = chapters.filter((c) => c.order < curOrder);
    }
    const CONTEXT = 60;
    const MAX_CONTEXTS = 3;
    const hits: BookSearchHit[] = [];
    for (const ch of chapters) {
      const text = ch.content;
      const offsets: number[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) { offsets.push(m.index); if (offsets.length > 500) break; }
      if (offsets.length === 0) continue;
      const firstOffset = offsets[0];
      const start0 = Math.max(0, firstOffset - 40);
      const preview = text.slice(start0, start0 + 120).replace(/\s+/g, " ").trim();
      const contexts: string[] = [];
      let lastEnd = -1;
      for (const off of offsets) {
        if (off < lastEnd) continue;
        const cStart = Math.max(0, off - CONTEXT);
        const cEnd = Math.min(text.length, off + CONTEXT + q.length);
        const snippet = text.slice(cStart, cEnd).replace(/\s+/g, " ").trim();
        contexts.push(`${cStart > 0 ? "…" : ""}${snippet}${cEnd < text.length ? "…" : ""}`);
        lastEnd = off + q.length;
        if (contexts.length >= MAX_CONTEXTS) break;
      }
      hits.push({ chapterId: ch.id, chapterTitle: ch.title, matchCount: offsets.length, preview: preview.length ? `…${preview}…` : "…", contexts, firstMatchOffset: firstOffset });
    }
    return hits;
  }

  async listChapterSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
    await requireUid();
    const sb = getSupabase();
    const { data, error } = await sb
      .from("chapter_snapshot")
      .select("*")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseSnapshotRow);
  }

  async addChapterSnapshot(chapterId: string, content: string): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const { data: ascRows } = await sb
      .from("chapter_snapshot")
      .select("*")
      .eq("chapter_id", chapterId)
      .order("created_at", { ascending: true });
    const existing = ((ascRows as Json[]) ?? []).map(parseSnapshotRow);
    const last = existing[existing.length - 1];
    if (last && last.content === content) return;
    const id = crypto.randomUUID();
    const t = now();
    const snap: ChapterSnapshot = { id, chapterId, content, createdAt: t };
    const { error } = await sb.from("chapter_snapshot").insert(toSnapshotInsert(snap) as never);
    if (error) throw new Error(error.message);
    const cutoff = now() - SNAPSHOT_MAX_AGE_MS;
    for (const s of existing) {
      if (s.createdAt < cutoff) await sb.from("chapter_snapshot").delete().eq("id", s.id);
    }
    const fetchAsc = async () => {
      const { data } = await sb
        .from("chapter_snapshot")
        .select("*")
        .eq("chapter_id", chapterId)
        .order("created_at", { ascending: true });
      return ((data as Json[]) ?? []).map(parseSnapshotRow);
    };
    let ordered = await fetchAsc();
    while (ordered.length > SNAPSHOT_CAP_PER_CHAPTER) {
      await sb.from("chapter_snapshot").delete().eq("id", ordered[0]!.id);
      ordered = await fetchAsc();
    }
  }

  async deleteChapterSnapshot(snapshotId: string): Promise<void> {
    await requireUid();
    const { error } = await getSupabase().from("chapter_snapshot").delete().eq("id", snapshotId);
    if (error) throw new Error(error.message);
  }

  async listReferenceLibrary(): Promise<ReferenceLibraryEntry[]> {
    refOnly();
  }
  async getReferenceLibraryEntry(): Promise<undefined> {
    refOnly();
  }
  async createReferenceFromPlainText(): Promise<ReferenceLibraryEntry> {
    refOnly();
  }
  async updateReferenceLibraryEntry(): Promise<void> {
    refOnly();
  }
  async deleteReferenceLibraryEntry(): Promise<void> {
    refOnly();
  }
  async listReferenceChunks(): Promise<ReferenceChunk[]> {
    refOnly();
  }
  async listReferenceChapterHeads(): Promise<ReferenceChapterHead[]> {
    refOnly();
  }
  async syncChapterMetadataForRefWork(): Promise<void> {
    refOnly();
  }
  async getReferenceChunk(): Promise<undefined> {
    refOnly();
  }
  async searchReferenceLibrary(): Promise<ReferenceSearchHit[]> {
    refOnly();
  }
  async getReferenceChunkAt(): Promise<undefined> {
    refOnly();
  }
  async listReferenceTags(): Promise<ReferenceTag[]> {
    refOnly();
  }
  async createReferenceTag(): Promise<ReferenceTag> {
    refOnly();
  }
  async deleteReferenceTag(): Promise<void> {
    refOnly();
  }
  async listReferenceExcerpts(): Promise<ReferenceExcerpt[]> {
    refOnly();
  }
  async listReferenceExcerptsWithTagIds(): Promise<Array<ReferenceExcerpt & { tagIds: string[] }>> {
    refOnly();
  }
  async listAllReferenceExcerpts(): Promise<Array<ReferenceExcerpt & { refTitle: string; tagIds: string[] }>> {
    refOnly();
  }
  async addReferenceExcerpt(): Promise<ReferenceExcerpt> {
    refOnly();
  }
  async updateReferenceExcerpt(): Promise<void> {
    refOnly();
  }
  async setExcerptTags(): Promise<void> {
    refOnly();
  }
  async deleteReferenceExcerpt(): Promise<void> {
    refOnly();
  }
  async rebuildAllReferenceSearchIndex(): Promise<void> {
    refOnly();
  }
  async clearAllReferenceLibraryData(): Promise<void> {
    refOnly();
  }

  async listBibleCharacters(workId: string): Promise<BibleCharacter[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_character")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseBibleCharacterRow);
  }

  async addBibleCharacter(
    workId: string,
    input: Partial<Omit<BibleCharacter, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleCharacter> {
    const list = await this.listBibleCharacters(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleCharacter = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "未命名",
      motivation: input.motivation ?? "",
      relationships: input.relationships ?? "",
      voiceNotes: input.voiceNotes ?? "",
      taboos: input.taboos ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    const sb = getSupabase();
    const { error } = await sb.from("bible_character").insert({
      id: row.id,
      work_id: row.workId,
      name: row.name,
      motivation: row.motivation,
      relationships: row.relationships,
      voice_notes: row.voiceNotes,
      taboos: row.taboos,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleCharacter(id: string, patch: Partial<Omit<BibleCharacter, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.motivation !== undefined) row.motivation = patch.motivation;
    if (patch.relationships !== undefined) row.relationships = patch.relationships;
    if (patch.voiceNotes !== undefined) row.voice_notes = patch.voiceNotes;
    if (patch.taboos !== undefined) row.taboos = patch.taboos;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("bible_character").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleCharacter(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_character").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderBibleCharacters(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const sb = getSupabase();
    const t = now();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("bible_character")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async listBibleWorldEntries(workId: string): Promise<BibleWorldEntry[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_world_entry")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseBibleWorldRow);
  }

  async addBibleWorldEntry(
    workId: string,
    input: Partial<Omit<BibleWorldEntry, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleWorldEntry> {
    const list = await this.listBibleWorldEntries(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleWorldEntry = {
      id: crypto.randomUUID(),
      workId,
      entryKind: (input.entryKind ?? "条目").trim() || "条目",
      title: (input.title ?? "").trim() || "未命名",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("bible_world_entry").insert({
      id: row.id,
      work_id: row.workId,
      entry_kind: row.entryKind,
      title: row.title,
      body: row.body,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleWorldEntry(id: string, patch: Partial<Omit<BibleWorldEntry, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.entryKind !== undefined) row.entry_kind = patch.entryKind;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("bible_world_entry").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleWorldEntry(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_world_entry").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderBibleWorldEntries(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const sb = getSupabase();
    const t = now();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("bible_world_entry")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async listBibleForeshadowing(workId: string): Promise<BibleForeshadow[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_foreshadow")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseBibleForeRow);
  }

  async addBibleForeshadow(
    workId: string,
    input: Partial<Omit<BibleForeshadow, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleForeshadow> {
    const list = await this.listBibleForeshadowing(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleForeshadow = {
      id: crypto.randomUUID(),
      workId,
      title: (input.title ?? "").trim() || "未命名伏笔",
      plantedWhere: input.plantedWhere ?? "",
      plannedResolve: input.plannedResolve ?? "",
      status: input.status ?? "pending",
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("bible_foreshadow").insert({
      id: row.id,
      work_id: row.workId,
      title: row.title,
      planted_where: row.plantedWhere,
      planned_resolve: row.plannedResolve,
      status: row.status,
      note: row.note,
      chapter_id: row.chapterId,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleForeshadow(id: string, patch: Partial<Omit<BibleForeshadow, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.plantedWhere !== undefined) row.planted_where = patch.plantedWhere;
    if (patch.plannedResolve !== undefined) row.planned_resolve = patch.plannedResolve;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.chapterId !== undefined) row.chapter_id = patch.chapterId;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("bible_foreshadow").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleForeshadow(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_foreshadow").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderBibleForeshadowing(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const sb = getSupabase();
    const t = now();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("bible_foreshadow")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async listBibleTimelineEvents(workId: string): Promise<BibleTimelineEvent[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_timeline_event")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseBibleTimelineRow);
  }

  async addBibleTimelineEvent(
    workId: string,
    input: Partial<Omit<BibleTimelineEvent, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<BibleTimelineEvent> {
    const list = await this.listBibleTimelineEvents(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: BibleTimelineEvent = {
      id: crypto.randomUUID(),
      workId,
      label: (input.label ?? "").trim() || "事件",
      sortOrder: maxOrder + 1,
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("bible_timeline_event").insert({
      id: row.id,
      work_id: row.workId,
      label: row.label,
      sort_order: row.sortOrder,
      note: row.note,
      chapter_id: row.chapterId,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleTimelineEvent(
    id: string,
    patch: Partial<Omit<BibleTimelineEvent, "id" | "workId">>,
  ): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.chapterId !== undefined) row.chapter_id = patch.chapterId;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("bible_timeline_event").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleTimelineEvent(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_timeline_event").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderBibleTimelineEvents(_workId: string, orderedIds: string[]): Promise<void> {
    void _workId;
    const sb = getSupabase();
    const t = now();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("bible_timeline_event")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async listLogicPlaceNodes(workId: string): Promise<LogicPlaceNode[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("logic_place_node")
      .select("*")
      .eq("work_id", workId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseLogicPlaceNodeRow);
  }

  async addLogicPlaceNode(
    workId: string,
    input: Partial<Omit<LogicPlaceNode, "id" | "workId" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<LogicPlaceNode> {
    const t = now();
    const x = Number.isFinite(input.x as number) ? Number(input.x) : 50;
    const y = Number.isFinite(input.y as number) ? Number(input.y) : 50;
    const row: LogicPlaceNode = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "地点",
      note: input.note ?? "",
      x: Math.max(0, Math.min(100, Math.round(x))),
      y: Math.max(0, Math.min(100, Math.round(y))),
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("logic_place_node").insert(toLogicPlaceNodeInsert(row) as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateLogicPlaceNode(id: string, patch: Partial<Omit<LogicPlaceNode, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.name !== undefined) row.name = (patch.name ?? "").trim() || "地点";
    if (patch.note !== undefined) row.note = patch.note ?? "";
    if (patch.x !== undefined) row.x = Math.max(0, Math.min(100, Math.round(Number(patch.x))));
    if (patch.y !== undefined) row.y = Math.max(0, Math.min(100, Math.round(Number(patch.y))));
    const { error } = await getSupabase().from("logic_place_node").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteLogicPlaceNode(id: string): Promise<void> {
    const { error } = await getSupabase().from("logic_place_node").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listLogicPlaceEvents(workId: string): Promise<LogicPlaceEvent[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("logic_place_event")
      .select("*")
      .eq("work_id", workId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseLogicPlaceEventRow);
  }

  async addLogicPlaceEvent(
    workId: string,
    input: Partial<Omit<LogicPlaceEvent, "id" | "workId" | "createdAt" | "updatedAt">> & { placeId: string; label: string },
  ): Promise<LogicPlaceEvent> {
    const t = now();
    const row: LogicPlaceEvent = {
      id: crypto.randomUUID(),
      workId,
      placeId: input.placeId,
      label: (input.label ?? "").trim() || "事件",
      note: input.note ?? "",
      chapterId: input.chapterId ?? null,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("logic_place_event").insert(toLogicPlaceEventInsert(row) as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateLogicPlaceEvent(id: string, patch: Partial<Omit<LogicPlaceEvent, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.placeId !== undefined) row.place_id = patch.placeId;
    if (patch.label !== undefined) row.label = (patch.label ?? "").trim() || "事件";
    if (patch.note !== undefined) row.note = patch.note ?? "";
    if (patch.chapterId !== undefined) row.chapter_id = patch.chapterId;
    const { error } = await getSupabase().from("logic_place_event").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteLogicPlaceEvent(id: string): Promise<void> {
    const { error } = await getSupabase().from("logic_place_event").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listBibleChapterTemplates(workId: string): Promise<BibleChapterTemplate[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_chapter_template")
      .select("*")
      .eq("work_id", workId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseBibleTplRow);
  }

  async addBibleChapterTemplate(
    workId: string,
    input: Partial<Omit<BibleChapterTemplate, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleChapterTemplate> {
    const t = now();
    const row: BibleChapterTemplate = {
      id: crypto.randomUUID(),
      workId,
      name: (input.name ?? "").trim() || "未命名模板",
      goalText: input.goalText ?? "",
      forbidText: input.forbidText ?? "",
      povText: input.povText ?? "",
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("bible_chapter_template").insert({
      id: row.id,
      work_id: row.workId,
      name: row.name,
      goal_text: row.goalText,
      forbid_text: row.forbidText,
      pov_text: row.povText,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleChapterTemplate(
    id: string,
    patch: Partial<Omit<BibleChapterTemplate, "id" | "workId">>,
  ): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.goalText !== undefined) row.goal_text = patch.goalText;
    if (patch.forbidText !== undefined) row.forbid_text = patch.forbidText;
    if (patch.povText !== undefined) row.pov_text = patch.povText;
    const { error } = await getSupabase().from("bible_chapter_template").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleChapterTemplate(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_chapter_template").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async getChapterBible(chapterId: string): Promise<ChapterBible | undefined> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("chapter_bible")
      .select("*")
      .eq("chapter_id", chapterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    return parseChapterBibleRow(data as Json);
  }

  async upsertChapterBible(
    input: Omit<ChapterBible, "id" | "updatedAt"> & { id?: string },
  ): Promise<ChapterBible> {
    await requireUid();
    const sb = getSupabase();
    const existing = await this.getChapterBible(input.chapterId);
    const t = now();
    if (existing) {
      const { error } = await sb
        .from("chapter_bible")
        .update({
          goal_text: input.goalText,
          forbid_text: input.forbidText,
          pov_text: input.povText,
          scene_stance: input.sceneStance,
          character_state: input.characterStateText ?? "",
          updated_at: t,
        } as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return {
        ...existing,
        goalText: input.goalText,
        forbidText: input.forbidText,
        povText: input.povText,
        sceneStance: input.sceneStance,
        characterStateText: input.characterStateText ?? "",
        updatedAt: t,
      };
    }
    const row: ChapterBible = {
      id: crypto.randomUUID(),
      chapterId: input.chapterId,
      workId: input.workId,
      goalText: input.goalText ?? "",
      forbidText: input.forbidText ?? "",
      povText: input.povText ?? "",
      sceneStance: input.sceneStance ?? "",
      characterStateText: input.characterStateText ?? "",
      updatedAt: t,
    };
    const { error } = await sb.from("chapter_bible").insert({
      id: row.id,
      chapter_id: row.chapterId,
      work_id: row.workId,
      goal_text: row.goalText,
      forbid_text: row.forbidText,
      pov_text: row.povText,
      scene_stance: row.sceneStance,
      character_state: row.characterStateText,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async listBibleGlossaryTerms(workId: string): Promise<BibleGlossaryTerm[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("bible_glossary_term")
      .select("*")
      .eq("work_id", workId)
      .order("term", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseGlossaryRow);
  }

  async addBibleGlossaryTerm(
    workId: string,
    input: Partial<Omit<BibleGlossaryTerm, "id" | "workId" | "createdAt" | "updatedAt">>,
  ): Promise<BibleGlossaryTerm> {
    const t = now();
    const row: BibleGlossaryTerm = {
      id: crypto.randomUUID(),
      workId,
      term: (input.term ?? "").trim() || "术语",
      category: input.category ?? "term",
      note: input.note ?? "",
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("bible_glossary_term").insert({
      id: row.id,
      work_id: row.workId,
      term: row.term,
      category: row.category,
      note: row.note,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateBibleGlossaryTerm(id: string, patch: Partial<Omit<BibleGlossaryTerm, "id" | "workId">>): Promise<void> {
    const row: Json = { updated_at: now() };
    if (patch.term !== undefined) row.term = patch.term;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.note !== undefined) row.note = patch.note;
    const { error } = await getSupabase().from("bible_glossary_term").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteBibleGlossaryTerm(id: string): Promise<void> {
    const { error } = await getSupabase().from("bible_glossary_term").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listWritingPromptTemplates(workId: string): Promise<WritingPromptTemplate[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("writing_prompt_template")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseWritingPromptTemplateRow);
  }

  async addWritingPromptTemplate(
    workId: string,
    input: Partial<Omit<WritingPromptTemplate, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingPromptTemplate> {
    await requireUid();
    const list = await this.listWritingPromptTemplates(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: WritingPromptTemplate = {
      id: crypto.randomUUID(),
      workId,
      category: (input.category ?? "").trim(),
      title: (input.title ?? "").trim() || "未命名模板",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("writing_prompt_template").insert({
      id: row.id,
      work_id: row.workId,
      category: row.category,
      title: row.title,
      body: row.body,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateWritingPromptTemplate(
    id: string,
    patch: Partial<Omit<WritingPromptTemplate, "id" | "workId">>,
  ): Promise<void> {
    await requireUid();
    const row: Json = { updated_at: now() };
    if (patch.category !== undefined) row.category = patch.category.trim();
    if (patch.title !== undefined) row.title = patch.title.trim() || "未命名模板";
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("writing_prompt_template").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteWritingPromptTemplate(id: string): Promise<void> {
    const { error } = await getSupabase().from("writing_prompt_template").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderWritingPromptTemplates(workId: string, orderedIds: string[]): Promise<void> {
    void workId;
    await requireUid();
    const t = now();
    const sb = getSupabase();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("writing_prompt_template")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async listWritingStyleSamples(workId: string): Promise<WritingStyleSample[]> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("writing_style_sample")
      .select("*")
      .eq("work_id", workId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseWritingStyleSampleRow);
  }

  async addWritingStyleSample(
    workId: string,
    input: Partial<Omit<WritingStyleSample, "id" | "workId" | "sortOrder" | "createdAt" | "updatedAt">>,
  ): Promise<WritingStyleSample> {
    await requireUid();
    const list = await this.listWritingStyleSamples(workId);
    const maxOrder = list.length === 0 ? -1 : Math.max(...list.map((c) => c.sortOrder));
    const t = now();
    const row: WritingStyleSample = {
      id: crypto.randomUUID(),
      workId,
      title: (input.title ?? "").trim() || "未命名样本",
      body: input.body ?? "",
      sortOrder: maxOrder + 1,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("writing_style_sample").insert({
      id: row.id,
      work_id: row.workId,
      title: row.title,
      body: row.body,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateWritingStyleSample(
    id: string,
    patch: Partial<Omit<WritingStyleSample, "id" | "workId">>,
  ): Promise<void> {
    await requireUid();
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title.trim() || "未命名样本";
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase().from("writing_style_sample").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteWritingStyleSample(id: string): Promise<void> {
    const { error } = await getSupabase().from("writing_style_sample").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async reorderWritingStyleSamples(workId: string, orderedIds: string[]): Promise<void> {
    void workId;
    await requireUid();
    const t = now();
    const sb = getSupabase();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb
        .from("writing_style_sample")
        .update({ sort_order: i, updated_at: t } as never)
        .eq("id", orderedIds[i]);
      if (error) throw new Error(error.message);
    }
  }

  async getWorkStyleCard(workId: string): Promise<WorkStyleCard | undefined> {
    await requireUid();
    const { data, error } = await getSupabase()
      .from("work_style_card")
      .select("*")
      .eq("work_id", workId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return undefined;
    return parseStyleCardRow(data as Json);
  }

  async upsertWorkStyleCard(
    workId: string,
    patch: Partial<Omit<WorkStyleCard, "id" | "workId" | "updatedAt">>,
  ): Promise<WorkStyleCard> {
    await requireUid();
    const existing = await this.getWorkStyleCard(workId);
    const t = now();
    const next: WorkStyleCard = {
      id: workId,
      workId,
      pov: patch.pov ?? existing?.pov ?? "",
      tone: patch.tone ?? existing?.tone ?? "",
      bannedPhrases: patch.bannedPhrases ?? existing?.bannedPhrases ?? "",
      styleAnchor: patch.styleAnchor ?? existing?.styleAnchor ?? "",
      extraRules: patch.extraRules ?? existing?.extraRules ?? "",
      sentenceRhythm: patch.sentenceRhythm ?? existing?.sentenceRhythm,
      punctuationStyle: patch.punctuationStyle ?? existing?.punctuationStyle,
      dialogueDensity: patch.dialogueDensity ?? existing?.dialogueDensity,
      emotionStyle: patch.emotionStyle ?? existing?.emotionStyle,
      narrativeDistance: patch.narrativeDistance ?? existing?.narrativeDistance,
      updatedAt: t,
    };
    const { error } = await getSupabase()
      .from("work_style_card")
      .upsert(toStyleCardUpsert(next) as never, { onConflict: "work_id" });
    if (error) throw new Error(error.message);
    return next;
  }

  async listInspirationFragments(): Promise<InspirationFragment[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    const { data, error } = await getSupabase()
      .from("inspiration_fragment")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseInspirationFragmentRow);
  }

  async addInspirationFragment(
    input: Partial<Omit<InspirationFragment, "id" | "createdAt" | "updatedAt">> & { body: string },
  ): Promise<InspirationFragment> {
    const uid = await requireUid();
    const wid = input.workId ?? null;
    if (wid) {
      const w = await this.getWork(wid);
      if (!w) throw new Error("作品不存在或无权访问");
    }
    const t = now();
    const cid = input.collectionId ?? null;
    if (cid) {
      const { data: col, error: ce } = await getSupabase()
        .from("inspiration_collection")
        .select("id")
        .eq("id", cid)
        .eq("user_id", uid)
        .maybeSingle();
      if (ce) throw new Error(ce.message);
      if (!col) throw new Error("集合不存在");
    }
    const row: InspirationFragment = {
      id: crypto.randomUUID(),
      workId: wid,
      collectionId: cid,
      title: input.title?.trim() || undefined,
      sourceName: input.sourceName?.trim() || undefined,
      sourceUrl: input.sourceUrl?.trim() || undefined,
      urlTitle: input.urlTitle?.trim() || undefined,
      urlSite: input.urlSite?.trim() || undefined,
      urlDescription: input.urlDescription?.trim() || undefined,
      urlFetchedAt: typeof input.urlFetchedAt === "number" ? input.urlFetchedAt : undefined,
      links: Array.isArray(input.links) ? input.links : [],
      body: input.body.trim() || "（空碎片）",
      tags: normalizeWorkTagList(input.tags) ?? [],
      isFavorite: input.isFavorite ?? false,
      isPrivate: input.isPrivate ?? false,
      archived: input.archived ?? false,
      createdAt: t,
      updatedAt: t,
    };
    const fullPayload: Json = {
      id: row.id,
      user_id: uid,
      work_id: row.workId,
      collection_id: row.collectionId,
      title: row.title ?? null,
      source_name: row.sourceName ?? null,
      source_url: row.sourceUrl ?? null,
      url_title: row.urlTitle ?? null,
      url_site: row.urlSite ?? null,
      url_description: row.urlDescription ?? null,
      url_fetched_at: row.urlFetchedAt ?? null,
      links: row.links ?? [],
      body: row.body,
      tags: row.tags,
      is_favorite: !!row.isFavorite,
      is_private: !!row.isPrivate,
      archived: !!row.archived,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
    const { error } = await getSupabase().from("inspiration_fragment").insert(fullPayload as never);
    if (error) {
      // 兼容：远端表还没迁移到最新 schema（schema cache 缺列）
      const m = /Could not find the '([^']+)' column/i.exec(error.message);
      if (m) {
        const minimal: Json = {
          id: row.id,
          user_id: uid,
          work_id: row.workId,
          collection_id: row.collectionId,
          body: row.body,
          tags: row.tags,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        };
        const { error: e2 } = await getSupabase().from("inspiration_fragment").insert(minimal as never);
        if (e2) throw new Error(e2.message);
      } else {
        throw new Error(error.message);
      }
    }
    return row;
  }

  async updateInspirationFragment(
    id: string,
    patch: Partial<
      Pick<
        InspirationFragment,
        | "body"
        | "tags"
        | "workId"
        | "collectionId"
        | "title"
        | "sourceName"
        | "sourceUrl"
        | "urlTitle"
        | "urlSite"
        | "urlDescription"
        | "urlFetchedAt"
        | "links"
        | "isFavorite"
        | "isPrivate"
        | "archived"
      >
    >,
  ): Promise<void> {
    const uid = await requireUid();
    if (patch.workId !== undefined && patch.workId !== null) {
      const w = await this.getWork(patch.workId);
      if (!w) throw new Error("作品不存在或无权访问");
    }
    if (patch.collectionId !== undefined && patch.collectionId !== null) {
      const { data: col, error: ce } = await getSupabase()
        .from("inspiration_collection")
        .select("id")
        .eq("id", patch.collectionId)
        .eq("user_id", uid)
        .maybeSingle();
      if (ce) throw new Error(ce.message);
      if (!col) throw new Error("集合不存在");
    }
    const row: Json = { updated_at: now() };
    if (patch.body !== undefined) row.body = patch.body.trim() || "（空碎片）";
    if (patch.tags !== undefined) row.tags = normalizeWorkTagList(patch.tags) ?? [];
    if (patch.workId !== undefined) row.work_id = patch.workId;
    if (patch.collectionId !== undefined) row.collection_id = patch.collectionId;
    if (patch.title !== undefined) row.title = patch.title?.trim() || null;
    if (patch.sourceName !== undefined) row.source_name = patch.sourceName?.trim() || null;
    if (patch.sourceUrl !== undefined) row.source_url = patch.sourceUrl?.trim() || null;
    if (patch.urlTitle !== undefined) row.url_title = patch.urlTitle?.trim() || null;
    if (patch.urlSite !== undefined) row.url_site = patch.urlSite?.trim() || null;
    if (patch.urlDescription !== undefined) row.url_description = patch.urlDescription?.trim() || null;
    if (patch.urlFetchedAt !== undefined) row.url_fetched_at = patch.urlFetchedAt ?? null;
    if (patch.links !== undefined) row.links = Array.isArray(patch.links) ? patch.links : [];
    if (patch.isFavorite !== undefined) row.is_favorite = !!patch.isFavorite;
    if (patch.isPrivate !== undefined) row.is_private = !!patch.isPrivate;
    if (patch.archived !== undefined) row.archived = !!patch.archived;
    const doUpdate = async (payload: Json) =>
      getSupabase()
        .from("inspiration_fragment")
        .update(payload as never)
        .eq("id", id)
        .eq("user_id", uid)
        .select("id");
    let { error, data } = await doUpdate(row);
    if (error) {
      // 兼容：远端表未迁移，忽略缺失列并重试一次（让本地不被远端 schema 卡死）
      const m = /Could not find the '([^']+)' column/i.exec(error.message);
      if (m) {
        const bad = m[1];
        const retry = { ...row } as Record<string, unknown>;
        delete retry[bad];
        ({ error, data } = await doUpdate(retry as Json));
      }
    }
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("碎片不存在或无权修改");
  }

  async deleteInspirationFragment(id: string): Promise<void> {
    const uid = await requireUid();
    const { error, data } = await getSupabase()
      .from("inspiration_fragment")
      .delete()
      .eq("id", id)
      .eq("user_id", uid)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("碎片不存在或无权删除");
  }

  async listInspirationCollections(): Promise<InspirationCollection[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    const { data, error } = await getSupabase()
      .from("inspiration_collection")
      .select("*")
      .eq("user_id", uid)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseInspirationCollectionRow);
  }

  async addInspirationCollection(
    input: Partial<Omit<InspirationCollection, "id" | "createdAt" | "updatedAt">> & { name: string },
  ): Promise<InspirationCollection> {
    const uid = await requireUid();
    const t = now();
    const { data: last } = await getSupabase()
      .from("inspiration_collection")
      .select("sort_order")
      .eq("user_id", uid)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSo = last?.sort_order;
    const sortOrder = lastSo != null ? Number(lastSo) + 1 : 0;
    const row: InspirationCollection = {
      id: crypto.randomUUID(),
      name: (input.name ?? "").trim() || "未命名集合",
      sortOrder: input.sortOrder ?? sortOrder,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await getSupabase().from("inspiration_collection").insert({
      id: row.id,
      user_id: uid,
      name: row.name,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateInspirationCollection(
    id: string,
    patch: Partial<Pick<InspirationCollection, "name" | "sortOrder">>,
  ): Promise<void> {
    const uid = await requireUid();
    const row: Json = { updated_at: now() };
    if (patch.name !== undefined) row.name = (patch.name ?? "").trim() || "未命名集合";
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error, data } = await getSupabase()
      .from("inspiration_collection")
      .update(row as never)
      .eq("id", id)
      .eq("user_id", uid)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("集合不存在或无权修改");
  }

  async deleteInspirationCollection(id: string): Promise<void> {
    const uid = await requireUid();
    const { error, data } = await getSupabase()
      .from("inspiration_collection")
      .delete()
      .eq("id", id)
      .eq("user_id", uid)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("集合不存在或无权删除");
  }

  // ── 全局提示词库（Sprint 1）─────────────────────────────────────────────────

  async listGlobalPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    const { data, error } = await getSupabase()
      .from("prompt_template")
      .select("*")
      .eq("user_id", uid)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseGlobalPromptTemplateRow);
  }

  async addGlobalPromptTemplate(
    input: Omit<GlobalPromptTemplate, "id" | "sortOrder" | "createdAt" | "updatedAt">,
  ): Promise<GlobalPromptTemplate> {
    const uid = await requireUid();
    const sb = getSupabase();
    const t = now();
    const { data: last } = await sb
      .from("prompt_template")
      .select("sort_order")
      .eq("user_id", uid)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = last?.sort_order != null ? Number(last.sort_order) + 1 : 0;
    const row: GlobalPromptTemplate = {
      id: crypto.randomUUID(),
      title: (input.title ?? "").trim() || "未命名模板",
      type: input.type,
      tags: input.tags ?? [],
      body: input.body ?? "",
      status: input.status ?? "approved",
      sortOrder,
      createdAt: t,
      updatedAt: t,
    };
    const { error } = await sb.from("prompt_template").insert({
      id: row.id,
      user_id: uid,
      title: row.title,
      type: row.type,
      tags: row.tags,
      body: row.body,
      status: row.status,
      sort_order: row.sortOrder,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      slots: input.slots ?? null,
      source_kind: input.source_kind ?? null,
      source_ref_work_id: input.source_ref_work_id ?? null,
      source_excerpt_ids: input.source_excerpt_ids ?? null,
      source_note: input.source_note ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return row;
  }

  async updateGlobalPromptTemplate(
    id: string,
    patch: Partial<Omit<GlobalPromptTemplate, "id" | "createdAt">>,
  ): Promise<void> {
    const uid = await requireUid();
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = (patch.title ?? "").trim() || "未命名模板";
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.tags !== undefined) row.tags = patch.tags;
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.reviewNote !== undefined) row.review_note = patch.reviewNote ?? null;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    const { error } = await getSupabase()
      .from("prompt_template")
      .update(row as never)
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw new Error(error.message);
  }

  async deleteGlobalPromptTemplate(id: string): Promise<void> {
    const uid = await requireUid();
    const { error } = await getSupabase()
      .from("prompt_template")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw new Error(error.message);
  }

  async reorderGlobalPromptTemplates(orderedIds: string[]): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const t = now();
    await Promise.all(
      orderedIds.map((id, i) =>
        sb
          .from("prompt_template")
          .update({ sort_order: i, updated_at: t } as never)
          .eq("id", id)
          .eq("user_id", uid),
      ),
    );
  }

  async listApprovedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    // RLS 保证只有 approved 行对所有登录用户可见（含他人）
    // 此处不加 user_id 过滤，让 RLS 决定可见范围
    const { data, error } = await getSupabase()
      .from("prompt_template")
      .select("*")
      .eq("status", "approved")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseGlobalPromptTemplateRow);
  }

  async listSubmittedPromptTemplates(): Promise<GlobalPromptTemplate[]> {
    const uid = await maybeUid();
    if (!uid) return [];
    // ⚠️  需要在 Supabase Dashboard → Authentication → Policies → prompt_template 添加策略：
    //   允许管理员账号读取所有 submitted 行，例如：
    //   CREATE POLICY "admin read submitted"
    //     ON prompt_template FOR SELECT
    //     USING (status = 'submitted' AND auth.email() = 'your-admin@email.com');
    // 未配置此策略时，RLS 仅返回自己的 submitted 行（退化为本地效果）。
    const { data, error } = await getSupabase()
      .from("prompt_template")
      .select("*")
      .eq("status", "submitted")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseGlobalPromptTemplateRow);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async exportAllData(): ReturnType<WritingStore["exportAllData"]> {
    const uid = await maybeUid();
    const emptyRef = {
      referenceLibrary: [] as ReferenceLibraryEntry[],
      referenceChunks: [] as ReferenceChunk[],
      referenceTokenPostings: [] as ReferenceTokenPosting[],
      referenceExcerpts: [] as ReferenceExcerpt[],
      referenceTags: [] as ReferenceTag[],
      referenceExcerptTags: [] as ReferenceExcerptTag[],
      referenceChapterHeads: [] as ReferenceChapterHead[],
    };
    if (!uid) {
      return {
        works: [],
        volumes: [],
        chapters: [],
        chapterSnapshots: [],
        bibleCharacters: [],
        bibleWorldEntries: [],
        bibleForeshadowing: [],
        bibleTimelineEvents: [],
        logicPlaceNodes: [],
        logicPlaceEvents: [],
        bibleChapterTemplates: [],
        chapterBible: [],
        bibleGlossaryTerms: [],
        workStyleCards: [],
        inspirationCollections: [],
        inspirationFragments: [],
        writingPromptTemplates: [],
        writingStyleSamples: [],
        ...emptyRef,
      };
    }
    const sb = getSupabase();
    const [{ data: collRows, error: ec }, { data: fragRows, error: ef }] = await Promise.all([
      sb.from("inspiration_collection").select("*").eq("user_id", uid).order("sort_order", { ascending: true }),
      sb.from("inspiration_fragment").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    if (ec) throw new Error(ec.message);
    if (ef) throw new Error(ef.message);
    const inspirationCollections = (collRows as Json[]).map(parseInspirationCollectionRow);
    const inspirationFragments = (fragRows as Json[]).map(parseInspirationFragmentRow);
    const { data: workRows, error: ew } = await sb
      .from("work")
      .select("*")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (ew) throw new Error(ew.message);
    const works = (workRows as Json[]).map(parseWorkRow);
    const workIds = works.map((w) => w.id);
    if (workIds.length === 0) {
      return {
        works: [],
        volumes: [],
        chapters: [],
        chapterSnapshots: [],
        bibleCharacters: [],
        bibleWorldEntries: [],
        bibleForeshadowing: [],
        bibleTimelineEvents: [],
        logicPlaceNodes: [],
        logicPlaceEvents: [],
        bibleChapterTemplates: [],
        chapterBible: [],
        bibleGlossaryTerms: [],
        workStyleCards: [],
        inspirationCollections,
        inspirationFragments,
        writingPromptTemplates: [],
        writingStyleSamples: [],
        ...emptyRef,
      };
    }
    const [
      { data: vols },
      { data: chs },
      { data: chars },
      { data: worlds },
      { data: fores },
      { data: times },
      { data: placeNodes },
      { data: placeEvents },
      { data: tpls },
      { data: cb },
      { data: gloss },
      { data: cards },
      { data: promptTpl },
      { data: styleSamples },
    ] = await Promise.all([
      sb.from("volume").select("*").in("work_id", workIds),
      sb.from("chapter").select("*").in("work_id", workIds),
      sb.from("bible_character").select("*").in("work_id", workIds),
      sb.from("bible_world_entry").select("*").in("work_id", workIds),
      sb.from("bible_foreshadow").select("*").in("work_id", workIds),
      sb.from("bible_timeline_event").select("*").in("work_id", workIds),
      sb.from("logic_place_node").select("*").in("work_id", workIds),
      sb.from("logic_place_event").select("*").in("work_id", workIds),
      sb.from("bible_chapter_template").select("*").in("work_id", workIds),
      sb.from("chapter_bible").select("*").in("work_id", workIds),
      sb.from("bible_glossary_term").select("*").in("work_id", workIds),
      sb.from("work_style_card").select("*").in("work_id", workIds),
      sb.from("writing_prompt_template").select("*").in("work_id", workIds),
      sb.from("writing_style_sample").select("*").in("work_id", workIds),
    ]);
    const chapters = (chs as Json[]).map(parseChapterRow);
    const chapterIds = chapters.map((c) => c.id);
    const { data: snaps } =
      chapterIds.length > 0
        ? await sb.from("chapter_snapshot").select("*").in("chapter_id", chapterIds)
        : { data: [] };
    return {
      works,
      volumes: (vols as Json[]).map(parseVolumeRow),
      chapters,
      chapterSnapshots: (snaps as Json[]).map(parseSnapshotRow),
      ...emptyRef,
      bibleCharacters: (chars as Json[]).map(parseBibleCharacterRow),
      bibleWorldEntries: (worlds as Json[]).map(parseBibleWorldRow),
      bibleForeshadowing: (fores as Json[]).map(parseBibleForeRow),
      bibleTimelineEvents: (times as Json[]).map(parseBibleTimelineRow),
      logicPlaceNodes: (placeNodes as Json[]).map(parseLogicPlaceNodeRow),
      logicPlaceEvents: (placeEvents as Json[]).map(parseLogicPlaceEventRow),
      bibleChapterTemplates: (tpls as Json[]).map(parseBibleTplRow),
      chapterBible: (cb as Json[]).map(parseChapterBibleRow),
      bibleGlossaryTerms: (gloss as Json[]).map(parseGlossaryRow),
      workStyleCards: (cards as Json[]).map(parseStyleCardRow),
      inspirationCollections,
      inspirationFragments,
      writingPromptTemplates: (promptTpl as Json[]).map(parseWritingPromptTemplateRow),
      writingStyleSamples: (styleSamples as Json[]).map(parseWritingStyleSampleRow),
    };
  }

  async importAllData(data: Parameters<WritingStore["importAllData"]>[0]): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const { error: delFrag } = await sb.from("inspiration_fragment").delete().eq("user_id", uid);
    if (delFrag) throw new Error(delFrag.message);
    const { error: delColl } = await sb.from("inspiration_collection").delete().eq("user_id", uid);
    if (delColl) throw new Error(delColl.message);
    const { error: delErr } = await sb.from("work").delete().eq("user_id", uid);
    if (delErr) throw new Error(delErr.message);
    const normalized = normalizeImportRows(data);
    const rows = mergeWritingRowsToInserts(uid, {
      newWorks: normalized.works,
      newVolumes: normalized.volumes,
      newChapters: normalized.chapters,
      newSnaps: normalized.chapterSnapshots,
      newBibleChars: data.bibleCharacters ?? [],
      newBibleWorld: data.bibleWorldEntries ?? [],
      newBibleFore: data.bibleForeshadowing ?? [],
      newBibleTime: data.bibleTimelineEvents ?? [],
      newBibleTpl: data.bibleChapterTemplates ?? [],
      newChapterBible: data.chapterBible ?? [],
      newBibleGloss: data.bibleGlossaryTerms ?? [],
      newStyleCards: (data.workStyleCards ?? []).map((s) => ({
        ...s,
        id: s.workId || s.id,
        workId: s.workId || s.id,
        updatedAt: s.updatedAt ?? now(),
        pov: s.pov ?? "",
        tone: s.tone ?? "",
        bannedPhrases: s.bannedPhrases ?? "",
        styleAnchor: s.styleAnchor ?? "",
        extraRules: s.extraRules ?? "",
      })),
      newInspirationCollections: (data.inspirationCollections ?? []).map((c) => ({
        ...c,
        name: (c.name ?? "").trim() || "未命名集合",
        sortOrder: c.sortOrder ?? 0,
        createdAt: c.createdAt ?? now(),
        updatedAt: c.updatedAt ?? now(),
      })),
      newInspirationFragments: (data.inspirationFragments ?? []).map((f) => ({
        ...f,
        workId: f.workId ?? null,
        collectionId: f.collectionId ?? null,
        tags: normalizeWorkTagList(f.tags) ?? [],
        body: (f.body ?? "").trim() || "（空碎片）",
        createdAt: f.createdAt ?? now(),
        updatedAt: f.updatedAt ?? now(),
      })),
      newWritingPromptTemplates: (data.writingPromptTemplates ?? []).map((p) => ({
        ...p,
        category: (p.category ?? "").trim(),
        title: (p.title ?? "").trim() || "未命名模板",
        body: p.body ?? "",
        sortOrder: p.sortOrder ?? 0,
        createdAt: p.createdAt ?? now(),
        updatedAt: p.updatedAt ?? now(),
      })),
      newWritingStyleSamples: (data.writingStyleSamples ?? []).map((s) => ({
        ...s,
        title: (s.title ?? "").trim() || "未命名样本",
        body: s.body ?? "",
        sortOrder: s.sortOrder ?? 0,
        createdAt: s.createdAt ?? now(),
        updatedAt: s.updatedAt ?? now(),
      })),
      newLogicPlaceNodes: (data.logicPlaceNodes ?? []).map((p) => ({
        ...p,
        name: (p.name ?? "").trim() || "地点",
        note: p.note ?? "",
        x: Number.isFinite(p.x) ? Math.max(0, Math.min(100, Math.round(p.x))) : 50,
        y: Number.isFinite(p.y) ? Math.max(0, Math.min(100, Math.round(p.y))) : 50,
        createdAt: p.createdAt ?? now(),
        updatedAt: p.updatedAt ?? now(),
      })),
      newLogicPlaceEvents: (data.logicPlaceEvents ?? []).map((ev) => ({
        ...ev,
        label: (ev.label ?? "").trim() || "事件",
        note: ev.note ?? "",
        chapterId: ev.chapterId ?? null,
        createdAt: ev.createdAt ?? now(),
        updatedAt: ev.updatedAt ?? now(),
      })),
      newRefLib: [],
      newRefChunks: [],
      newRefChapterHeads: [],
      newExcerpts: [],
      newTags: [],
      newExcerptTags: [],
    } as unknown as import("./backup-merge-remap").MergeRemapResult);
    await chunkedInsert("work", rows.works);
    await chunkedInsert("volume", rows.volumes);
    await chunkedInsert("chapter", rows.chapters);
    await chunkedInsert("chapter_snapshot", rows.snaps);
    await chunkedInsert("bible_character", rows.bibleChars);
    await chunkedInsert("bible_world_entry", rows.bibleWorld);
    await chunkedInsert("bible_foreshadow", rows.bibleFore);
    await chunkedInsert("bible_timeline_event", rows.bibleTime);
    await chunkedInsert("bible_chapter_template", rows.bibleTpl);
    await chunkedInsert("chapter_bible", rows.chapterBible);
    await chunkedInsert("bible_glossary_term", rows.bibleGloss);
    await chunkedInsert("work_style_card", rows.styleCards);
    await chunkedInsert("inspiration_collection", rows.inspirationCollections);
    await chunkedInsert("inspiration_fragment", rows.inspirationFrags);
    await chunkedInsert("writing_prompt_template", rows.writingPromptTpl);
    await chunkedInsert("writing_style_sample", rows.writingStyleSamples);
    await chunkedInsert("logic_place_node", rows.logicPlaceNodes);
    await chunkedInsert("logic_place_event", rows.logicPlaceEvents);
  }

  async importAllDataMerge(data: Parameters<WritingStore["importAllDataMerge"]>[0]): Promise<void> {
    const m = remapImportMergePayload(data, now);
    await this.applyRemappedMergeWritingOnly(m);
  }
}
