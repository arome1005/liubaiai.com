import type { CharacterVoiceLock } from "../ai/sheng-hui-generate";

/** 生辉右栏/装配所需：锦囊人物最小切片（与 `listBibleCharacters` 映射一致） */
export type ShengHuiBibleCharRow = {
  name: string;
  voiceNotes: string;
  taboos: string;
  /** 经典台词样例（N7） */
  quoteSamples: string;
};

export function buildCharacterVoiceLocksForShengHui(
  lockedNames: Set<string>,
  bibleCharacters: ShengHuiBibleCharRow[],
): CharacterVoiceLock[] | undefined {
  const locks: CharacterVoiceLock[] = [];
  for (const name of lockedNames) {
    const c = bibleCharacters.find((ch) => ch.name === name);
    if (c && (c.voiceNotes.trim() || c.taboos.trim() || c.quoteSamples.trim())) {
      const lock: CharacterVoiceLock = { name: c.name, voiceNotes: c.voiceNotes, taboos: c.taboos };
      if (c.quoteSamples.trim()) lock.quoteSamples = c.quoteSamples;
      locks.push(lock);
    }
  }
  return locks.length > 0 ? locks : undefined;
}
