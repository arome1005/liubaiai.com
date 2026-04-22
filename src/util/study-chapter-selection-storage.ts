export type StudyChapterSelectionV1 = {
  v: 1;
  characterIds: string[];
  glossaryIds: string[];
  glossaryMode: "full_book" | "chapter_pick";
};

/** v2：人物卡勾选 + NPC 手写切换 */
export type StudyChapterSelection = {
  v: 2;
  characterIds: string[];
  glossaryIds: string[];
  glossaryMode: "full_book" | "chapter_pick";
  characterSource: "cards" | "npc";
  npcText: string;
};

const KEY_PREFIX = "liubai:studyChapterSelection:v1:";

function migrateV1ToV2(v1: StudyChapterSelectionV1): StudyChapterSelection {
  return {
    v: 2,
    characterIds: v1.characterIds.filter((x) => typeof x === "string" && x.trim()),
    glossaryIds: v1.glossaryIds.filter((x) => typeof x === "string" && x.trim()),
    glossaryMode: v1.glossaryMode,
    characterSource: "cards",
    npcText: "",
  };
}

function normalizeV2(v: StudyChapterSelection): StudyChapterSelection {
  return {
    v: 2,
    characterIds: v.characterIds.filter((x) => typeof x === "string" && x.trim()),
    glossaryIds: v.glossaryIds.filter((x) => typeof x === "string" && x.trim()),
    glossaryMode: v.glossaryMode === "chapter_pick" ? "chapter_pick" : "full_book",
    characterSource: v.characterSource === "npc" ? "npc" : "cards",
    npcText: typeof v.npcText === "string" ? v.npcText : "",
  };
}

export function readStudyChapterSelection(workId: string, chapterId: string): StudyChapterSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${workId}:${chapterId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudyChapterSelectionV1 | StudyChapterSelection;
    if (!parsed || typeof parsed !== "object") return null;
    if ((parsed as StudyChapterSelection).v === 2) return normalizeV2(parsed as StudyChapterSelection);
    if ((parsed as StudyChapterSelectionV1).v === 1) return migrateV1ToV2(parsed as StudyChapterSelectionV1);
    return null;
  } catch {
    return null;
  }
}

export function writeStudyChapterSelection(workId: string, chapterId: string, sel: StudyChapterSelection) {
  if (typeof window === "undefined") return;
  try {
    const n = normalizeV2(sel);
    window.localStorage.setItem(`${KEY_PREFIX}${workId}:${chapterId}`, JSON.stringify(n));
  } catch {
    // ignore quota / private mode
  }
}
