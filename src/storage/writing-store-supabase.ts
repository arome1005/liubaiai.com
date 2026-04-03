import { getSupabase } from "../lib/supabase";
import type {
  BibleCharacter,
  BibleChapterTemplate,
  BibleForeshadow,
  BibleGlossaryTerm,
  BibleTimelineEvent,
  BibleWorldEntry,
  BookSearchHit,
  BookSearchScope,
  Chapter,
  ChapterBible,
  ChapterSnapshot,
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
} from "../db/types";
import { SNAPSHOT_CAP_PER_CHAPTER, SNAPSHOT_MAX_AGE_MS } from "../db/types";
import { wordCount } from "../util/wordCount";
import type { WritingStore } from "./writing-store";
import { remapImportMergePayload, type MergeRemapResult } from "./backup-merge-remap";
import { normalizeImportRows } from "./import-normalize";
import {
  mergeWritingRowsToInserts,
  parseBibleCharacterRow,
  parseBibleForeRow,
  parseBibleTplRow,
  parseBibleTimelineRow,
  parseBibleWorldRow,
  parseChapterBibleRow,
  parseChapterRow,
  parseGlossaryRow,
  parseSnapshotRow,
  parseStyleCardRow,
  parseVolumeRow,
  parseWorkRow,
  toChapterInsert,
  toSnapshotInsert,
  toStyleCardUpsert,
  toVolumeInsert,
  toWorkInsert,
} from "./supabase-writing-rows";

type Json = Record<string, unknown>;

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
 * 写作 / 圣经 / 风格卡存 Supabase；不包含参考库表。
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

  async createWork(title: string): Promise<Work> {
    const uid = await requireUid();
    const sb = getSupabase();
    const id = crypto.randomUUID();
    const t = now();
    const work: Work = {
      id,
      title: title.trim() || "未命名作品",
      createdAt: t,
      updatedAt: t,
      progressCursor: null,
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
    };
    const { error: e2 } = await sb.from("volume").insert(toVolumeInsert(vol) as never);
    if (e2) throw new Error(e2.message);
    return work;
  }

  async updateWork(id: string, patch: Partial<Pick<Work, "title" | "progressCursor">>): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.progressCursor !== undefined) row.progress_cursor = patch.progressCursor;
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
    };
    const { error: e1 } = await sb.from("volume").insert(toVolumeInsert(vol) as never);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await sb.from("work").update({ updated_at: t } as never).eq("id", workId);
    if (e2) throw new Error(e2.message);
    return vol;
  }

  async updateVolume(id: string, patch: Partial<Pick<Volume, "title" | "order">>): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const row: Json = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.order !== undefined) row.order = patch.order;
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
      .select("*")
      .eq("work_id", workId)
      .order("order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data as Json[]).map(parseChapterRow);
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
      title: title?.trim() || `第 ${existing.length + 1} 章`,
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
    patch: Partial<Pick<Chapter, "title" | "content" | "volumeId" | "summary">>,
  ): Promise<void> {
    await requireUid();
    const sb = getSupabase();
    const row: Json = { updated_at: now() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.volumeId !== undefined) row.volume_id = patch.volumeId;
    if (patch.summary !== undefined) row.summary = patch.summary === "" ? null : patch.summary;
    if (patch.content !== undefined) {
      row.content = patch.content;
      row.word_count_cache = wordCount(patch.content);
    }
    const { error } = await sb.from("chapter").update(row as never).eq("id", id);
    if (error) throw new Error(error.message);
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

  async searchWork(workId: string, query: string, scope?: BookSearchScope): Promise<BookSearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const work = await this.getWork(workId);
    let chapters = await this.listChapters(workId);
    if (scope === "beforeProgress" && work?.progressCursor) {
      const cur = chapters.find((c) => c.id === work.progressCursor);
      const curOrder = cur?.order ?? Infinity;
      chapters = chapters.filter((c) => c.order < curOrder);
    }
    const hits: BookSearchHit[] = [];
    for (const ch of chapters) {
      let count = 0;
      let pos = 0;
      while (true) {
        const i = ch.content.indexOf(q, pos);
        if (i < 0) break;
        count++;
        pos = i + q.length;
      }
      if (count === 0) continue;
      const first = ch.content.indexOf(q);
      const start = Math.max(0, first - 40);
      const preview = ch.content.slice(start, start + 120).replace(/\s+/g, " ").trim();
      hits.push({
        chapterId: ch.id,
        chapterTitle: ch.title,
        matchCount: count,
        preview: preview.length ? `…${preview}…` : "…",
      });
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
      updatedAt: t,
    };
    const { error } = await getSupabase()
      .from("work_style_card")
      .upsert(toStyleCardUpsert(next) as never, { onConflict: "work_id" });
    if (error) throw new Error(error.message);
    return next;
  }

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
        bibleChapterTemplates: [],
        chapterBible: [],
        bibleGlossaryTerms: [],
        workStyleCards: [],
        ...emptyRef,
      };
    }
    const sb = getSupabase();
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
        bibleChapterTemplates: [],
        chapterBible: [],
        bibleGlossaryTerms: [],
        workStyleCards: [],
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
      { data: tpls },
      { data: cb },
      { data: gloss },
      { data: cards },
    ] = await Promise.all([
      sb.from("volume").select("*").in("work_id", workIds),
      sb.from("chapter").select("*").in("work_id", workIds),
      sb.from("bible_character").select("*").in("work_id", workIds),
      sb.from("bible_world_entry").select("*").in("work_id", workIds),
      sb.from("bible_foreshadow").select("*").in("work_id", workIds),
      sb.from("bible_timeline_event").select("*").in("work_id", workIds),
      sb.from("bible_chapter_template").select("*").in("work_id", workIds),
      sb.from("chapter_bible").select("*").in("work_id", workIds),
      sb.from("bible_glossary_term").select("*").in("work_id", workIds),
      sb.from("work_style_card").select("*").in("work_id", workIds),
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
      bibleChapterTemplates: (tpls as Json[]).map(parseBibleTplRow),
      chapterBible: (cb as Json[]).map(parseChapterBibleRow),
      bibleGlossaryTerms: (gloss as Json[]).map(parseGlossaryRow),
      workStyleCards: (cards as Json[]).map(parseStyleCardRow),
    };
  }

  async importAllData(data: Parameters<WritingStore["importAllData"]>[0]): Promise<void> {
    const uid = await requireUid();
    const sb = getSupabase();
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
      newRefLib: [],
      newRefChunks: [],
      newRefChapterHeads: [],
      newExcerpts: [],
      newTags: [],
      newExcerptTags: [],
    });
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
  }

  async importAllDataMerge(data: Parameters<WritingStore["importAllDataMerge"]>[0]): Promise<void> {
    const m = remapImportMergePayload(data, now);
    await this.applyRemappedMergeWritingOnly(m);
  }
}
