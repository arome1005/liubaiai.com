import JSZip from "jszip";
import { exportAllData, importAllData, importAllDataMerge } from "../db/repo";
import { SCHEMA_VERSION } from "../db/types";

const MANIFEST = "manifest.json";
const DATA = "data.json";

export async function buildBackupZip(): Promise<Blob> {
  const {
    works,
    volumes,
    chapters,
    chapterSnapshots,
    referenceLibrary,
    referenceChunks,
    referenceTokenPostings,
    referenceExcerpts,
    referenceTags,
    referenceExcerptTags,
    referenceChapterHeads,
    bibleCharacters,
    bibleWorldEntries,
    bibleForeshadowing,
    bibleTimelineEvents,
    bibleChapterTemplates,
    chapterBible,
    bibleGlossaryTerms,
    workStyleCards,
    inspirationFragments,
    writingPromptTemplates,
    writingStyleSamples,
  } = await exportAllData();
  const zip = new JSZip();
  zip.file(
    MANIFEST,
    JSON.stringify(
      {
        app: "liubai-writing",
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  zip.file(
    DATA,
    JSON.stringify(
      {
        works,
        volumes,
        chapters,
        chapterSnapshots,
        referenceLibrary,
        referenceChunks,
        referenceTokenPostings,
        referenceExcerpts,
        referenceTags,
        referenceExcerptTags,
        referenceChapterHeads,
        bibleCharacters,
        bibleWorldEntries,
        bibleForeshadowing,
        bibleTimelineEvents,
        bibleChapterTemplates,
        chapterBible,
        bibleGlossaryTerms,
        workStyleCards,
        inspirationFragments,
        writingPromptTemplates,
        writingStyleSamples,
      },
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: "blob" });
}

export async function parseBackupZip(file: File, mode: "replace" | "merge" = "replace"): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file(DATA);
  if (!dataFile) throw new Error("备份中缺少 data.json");
  const text = await dataFile.async("string");
  const parsed = JSON.parse(text) as {
    works: unknown[];
    chapters: unknown[];
    volumes?: unknown[];
    chapterSnapshots?: unknown[];
    referenceLibrary?: unknown[];
    referenceChunks?: unknown[];
    referenceTokenPostings?: unknown[];
    referenceExcerpts?: unknown[];
    referenceTags?: unknown[];
    referenceExcerptTags?: unknown[];
    referenceChapterHeads?: unknown[];
    bibleCharacters?: unknown[];
    bibleWorldEntries?: unknown[];
    bibleForeshadowing?: unknown[];
    bibleTimelineEvents?: unknown[];
    bibleChapterTemplates?: unknown[];
    chapterBible?: unknown[];
    bibleGlossaryTerms?: unknown[];
    workStyleCards?: unknown[];
    inspirationFragments?: unknown[];
    writingPromptTemplates?: unknown[];
    writingStyleSamples?: unknown[];
  };
  if (!Array.isArray(parsed.works) || !Array.isArray(parsed.chapters)) {
    throw new Error("data.json 格式无效");
  }
  const payload = {
    works: parsed.works as import("../db/types").Work[],
    chapters: parsed.chapters as import("../db/types").Chapter[],
    volumes: Array.isArray(parsed.volumes) ? (parsed.volumes as import("../db/types").Volume[]) : undefined,
    chapterSnapshots: Array.isArray(parsed.chapterSnapshots)
      ? (parsed.chapterSnapshots as import("../db/types").ChapterSnapshot[])
      : [],
    referenceLibrary: Array.isArray(parsed.referenceLibrary)
      ? (parsed.referenceLibrary as import("../db/types").ReferenceLibraryEntry[])
      : [],
    referenceChunks: Array.isArray(parsed.referenceChunks)
      ? (parsed.referenceChunks as import("../db/types").ReferenceChunk[])
      : [],
    referenceTokenPostings: Array.isArray(parsed.referenceTokenPostings)
      ? (parsed.referenceTokenPostings as import("../db/types").ReferenceTokenPosting[])
      : [],
    referenceExcerpts: Array.isArray(parsed.referenceExcerpts)
      ? (parsed.referenceExcerpts as import("../db/types").ReferenceExcerpt[])
      : [],
    referenceTags: Array.isArray(parsed.referenceTags)
      ? (parsed.referenceTags as import("../db/types").ReferenceTag[])
      : [],
    referenceExcerptTags: Array.isArray(parsed.referenceExcerptTags)
      ? (parsed.referenceExcerptTags as import("../db/types").ReferenceExcerptTag[])
      : [],
    referenceChapterHeads: Array.isArray(parsed.referenceChapterHeads)
      ? (parsed.referenceChapterHeads as import("../db/types").ReferenceChapterHead[])
      : [],
    bibleCharacters: Array.isArray(parsed.bibleCharacters)
      ? (parsed.bibleCharacters as import("../db/types").BibleCharacter[])
      : [],
    bibleWorldEntries: Array.isArray(parsed.bibleWorldEntries)
      ? (parsed.bibleWorldEntries as import("../db/types").BibleWorldEntry[])
      : [],
    bibleForeshadowing: Array.isArray(parsed.bibleForeshadowing)
      ? (parsed.bibleForeshadowing as import("../db/types").BibleForeshadow[])
      : [],
    bibleTimelineEvents: Array.isArray(parsed.bibleTimelineEvents)
      ? (parsed.bibleTimelineEvents as import("../db/types").BibleTimelineEvent[])
      : [],
    bibleChapterTemplates: Array.isArray(parsed.bibleChapterTemplates)
      ? (parsed.bibleChapterTemplates as import("../db/types").BibleChapterTemplate[])
      : [],
    chapterBible: Array.isArray(parsed.chapterBible)
      ? (parsed.chapterBible as import("../db/types").ChapterBible[])
      : [],
    bibleGlossaryTerms: Array.isArray(parsed.bibleGlossaryTerms)
      ? (parsed.bibleGlossaryTerms as import("../db/types").BibleGlossaryTerm[])
      : [],
    workStyleCards: Array.isArray(parsed.workStyleCards)
      ? (parsed.workStyleCards as import("../db/types").WorkStyleCard[])
      : [],
    inspirationFragments: Array.isArray(parsed.inspirationFragments)
      ? (parsed.inspirationFragments as import("../db/types").InspirationFragment[])
      : [],
    writingPromptTemplates: Array.isArray(parsed.writingPromptTemplates)
      ? (parsed.writingPromptTemplates as import("../db/types").WritingPromptTemplate[])
      : [],
    writingStyleSamples: Array.isArray(parsed.writingStyleSamples)
      ? (parsed.writingStyleSamples as import("../db/types").WritingStyleSample[])
      : [],
  };
  if (mode === "merge") {
    await importAllDataMerge(payload);
  } else {
    await importAllData(payload);
  }
}

export async function exportWorkAsMergedMarkdown(
  workTitle: string,
  chapters: { title: string; content: string }[],
  lineEnding: "\n" | "\r\n" = "\n",
): Promise<Blob> {
  const nl = lineEnding;
  const parts: string[] = [`# ${workTitle}`, ""];
  for (const ch of chapters) {
    parts.push(`## ${ch.title}`, "", ch.content, "", "---", "");
  }
  const body = parts.join(nl);
  return new Blob([body], { type: "text/markdown;charset=utf-8" });
}
