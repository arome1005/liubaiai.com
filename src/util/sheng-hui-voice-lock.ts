import type { CharacterVoiceLock } from "../ai/sheng-hui-generate";

/** 生辉右栏/装配所需：锦囊人物最小切片（与 `listBibleCharacters` 映射一致） */
export type ShengHuiBibleCharRow = { name: string; voiceNotes: string; taboos: string };

export function buildCharacterVoiceLocksForShengHui(
  lockedNames: Set<string>,
  bibleCharacters: ShengHuiBibleCharRow[],
): CharacterVoiceLock[] | undefined {
  const locks: CharacterVoiceLock[] = [];
  for (const name of lockedNames) {
    const c = bibleCharacters.find((ch) => ch.name === name);
    if (c && (c.voiceNotes.trim() || c.taboos.trim())) {
      locks.push({ name: c.name, voiceNotes: c.voiceNotes, taboos: c.taboos });
    }
  }
  return locks.length > 0 ? locks : undefined;
}
