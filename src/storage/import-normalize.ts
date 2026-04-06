import type { Chapter, Volume, Work } from "../db/types";
import { normalizeWorkTagList } from "../util/work-tags";
import { wordCount } from "../util/wordCount";

type RawWork = Work & {
  progressChapterId?: string | null;
  tags?: unknown;
  coverImage?: unknown;
};

/** 兼容旧备份 JSON 中的 `progressChapterId`；透传 `coverImage` / `tags` */
export function normalizeWorkRow(raw: RawWork): Work {
  const tagArr = Array.isArray(raw.tags)
    ? raw.tags.filter((x): x is string => typeof x === "string")
    : undefined;
  const cov = raw.coverImage;
  return {
    id: raw.id,
    title: raw.title,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    progressCursor: raw.progressCursor ?? raw.progressChapterId ?? null,
    coverImage: typeof cov === "string" && cov.length > 0 ? cov : undefined,
    tags: normalizeWorkTagList(tagArr),
  };
}

export function normalizeImportRows(data: {
  works: Work[];
  chapters: Chapter[];
  volumes?: Volume[];
  chapterSnapshots?: import("../db/types").ChapterSnapshot[];
}): {
  works: Work[];
  volumes: Volume[];
  chapters: Chapter[];
  chapterSnapshots: import("../db/types").ChapterSnapshot[];
} {
  let volumes = data.volumes ?? [];
  const chapters = data.chapters.map((c) => ({ ...c }));
  if (volumes.length === 0 && chapters.length > 0) {
    const widSet = [...new Set(chapters.map((c) => c.workId))];
    volumes = [];
    for (const wid of widSet) {
      const vid = crypto.randomUUID();
      volumes.push({
        id: vid,
        workId: wid,
        title: "正文",
        order: 0,
        createdAt: Date.now(),
      });
      for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].workId === wid && !chapters[i].volumeId) {
          chapters[i] = { ...chapters[i], volumeId: vid };
        }
      }
    }
  }
  for (let i = 0; i < chapters.length; i++) {
    if (!chapters[i].volumeId) {
      let vol = volumes.find((v) => v.workId === chapters[i].workId);
      if (!vol) {
        vol = {
          id: crypto.randomUUID(),
          workId: chapters[i].workId,
          title: "正文",
          order: 0,
          createdAt: Date.now(),
        };
        volumes.push(vol);
      }
      chapters[i] = { ...chapters[i], volumeId: vol.id };
    }
    const content = chapters[i].content ?? "";
    if (chapters[i].wordCountCache === undefined) {
      chapters[i] = {
        ...chapters[i],
        wordCountCache: wordCount(content),
      };
    }
    if (chapters[i].summary === undefined) {
      chapters[i] = {
        ...chapters[i],
        summary: "",
      };
    }
  }
  return {
    works: data.works.map((w) => normalizeWorkRow(w)),
    volumes,
    chapters,
    chapterSnapshots: data.chapterSnapshots ?? [],
  };
}
