/**
 * 本章笔记（P1-F）：
 * - 切章时加载本章笔记
 * - 修改后 500 ms 防抖落盘
 *
 * 行为与原 `EditorPage.tsx` 内联实现完全一致；仅做模块化抽离。
 */

import { useEffect, useState } from "react";
import { loadChapterNote, saveChapterNote } from "../util/chapter-notes-storage";

const NOTE_DEBOUNCE_MS = 500;

export interface UseEditorChapterNoteReturn {
  chapterNote: string;
  setChapterNote: React.Dispatch<React.SetStateAction<string>>;
  noteOpen: boolean;
  setNoteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useEditorChapterNote(activeId: string | null): UseEditorChapterNoteReturn {
  const [chapterNote, setChapterNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    if (!activeId) {
      setChapterNote("");
      return;
    }
    setChapterNote(loadChapterNote(activeId));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const t = window.setTimeout(() => saveChapterNote(activeId, chapterNote), NOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [activeId, chapterNote]);

  return { chapterNote, setChapterNote, noteOpen, setNoteOpen };
}
