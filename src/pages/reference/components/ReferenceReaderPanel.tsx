import React from "react";
import { Button } from "../../../components/ui/button";
import type { ReferenceChapterHead, ReferenceChunk } from "../../../db/types";
import { highlightChunkText } from "../utils/reference-utils";

const CONTEXT_TAIL = 280;
const CONTEXT_HEAD = 280;



interface ReferenceReaderPanelProps {
  activeRefId: string | null;
  activeTitle: string;
  activeChunkCount: number;
  activeChapterHeads: ReferenceChapterHead[];
  currentChunk: ReferenceChunk | null | undefined;
  prevChunk: ReferenceChunk | null | undefined;
  nextChunk: ReferenceChunk | null | undefined;
  focusOrdinal: number;
  setFocusOrdinal: React.Dispatch<React.SetStateAction<number>>;
  currentChapterIndex: number;
  currentChapterTitle: string | null;
  highlight: { start: number; end: number } | null;
  setHighlight: (h: any) => void;
  saveSelectionAsExcerpt: () => Promise<void>;
  chunkAnchorRef: React.RefObject<HTMLDivElement | null>;
}

export function ReferenceReaderPanel({
  activeRefId,
  activeTitle,
  activeChunkCount,
  activeChapterHeads,
  currentChunk,
  prevChunk,
  nextChunk,
  focusOrdinal,
  setFocusOrdinal,
  currentChapterIndex,
  currentChapterTitle,
  highlight,
  setHighlight,
  saveSelectionAsExcerpt,
  chunkAnchorRef,
}: ReferenceReaderPanelProps) {
  if (!activeRefId) {
    return (
      <p className="muted small reference-reader-placeholder">
        从左侧打开一本书，或点击搜索结果，在此阅读原文上下文。
      </p>
    );
  }

  if (activeChunkCount > 0 && !currentChunk) {
    return <p className="muted small">正文分块加载中…</p>;
  }

  if (!currentChunk) {
    return <p className="muted small">当前段无内容</p>;
  }

  return (
    <>
      <ReferenceReaderNav
        activeTitle={activeTitle}
        activeChapterHeads={activeChapterHeads}
        currentChapterIndex={currentChapterIndex}
        currentChapterTitle={currentChapterTitle}
        focusOrdinal={focusOrdinal}
        activeChunkCount={activeChunkCount}
        setFocusOrdinal={setFocusOrdinal}
        setHighlight={setHighlight}
        saveSelectionAsExcerpt={saveSelectionAsExcerpt}
      />

      <ReferenceReaderContent
        currentChunk={currentChunk}
        prevChunk={prevChunk}
        nextChunk={nextChunk}
        focusOrdinal={focusOrdinal}
        highlight={highlight}
        chunkAnchorRef={chunkAnchorRef}
      />
    </>
  );
}

interface ReferenceReaderNavProps {
  activeTitle: string;
  activeChapterHeads: ReferenceChapterHead[];
  currentChapterIndex: number;
  currentChapterTitle: string | null;
  focusOrdinal: number;
  activeChunkCount: number;
  setFocusOrdinal: React.Dispatch<React.SetStateAction<number>>;
  setHighlight: (h: any) => void;
  saveSelectionAsExcerpt: () => Promise<void>;
}

function ReferenceReaderNav({
  activeTitle,
  activeChapterHeads,
  currentChapterIndex,
  currentChapterTitle,
  focusOrdinal,
  activeChunkCount,
  setFocusOrdinal,
  setHighlight,
  saveSelectionAsExcerpt,
}: ReferenceReaderNavProps) {
  return (
    <div className="reference-reader-toolbar">
      <h2 className="reference-reader-title">{activeTitle}</h2>
      <div className="reference-reader-nav">
        {activeChapterHeads.length > 0 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentChapterIndex <= 0}
              onClick={() => {
                const prev = activeChapterHeads[currentChapterIndex - 1];
                if (!prev) return;
                setFocusOrdinal(prev.ordinal);
                setHighlight(null);
              }}
            >
              上一章
            </Button>
            <label className="reference-chapter-picker">
              <span className="visually-hidden">章节</span>
              <select
                value={currentChapterIndex >= 0 ? String(currentChapterIndex) : ""}
                onChange={(e) => {
                  const ix = parseInt(e.target.value, 10);
                  const head = activeChapterHeads[ix];
                  if (!head) return;
                  setFocusOrdinal(head.ordinal);
                  setHighlight(null);
                }}
              >
                {activeChapterHeads.map((h, i) => (
                  <option key={h.id} value={String(i)}>
                    {i + 1}. {h.title}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentChapterIndex < 0 || currentChapterIndex >= activeChapterHeads.length - 1}
              onClick={() => {
                const next = activeChapterHeads[currentChapterIndex + 1];
                if (!next) return;
                setFocusOrdinal(next.ordinal);
                setHighlight(null);
              }}
            >
              下一章
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={focusOrdinal <= 0}
            onClick={() => {
              setFocusOrdinal((o) => o - 1);
              setHighlight(null);
            }}
          >
            上一段
          </Button>
        )}
        <span className="muted small">
          {activeChapterHeads.length > 0
            ? currentChapterTitle
              ? `当前章：${currentChapterTitle}`
              : ""
            : ""}
          {activeChapterHeads.length > 0 ? " · " : ""}
          存储段 {focusOrdinal + 1} / {activeChunkCount}
        </span>
        {activeChapterHeads.length > 0 ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={focusOrdinal >= activeChunkCount - 1}
            onClick={() => {
              setFocusOrdinal((o) => o + 1);
              setHighlight(null);
            }}
          >
            下一段
          </Button>
        )}
      </div>
      <Button type="button" size="sm" onClick={() => void saveSelectionAsExcerpt()}>
        保存划选为摘录
      </Button>
    </div>
  );
}

interface ReferenceReaderContentProps {
  currentChunk: ReferenceChunk;
  prevChunk: ReferenceChunk | null | undefined;
  nextChunk: ReferenceChunk | null | undefined;
  focusOrdinal: number;
  highlight: { start: number; end: number } | null;
  chunkAnchorRef: React.RefObject<HTMLDivElement | null>;
}

function ReferenceReaderContent({
  currentChunk,
  prevChunk,
  nextChunk,
  focusOrdinal,
  highlight,
  chunkAnchorRef,
}: ReferenceReaderContentProps) {
  return (
    <>
      {prevChunk ? (
        <div className="reference-context reference-context--prev muted small">
          <div className="reference-context-label">上一段末尾</div>
          <pre className="reference-context-pre">
            …{prevChunk.content.slice(-CONTEXT_TAIL)}
          </pre>
        </div>
      ) : null}

      <div
        ref={chunkAnchorRef}
        id={`ref-chunk-${focusOrdinal}`}
        className="reference-chunk-body"
      >
        <div className="reference-chunk-label small muted">当前段</div>
        <pre className="reference-chunk-pre">
          {highlight
            ? highlightChunkText(
                currentChunk.content,
                highlight.start,
                highlight.end,
              )
            : currentChunk.content}
        </pre>
      </div>

      {nextChunk ? (
        <div className="reference-context reference-context--next muted small">
          <div className="reference-context-label">下一段开头</div>
          <pre className="reference-context-pre">
            {nextChunk.content.slice(0, CONTEXT_HEAD)}…
          </pre>
        </div>
      ) : null}
    </>
  );
}
