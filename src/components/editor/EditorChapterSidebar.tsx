import * as React from "react";
import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/utils";
import type {
  BibleGlossaryTerm,
  Chapter,
  ReferenceExcerpt,
  TuiyanPushedOutlineEntry,
  Volume,
  Work,
} from "../../db/types";
import {
  buildFlatChapterItems,
  computeOrphanChapters,
  type FlatItem,
  makeChapterOrderCmp,
} from "../../util/editor-chapter-tree";
import { hasChapterNote } from "../../util/chapter-notes-storage";
import { referenceReaderHref } from "../../util/readUtf8TextFile";
import { wordCount } from "../../util/wordCount";
import { PushedOutlineTree } from "./PushedOutlineTree";

type LinkedExcerpt = ReferenceExcerpt & { refTitle: string };
type InspirationItem = ReferenceExcerpt & { refTitle: string; tagIds: string[] };

export interface EditorChapterSidebarProps {
  // 布局（外层 editor-body 容器仍由父组件持有，因它需要同时包住正文区）
  collapsed: boolean;
  widthPx: number;
  sidebarDragRef: React.MutableRefObject<{ startX: number; startW: number } | null>;
  toggleSidebar: () => void;

  // Tab
  sidebarTab: "outline" | "chapter";
  setSidebarTab: (t: "outline" | "chapter") => void;

  // 章节列表控制
  chapterListCollapsed: boolean;
  toggleChapterList: () => void;
  chapterListSortDir: "asc" | "desc";
  setChapterListSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  chapterListMutating: boolean;

  // 章纲数据
  pushedOutlines: TuiyanPushedOutlineEntry[];
  selectedOutlineEntryId: string | null;
  setSelectedOutlineEntryId: (id: string | null) => void;

  // 章节数据
  work: Work;
  activeChapter: Chapter | null;
  activeId: string | null;
  chapters: Chapter[];
  volumes: Volume[];

  // 术语命中（基于 content + glossaryTerms）
  content: string;
  glossaryTerms: BibleGlossaryTerm[];

  // 关联参考摘录 / 灵感便签
  linkedExcerptsForChapter: LinkedExcerpt[];
  inspirationOpen: boolean;
  setInspirationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  inspirationList: InspirationItem[];

  // 本章笔记
  noteOpen: boolean;
  setNoteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chapterNote: string;
  setChapterNote: React.Dispatch<React.SetStateAction<string>>;

  // 章节/卷操作
  onNewChapter: () => void;
  onNewVolume: () => void;
  onRenameVolume: (volId: string) => void;
  onDeleteVolume: (volId: string) => void;
  onAttachOrphansToFirstVolume: () => void;
  onDeleteChapter: (id: string) => void;
  onRenameChapter: (id: string) => void;
  onMoveChapter: (id: string, dir: -1 | 1) => void;
  onMoveChapterToVolume: (id: string) => void;
  onDropChapter: (targetId: string) => void;
  onSwitchChapter: (id: string) => void;
  onSetProgressChapter: (id: string) => void;
  onOpenSummaryForChapter: (id: string) => void;
  onOpenChapterConstraints: () => void;
  onSetDragChapterId: (id: string | null) => void;
  onInsertExcerpt: (text: string) => void;
}

/**
 * 编辑页左侧栏：书名（Tab 上、虚线分隔）+ 章纲/章节 Tab + 章节列表（含虚拟滚动）+ 术语命中 + 关联参考 + 灵感便签 + 本章笔记。
 * - 与原 EditorPage `<aside className="chapter-sidebar ...">` 内 JSX 一一对应；DOM 嵌套层级不变。
 * - 内部托管：`chapterOrderCmp`、`orphanChapters`、`flatChapterItems`、`virtualizer`、`glossaryHits`，因这些 memo 只服务于本组件。
 * - 与 `editor-xy-frame-alignment.css` 联动时，`--xy-sidebar-pad-top` 须与 `.chapter-sidebar` 上 padding 同步。
 */
