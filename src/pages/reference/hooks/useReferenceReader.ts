import { useState, useEffect, useMemo, useCallback } from "react";
import { getReferenceChunkAt, listReferenceChapterHeads } from "../../../db/repo";
import type { ReferenceChapterHead, ReferenceChunk, ReferenceLibraryEntry } from "../../../db/types";
import { loadReaderPos } from "./useReferenceLibrary";

const LS_REF_READER_POS_PREFIX = "liubai-ref:readerPos:";

export type ReaderHighlight = { start: number; end: number } | null;

export type LoadedChunks = {
  prev?: ReferenceChunk;
  curr?: ReferenceChunk;
  next?: ReferenceChunk;
};

export function saveReaderPos(refWorkId: string, ordinal: number) {
  try {
    localStorage.setItem(LS_REF_READER_POS_PREFIX + refWorkId, String(ordinal));
  } catch {
    /* ignore */
  }
}

type UseReferenceReaderProps = {
  chunkAnchorRef: React.RefObject<HTMLDivElement | null>;
  onOpen?: (entry: ReferenceLibraryEntry) => Promise<void>;
};

export function useReferenceReader({ chunkAnchorRef, onOpen }: UseReferenceReaderProps) {
  const [activeRefId, setActiveRefId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [activeChunkCount, setActiveChunkCount] = useState(0);
  
  const [loadedChunks, setLoadedChunks] = useState<LoadedChunks>({});
  const [focusOrdinal, setFocusOrdinal] = useState(0);
  const [highlight, setHighlight] = useState<ReaderHighlight>(null);
  
  const [activeChapterHeads, setActiveChapterHeads] = useState<ReferenceChapterHead[]>([]);

  // 1. Load Chunks
  useEffect(() => {
    if (!activeRefId || activeChunkCount === 0) {
      setLoadedChunks({});
      return;
    }
    const o = Math.max(0, Math.min(focusOrdinal, activeChunkCount - 1));
    if (o !== focusOrdinal) {
      setFocusOrdinal(o);
      return;
    }
    let valid = true;
    Promise.all([
      o > 0 ? getReferenceChunkAt(activeRefId, o - 1) : Promise.resolve(undefined),
      getReferenceChunkAt(activeRefId, o),
      o + 1 < activeChunkCount ? getReferenceChunkAt(activeRefId, o + 1) : Promise.resolve(undefined),
    ]).then(([p, c, n]) => {
      if (!valid) return;
      setLoadedChunks({ prev: p, curr: c, next: n });
    });
    return () => {
      valid = false;
    };
  }, [activeRefId, focusOrdinal, activeChunkCount]);

  // 2. Load Chapter Heads
  useEffect(() => {
    if (!activeRefId) {
      setActiveChapterHeads([]);
      return;
    }
    void listReferenceChapterHeads(activeRefId).then(setActiveChapterHeads);
  }, [activeRefId]);

  // 3. Save Reader Position
  useEffect(() => {
    if (!activeRefId) return;
    saveReaderPos(activeRefId, focusOrdinal);
  }, [activeRefId, focusOrdinal]);

  // 4. Calculate Current Chapter
  const currentChapterIndex = useMemo(() => {
    if (!activeRefId) return -1;
    if (activeChapterHeads.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < activeChapterHeads.length; i++) {
      if (activeChapterHeads[i]!.ordinal <= focusOrdinal) idx = i;
      else break;
    }
    return idx;
  }, [activeRefId, activeChapterHeads, focusOrdinal]);

  const currentChapterTitle = useMemo(() => {
    return activeChapterHeads[currentChapterIndex]?.title ?? "";
  }, [activeChapterHeads, currentChapterIndex]);

  // 5. Open Reader
  const openReader = useCallback(
    async (
      entry: ReferenceLibraryEntry,
      ord = 0,
      hl?: ReaderHighlight,
    ) => {
      setActiveRefId(entry.id);
      setActiveTitle(entry.title);
      setActiveChunkCount(entry.chunkCount);
      
      const max = Math.max(0, entry.chunkCount - 1);
      const resume = hl ? null : loadReaderPos(entry.id);
      const pick = ord === 0 && resume !== null ? resume : ord;
      const o = Math.max(0, Math.min(pick, max));
      
      setFocusOrdinal(o);
      setHighlight(hl ?? null);
      setLoadedChunks({});
      
      if (onOpen) {
        await onOpen(entry);
      }
      
      if (hl && chunkAnchorRef.current) {
        chunkAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [chunkAnchorRef, onOpen],
  );

  const closeReader = useCallback(() => {
    setActiveRefId(null);
    setActiveTitle("");
    setActiveChunkCount(0);
    setFocusOrdinal(0);
    setHighlight(null);
  }, []);

  return {
    activeRefId,
    activeTitle,
    activeChunkCount,
    loadedChunks,
    focusOrdinal,
    setFocusOrdinal,
    highlight,
    setHighlight,
    activeChapterHeads,
    currentChapterIndex,
    currentChapterTitle,
    openReader,
    closeReader,
  };
}
