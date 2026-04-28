import { useCallback, useEffect, useMemo, useState } from "react";
import { listBibleCharacters } from "../db/repo";
import { findOutlineMentionedCharacterNames } from "../util/sheng-hui-outline-character-detect";
import type { ShengHuiBibleCharRow } from "../util/sheng-hui-voice-lock";

/**
 * 生辉「人物声音锁」：随作品加载锦囊人物，根据大纲**非重叠长名**检测提及；可勾选将口吻/禁忌注入 `characterVoiceLocks`。
 */
export function useShengHuiVoiceLock(workId: string | null, outline: string) {
  const [bibleCharacters, setBibleCharacters] = useState<ShengHuiBibleCharRow[]>([]);
  const [lockedCharNames, setLockedCharNames] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!workId) {
      setBibleCharacters([]);
      return;
    }
    void listBibleCharacters(workId).then((list) =>
      setBibleCharacters(list.map((c) => ({ name: c.name, voiceNotes: c.voiceNotes, taboos: c.taboos }))),
    );
  }, [workId]);

  const detectedCharNames = useMemo(
    () => findOutlineMentionedCharacterNames(outline, bibleCharacters),
    [outline, bibleCharacters],
  );

  useEffect(() => {
    setLockedCharNames((prev) => {
      const next = new Set<string>();
      for (const name of detectedCharNames) {
        const char = bibleCharacters.find((c) => c.name === name);
        if (char && (char.voiceNotes.trim() || char.taboos.trim())) next.add(name);
        else if (prev.has(name)) next.add(name);
      }
      return next;
    });
  }, [detectedCharNames, bibleCharacters]);

  const toggleLockedCharName = useCallback((name: string, hasData: boolean) => {
    if (!hasData) return;
    setLockedCharNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  return {
    bibleCharacters,
    detectedCharNames,
    lockedCharNames,
    toggleLockedCharName,
  };
}