export function EditorChapterSidebar(props: EditorChapterSidebarProps): React.JSX.Element {
  const {
    collapsed,
    widthPx,
    sidebarDragRef,
    toggleSidebar,
    sidebarTab,
    setSidebarTab,
    chapterListCollapsed,
    toggleChapterList,
    chapterListSortDir,
    setChapterListSortDir,
    chapterListMutating,
    pushedOutlines,
    selectedOutlineEntryId,
    setSelectedOutlineEntryId,
    work,
    activeChapter,
    activeId,
    chapters,
    volumes,
    content,
    glossaryTerms,
    linkedExcerptsForChapter,
    inspirationOpen,
    setInspirationOpen,
    inspirationList,
    noteOpen,
    setNoteOpen,
    chapterNote,
    setChapterNote,
    onNewChapter,
    onNewVolume,
    onRenameVolume,
    onDeleteVolume,
    onAttachOrphansToFirstVolume,
    onDeleteChapter,
    onRenameChapter,
    onMoveChapter,
    onMoveChapterToVolume,
    onDropChapter,
    onSwitchChapter,
    onSetProgressChapter,
    onOpenSummaryForChapter,
    onOpenChapterConstraints,
    onSetDragChapterId,
    onInsertExcerpt,
  } = props;

  const chapterOrderCmp = useMemo(() => makeChapterOrderCmp(chapterListSortDir), [chapterListSortDir]);
  const orphanChapters = useMemo(
    () => computeOrphanChapters(chapters, volumes, chapterOrderCmp),
    [chapters, volumes, chapterOrderCmp],
  );
  const flatChapterItems = useMemo<FlatItem[]>(
    () => buildFlatChapterItems({ volumes, chapters, orphanChapters, cmp: chapterOrderCmp }),
    [volumes, chapters, orphanChapters, chapterOrderCmp],
  );
  const useVirtualChapterList = chapters.length >= 100;
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: flatChapterItems.length,
    getScrollElement: () => virtualListRef.current,
    estimateSize: (i) => {
      const item = flatChapterItems[i];
      if (!item) return 40;
      if (item.kind === "vol-head" || item.kind === "orphan-head") return 32;
      const c = (item as { chapter: Chapter }).chapter;
      return c.id === activeId ? 130 : 46;
    },
    overscan: 5,
    enabled: useVirtualChapterList,
  });

  const glossaryHits = useMemo(() => {
    if (!content || glossaryTerms.length === 0) return [];
    const sorted = [...glossaryTerms].sort((a, b) => b.term.length - a.term.length);
    const seen = new Set<string>();
    const out: BibleGlossaryTerm[] = [];
    for (const t of sorted) {
      if (!t.term.trim()) continue;
      if (content.includes(t.term) && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [content, glossaryTerms]);

  function renderChapterSidebarItem(
    c: Chapter,
    opt?: {
      key?: string | number;
      dataIndex?: number;
      measureRef?: (el: Element | null) => void;
      style?: Record<string, string | number>;
    },
  ) {
    const i = chapters.findIndex((x) => x.id === c.id);
    const wc = c.wordCountCache ?? wordCount(c.content);
    const isCurrent = c.id === activeId;
    return (
      <li
        key={opt?.key ?? c.id}
        data-index={opt?.dataIndex}
        ref={opt?.measureRef}
        style={opt?.style}
        className={cn("chapter-card", isCurrent ? "chapter-card--expanded active" : "chapter-card--compact")}
        draggable
        onDragStart={() => onSetDragChapterId(c.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onDropChapter(c.id);
        }}
      >
        {isCurrent ? (
          <>
            <div className="chapter-card__head">
              <button type="button" className="chapter-card__title" onClick={() => onSwitchChapter(c.id)}>
                {c.title}
              </button>
              <button
                type="button"
                className={cn("chapter-card__bookmark", work?.progressCursor === c.id && "on")}
                title={work?.progressCursor === c.id ? "已标为写作进度" : "标为写作进度"}
                aria-pressed={work?.progressCursor === c.id}
                onClick={() => onSetProgressChapter(c.id)}
              >
                🔖
              </button>
            </div>
            <div className="chapter-card__meta">
              <span>{wc.toLocaleString()} 字</span>
              <span className="chapter-card__date">
                更新{" "}
                {new Date(c.updatedAt).toLocaleString(undefined, {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="chapter-card__btns">
              <button
                type="button"
                className="chapter-card__btn chapter-card__btn--blue"
                onClick={() => onOpenSummaryForChapter(c.id)}
              >
                概要
              </button>
              <button
                type="button"
                className="chapter-card__btn"
                onClick={() => onOpenChapterConstraints()}
                title="可选：本章约束（不用可不填）"
              >
                约束
              </button>
              <button
                type="button"
                className="chapter-card__btn chapter-card__btn--red"
                onClick={() => onDeleteChapter(c.id)}
              >
                删除
              </button>
            </div>
            <div className="chapter-card__tools">
              <button type="button" title="上移" disabled={i === 0} onClick={() => onMoveChapter(c.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                title="下移"
                disabled={i === chapters.length - 1}
                onClick={() => onMoveChapter(c.id, 1)}
              >
                ↓
              </button>
              <button type="button" title="重命名" onClick={() => onRenameChapter(c.id)}>
                ✎
              </button>
              {volumes.length > 1 ? (
                <button type="button" title="移到其他卷" onClick={() => onMoveChapterToVolume(c.id)}>
                  卷
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="chapter-card__compact-row">
            <button
              type="button"
              className="chapter-card__title chapter-card__title--row"
              onClick={() => onSwitchChapter(c.id)}
            >
              {c.title}
              {hasChapterNote(c.id) && <span className="chapter-note-dot chapter-note-dot--inline" aria-label="有笔记" />}
            </button>
            <span className="chapter-card__wc">{wc.toLocaleString()} 字</span>
            <button
              type="button"
              className={cn("chapter-card__bookmark chapter-card__bookmark--compact", work?.progressCursor === c.id && "on")}
              title={work?.progressCursor === c.id ? "已标为写作进度" : "标为写作进度"}
              aria-pressed={work?.progressCursor === c.id}
              onClick={(e) => {
                e.stopPropagation();
                onSetProgressChapter(c.id);
              }}
            >
              🔖
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <aside
      className="chapter-sidebar chapter-sidebar--stack relative"
      aria-hidden={collapsed}
      onWheelCapture={(e) => {
        e.stopPropagation();
      }}
    >
        {/* Resize Handle / Collapse Toggle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/20 group z-10 flex items-center justify-center transition-colors -mr-1"
          onMouseDown={(e) => {
            e.preventDefault();
            sidebarDragRef.current = { startX: e.clientX, startW: widthPx };
          }}
        >
          <div className="w-0.5 h-full bg-border/40 group-hover:bg-blue-500 transition-colors" />
          <button
            type="button"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-8 flex items-center justify-center rounded-sm bg-background border border-border bg-card shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
            title="收起章节栏"
            onClick={(e) => {
              e.stopPropagation();
              toggleSidebar();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>

        <div className="chapter-sidebar__header">
          <div className="sidebar-project-xy border-b border-border/40 pb-0 shrink-0">
            <div className="border-b border-dashed border-border/55 px-2 py-0.5">
              <p
                className="m-0 truncate text-center text-xs font-medium leading-tight text-foreground/90"
                title={work.title.trim() || "未命名作品"}
              >
                {work.title.trim() || "未命名作品"}
              </p>
            </div>
            <div className="flex w-full px-2 pt-1 -mb-px">
              <button
                type="button"
                className={`flex-1 pb-1.5 text-center text-sm font-medium border-b-2 transition-colors ${sidebarTab === "outline" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setSidebarTab("outline")}
              >
                章纲
              </button>
              <button
                type="button"
                className={`flex-1 pb-1.5 text-center text-sm font-medium border-b-2 transition-colors ${sidebarTab === "chapter" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => setSidebarTab("chapter")}
              >
                章节正文
              </button>
            </div>
          </div>
          {sidebarTab === "chapter" ? (
            <div className="sidebar-head sidebar-section-head mt-3 px-[2px]">
              <span>章节</span>
              <div className="sidebar-head-btns">
                <button
                  type="button"
                  className="sidebar-section-toggle"
                  title={chapterListCollapsed ? "展开章节列表" : "折叠章节列表"}
                  onClick={toggleChapterList}
                >
                  {chapterListCollapsed ? "▸" : "▾"}
                </button>
                <button
                  type="button"
                  className="sidebar-section-toggle"
                  title={chapterListSortDir === "asc" ? "切换为倒序（从尾到头）" : "切换为正序（从头到尾）"}
                  onClick={() => setChapterListSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  ⇅
                </button>
                <button type="button" className="btn small" onClick={onNewVolume}>
                  + 卷
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={chapterListMutating}
                  onClick={onNewChapter}
                >
                  + 新章
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="chapter-sidebar__body">
          {sidebarTab === "outline" ? (
            <PushedOutlineTree
              entries={pushedOutlines}
              selectedId={selectedOutlineEntryId}
              onSelect={(id) => setSelectedOutlineEntryId(id)}
            />
          ) : (
            <>
              {work.progressCursor && (
                <p className="progress-hint small">
                  进度截至：{chapters.find((c) => c.id === work.progressCursor)?.title ?? "（章节已删）"}
                </p>
              )}
              {!chapterListCollapsed ? (
                <>
                  {useVirtualChapterList ? (
                    /* P1-B：虚拟滚动（≥100章） */
                    <div
                      ref={virtualListRef}
                      className="chapter-virtual-scroll"
                      style={{ overflowY: "auto", flex: 1 }}
                    >
                      <ul
                        className="chapter-list"
                        style={{ height: virtualizer.getTotalSize(), position: "relative", margin: 0, padding: 0 }}
                      >
                        {virtualizer.getVirtualItems().map((vItem) => {
                          const item = flatChapterItems[vItem.index];
                          if (!item) return null;
                          if (item.kind === "chapter" || item.kind === "orphan-chapter") {
                            return renderChapterSidebarItem(item.chapter, {
                              key: String(vItem.key),
                              dataIndex: vItem.index,
                              measureRef: virtualizer.measureElement,
                              style: {
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${vItem.start}px)`,
                              },
                            });
                          }
                          return (
                            <li
                              key={String(vItem.key)}
                              data-index={vItem.index}
                              ref={virtualizer.measureElement}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${vItem.start}px)`,
                              }}
                            >
                              {item.kind === "vol-head" && (
                                <div className="volume-row">
                                  <span className="volume-title">{item.title}</span>
                                  <div className="volume-actions">
                                    <button type="button" title="重命名卷" onClick={() => onRenameVolume(item.volId)}>
                                      ✎
                                    </button>
                                    {item.canDelete && (
                                      <button type="button" title="删卷" onClick={() => onDeleteVolume(item.volId)}>
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                              {item.kind === "orphan-head" && (
                                <div className="volume-row">
                                  <span className="volume-title">未匹配章节 · {item.count}</span>
                                  {volumes.length > 0 && (
                                    <button
                                      type="button"
                                      className="btn small primary"
                                      onClick={onAttachOrphansToFirstVolume}
                                    >
                                      并入首卷
                                    </button>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    /* 正常渲染（<100章） */
                    <>
                      {volumes.map((vol) => (
                        <div key={vol.id} className="volume-block">
                          <div className="volume-row">
                            <span className="volume-title">{vol.title}</span>
                            <div className="volume-actions">
                              <button type="button" title="重命名卷" onClick={() => onRenameVolume(vol.id)}>
                                ✎
                              </button>
                              {volumes.length > 1 ? (
                                <button
                                  type="button"
                                  title="删卷（章并入其他卷）"
                                  onClick={() => onDeleteVolume(vol.id)}
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <ul className="chapter-list">
                            {chapters
                              .filter((c) => c.volumeId === vol.id)
                              .sort(chapterOrderCmp)
                              .map((c) => renderChapterSidebarItem(c))}
                          </ul>
                        </div>
                      ))}
                      {orphanChapters.length > 0 ? (
                        <div className="volume-block volume-block--orphans">
                          <div className="volume-row">
                            <span className="volume-title">未匹配到当前卷的章节 · {orphanChapters.length}</span>
                            <div className="volume-actions">
                              {volumes.length > 0 ? (
                                <button
                                  type="button"
                                  className="btn small primary"
                                  title={`并入「${volumes[0]?.title ?? "第一卷"}」`}
                                  onClick={onAttachOrphansToFirstVolume}
                                >
                                  并入首卷
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <p className="muted small" style={{ margin: "0 0 0.4rem" }}>
                            常见于合并备份、导入或删卷后遗留；点「并入首卷」或单章「卷」按钮即可修复。
                          </p>
                          <ul className="chapter-list">
                            {[...orphanChapters].sort(chapterOrderCmp).map((c) => renderChapterSidebarItem(c))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <p className="muted small" style={{ margin: "0.25rem 0 0.5rem" }}>
                  章节列表已折叠。
                </p>
              )}
              {chapters.length === 0 && <p className="muted small">暂无章节，点「新章」。</p>}
              {glossaryHits.length > 0 && (
                <div className="sidebar-glossary-hits">
                  <div className="sidebar-glossary-hits-title">术语命中</div>
                  <ul className="sidebar-glossary-hits-list">
                    {glossaryHits.map((t) => (
                      <li key={t.id}>
                        <span className="sidebar-glossary-term">{t.term}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {linkedExcerptsForChapter.length > 0 && (
                <div className="sidebar-linked-ref">
                  <div className="sidebar-linked-ref-title">本章关联参考</div>
                  <ul className="sidebar-linked-ref-list">
                    {linkedExcerptsForChapter.map((ex) => (
                      <li key={ex.id}>
                        <Link className="sidebar-linked-ref-link" to={referenceReaderHref(ex)}>
                          {ex.refTitle}
                        </Link>
                        <span className="muted small sidebar-linked-ref-preview">
                          {ex.text.length > 36 ? `${ex.text.slice(0, 36)}…` : ex.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="sidebar-inspiration">
                <button
                  type="button"
                  className="sidebar-inspiration-toggle"
                  onClick={() => setInspirationOpen((o) => !o)}
                  aria-expanded={inspirationOpen}
                >
                  灵感便签（参考摘录）{inspirationOpen ? "▼" : "▶"}
                </button>
                {inspirationOpen ? (
                  inspirationList.length === 0 ? (
                    <p className="muted small sidebar-inspiration-empty">
                      暂无摘录。在「藏经」阅读器中划选保存后，可在此插入正文。
                    </p>
                  ) : (
                    <ul className="sidebar-inspiration-list">
                      {inspirationList.map((ex) => (
                        <li key={ex.id} className="sidebar-inspiration-item">
                          <div className="sidebar-inspiration-meta muted small">
                            {ex.refTitle}
                            {ex.tagIds.length > 0 ? ` · 标签 ${ex.tagIds.length}` : ""}
                          </div>
                          <blockquote className="sidebar-inspiration-quote">{ex.text}</blockquote>
                          {ex.note ? <p className="small muted">{ex.note}</p> : null}
                          <div className="sidebar-inspiration-actions">
                            <Link className="btn ghost small" to={referenceReaderHref(ex)}>
                              在藏经打开
                            </Link>
                            <button
                              type="button"
                              className="btn primary small"
                              disabled={!activeChapter}
                              onClick={() => onInsertExcerpt(ex.text)}
                            >
                              插入正文
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            </>
          )}
          {/* P1-F：本章笔记区 */}
          {sidebarTab === "chapter" && activeChapter && (
            <div className="chapter-note-section">
              <button
                type="button"
                className="chapter-note-toggle"
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
              >
                {noteOpen ? "▾" : "▸"} 本章笔记
                {!noteOpen && hasChapterNote(activeChapter.id) && (
                  <span className="chapter-note-dot" aria-label="有笔记" />
                )}
              </button>
              {noteOpen && (
                <textarea
                  className="chapter-note-textarea"
                  value={chapterNote}
                  onChange={(e) => setChapterNote(e.target.value)}
                  placeholder="随手记录本章思路、待改处、伏笔…（自动保存）"
                  rows={5}
                  aria-label="本章笔记"
                />
              )}
            </div>
          )}
        </div>
      </aside>
  );
}
