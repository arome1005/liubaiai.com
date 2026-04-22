import { defaultChapterBibleInjectMask, type ChapterBibleFieldKey } from "../ai/assemble-context";
import { defaultWorkBibleSectionMask } from "../ai/work-bible-sections";
import type { AiPanelWorkRagInjectDefaults } from "../components/ai-panel/types";
import { DEFAULT_WRITING_RAG_SOURCES, type WritingRagSources } from "./work-rag-runtime";

const KEY_PREFIX = "liubai:workAiRagInjectDefaults:v1:";

function isWritingRagSources(x: unknown): x is WritingRagSources {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.referenceLibrary === "boolean" &&
    typeof o.workBibleExport === "boolean" &&
    typeof o.workManuscript === "boolean"
  );
}

function mergeChapterBibleMask(raw: unknown): Record<ChapterBibleFieldKey, boolean> {
  const base = defaultChapterBibleInjectMask();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const out = { ...base };
  for (const k of Object.keys(base) as ChapterBibleFieldKey[]) {
    if (typeof o[k] === "boolean") (out as Record<string, boolean>)[k] = o[k] as boolean;
  }
  return out;
}

function mergeWorkBibleMask(raw: unknown): Record<string, boolean> {
  const base = defaultWorkBibleSectionMask();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, boolean>;
  const out = { ...base };
  for (const h of Object.keys(base)) {
    if (typeof o[h] === "boolean") out[h] = o[h];
  }
  return out;
}

export function defaultWorkAiRagInjectDefaults(): AiPanelWorkRagInjectDefaults {
  return {
    ragEnabled: false,
    ragWorkSources: { ...DEFAULT_WRITING_RAG_SOURCES },
    ragK: 6,
    includeLinkedExcerpts: true,
    includeRecentSummaries: true,
    recentN: 3,
    neighborSummaryIncludeById: {},
    chapterBibleInjectMask: defaultChapterBibleInjectMask(),
    workBibleSectionMask: defaultWorkBibleSectionMask(),
    currentContextMode: "full",
  };
}

export function loadWorkAiRagInjectDefaults(workId: string): AiPanelWorkRagInjectDefaults {
  const base = defaultWorkAiRagInjectDefaults();
  try {
    const raw = localStorage.getItem(KEY_PREFIX + workId);
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>;
      return {
        ragEnabled: typeof p.ragEnabled === "boolean" ? p.ragEnabled : base.ragEnabled,
        ragWorkSources: isWritingRagSources(p.ragWorkSources)
          ? { ...DEFAULT_WRITING_RAG_SOURCES, ...(p.ragWorkSources as WritingRagSources) }
          : base.ragWorkSources,
        ragK: typeof p.ragK === "number" && Number.isFinite(p.ragK) ? Math.max(1, Math.min(20, Math.floor(p.ragK))) : base.ragK,
        includeLinkedExcerpts: typeof p.includeLinkedExcerpts === "boolean" ? p.includeLinkedExcerpts : base.includeLinkedExcerpts,
        includeRecentSummaries:
          typeof p.includeRecentSummaries === "boolean" ? p.includeRecentSummaries : base.includeRecentSummaries,
        recentN: typeof p.recentN === "number" && Number.isFinite(p.recentN) ? Math.max(0, Math.min(12, Math.floor(p.recentN))) : base.recentN,
        neighborSummaryIncludeById:
          p.neighborSummaryIncludeById && typeof p.neighborSummaryIncludeById === "object"
            ? (p.neighborSummaryIncludeById as Record<string, boolean>)
            : {},
        chapterBibleInjectMask: mergeChapterBibleMask(p.chapterBibleInjectMask),
        workBibleSectionMask: mergeWorkBibleMask(p.workBibleSectionMask),
        currentContextMode:
          p.currentContextMode === "full" ||
          p.currentContextMode === "summary" ||
          p.currentContextMode === "selection" ||
          p.currentContextMode === "none"
            ? p.currentContextMode
            : base.currentContextMode,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const globalRaw = localStorage.getItem("liubai:ragWorkSources:v1");
    if (globalRaw) {
      const g = JSON.parse(globalRaw) as unknown;
      if (isWritingRagSources(g)) {
        return { ...base, ragWorkSources: { ...DEFAULT_WRITING_RAG_SOURCES, ...g } };
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

export function persistWorkAiRagInjectDefaults(workId: string, v: AiPanelWorkRagInjectDefaults): void {
  try {
    localStorage.setItem(KEY_PREFIX + workId, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
