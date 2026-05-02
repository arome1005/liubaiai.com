import React from "react";
import { Button } from "../ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { cn } from "../../lib/utils";
import { CodeMirrorEditor, type CodeMirrorEditorHandle } from "../CodeMirrorEditor";
import {
  EditorShengHuiContextSurface,
  EditorShengHuiToolbarMenu,
} from "./EditorShengHuiFromWritingControls";
import type { Chapter, TuiyanPushedOutlineEntry } from "../../db/types";
import type { EditorPaperTint } from "../../util/editor-typography";
import type { RightRailTabId } from "../RightRailContext";
import { PLANNING_LEVEL_LABEL } from "../../util/tuiyan-planning";
import { wordCount } from "../../util/wordCount";
import {
  EDITOR_AUTO_WIDTH_KEY,
  EDITOR_DEFAULT_MAX_WIDTH_PX,
  EDITOR_WIDTH_KEY,
} from "../../util/editor-layout-prefs";

export interface EditorManuscriptFrameProps {
  // Layout
  editorPaperFrameStyle: React.CSSProperties;
  paperTint: EditorPaperTint;

  // Chapter / work identity
  activeChapter: Chapter | null;
  workId: string | null;
  activeId: string | null;

  // View mode
  outlineMode: boolean;
  selectedOutlineEntry: TuiyanPushedOutlineEntry | null;
  pushedOutlines: TuiyanPushedOutlineEntry[];

  // Chapter title editing
  chapterTitleEditing: boolean;
  setChapterTitleEditing: React.Dispatch<React.SetStateAction<boolean>>;
  chapterTitleDraft: string;
  setChapterTitleDraft: React.Dispatch<React.SetStateAction<string>>;
  saveChapterTitle: () => Promise<void>;

  // Paper width
  editorAutoWidth: boolean;
  editorMaxWidthPx: number;
  setEditorMaxWidthPx: (n: number) => void;
  setEditorAutoWidth: React.Dispatch<React.SetStateAction<boolean>>;
  widthDragRef: React.MutableRefObject<{ startX: number; startW: number } | null>;

  // Editor content
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  chapterWords: number;
  editorRef: React.RefObject<CodeMirrorEditorHandle | null>;
  getSelectedText: () => string;
  goShengHuiHandoff: (mode: "polish" | "rewrite") => void;

  // Toolbar: text actions
  copySelectionToClipboard: () => void;
  duplicateSelectionAfterCaret: () => void;

  // Find / replace bar toggle
  findOpen: boolean;
  setFindOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Book search
  bookSearchOpen: boolean;
  openBookSearch: () => void;
  closeBookSearch: () => void;

  // Snapshots
  setSnapshotOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleManualSnapshot: () => void;

  // Right rail
  rightRailOpen: boolean;
  rightRailActiveTab: string;
  toggleRightRailTab: (tab: RightRailTabId) => void;
  aiMaterialsBriefLines: string[];

  // More menu
  moreWrapRef: React.MutableRefObject<HTMLDivElement | null>;
  moreOpen: boolean;
  setMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Export
  exportChapterTxt: () => void;
  exportBookTxt: () => void;
  exportChapterDocx: () => void;
  exportBookDocx: () => void;

  // Chapter creation
  onNewChapter: () => void;

  /** 章纲 Tab：中间栏 CodeMirror；与章节正文分离，避免切 Tab 时抢同一 ref */
  outlineEditorRef: React.RefObject<CodeMirrorEditorHandle | null>;
  onOutlineContentChange: (content: string) => void;
}

/**
 * 正文区外框：内联工具栏 + 纸面（章节标题、CodeMirrorEditor、字数角）。
 * 对应原 editor-scroll / editor-xy-paper-stack 两层 div。
 */
export function EditorManuscriptFrame({
  editorPaperFrameStyle,
  paperTint,
  activeChapter,
  workId,
  activeId,
  outlineMode,
  selectedOutlineEntry,
  pushedOutlines,
  chapterTitleEditing,
  setChapterTitleEditing,
  chapterTitleDraft,
  setChapterTitleDraft,
  saveChapterTitle,
  editorAutoWidth,
  editorMaxWidthPx,
  setEditorMaxWidthPx,
  setEditorAutoWidth,
  widthDragRef,
  content,
  setContent,
  chapterWords,
  editorRef,
  getSelectedText,
  goShengHuiHandoff,
  copySelectionToClipboard,
  duplicateSelectionAfterCaret,
  findOpen,
  setFindOpen,
  bookSearchOpen,
  openBookSearch,
  closeBookSearch,
  setSnapshotOpen,
  handleManualSnapshot,
  rightRailOpen,
  rightRailActiveTab,
  toggleRightRailTab,
  aiMaterialsBriefLines,
  moreWrapRef,
  moreOpen,
  setMoreOpen,
  exportChapterTxt,
  exportBookTxt,
  exportChapterDocx,
  exportBookDocx,
  onNewChapter,
  outlineEditorRef,
  onOutlineContentChange,
}: EditorManuscriptFrameProps) {
  const cmTargetRef = outlineMode && selectedOutlineEntry ? outlineEditorRef : editorRef;
  const canUseBasicCm = outlineMode ? Boolean(selectedOutlineEntry) : Boolean(activeChapter);

  return (
    <div className="editor-scroll">
      <div className="editor-scroll-inner">
        <div className="editor-xy-paper-stack" style={editorPaperFrameStyle}>
          <div className="editor-xy-inline-toolbar" aria-label="正文快捷工具">
            <div className="editor-xy-inline-toolbar__left">
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="撤销"
                disabled={!canUseBasicCm}
                onClick={() => cmTargetRef.current?.undo()}
              >
                ↶
              </button>
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="重做"
                disabled={!canUseBasicCm}
                onClick={() => cmTargetRef.current?.redo()}
              >
                ↷
              </button>
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="复制选区"
                disabled={!canUseBasicCm}
                onClick={() => copySelectionToClipboard()}
              >
                ⧉
              </button>
              <EditorShengHuiToolbarMenu
                disabled={!workId || !activeChapter}
                onShengHui={goShengHuiHandoff}
              />
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="在光标后重复插入选区"
                disabled={!canUseBasicCm}
                onClick={() => duplicateSelectionAfterCaret()}
              >
                ⎘
              </button>
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="全选"
                disabled={!canUseBasicCm}
                onClick={() => cmTargetRef.current?.selectAll()}
              >
                ▣
              </button>
              <button
                type="button"
                className={cn("icon-btn editor-xy-inline-icon", findOpen && "is-on")}
                title="查找 / 替换"
                disabled={!activeChapter}
                onClick={() => setFindOpen((v) => !v)}
              >
                ⌕
              </button>
              <button
                type="button"
                className={cn("icon-btn editor-xy-inline-icon", bookSearchOpen && "is-on")}
                title="全书搜索"
                disabled={!activeChapter}
                onClick={() => (bookSearchOpen ? closeBookSearch() : openBookSearch())}
              >
                ⌁
              </button>
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="章节历史"
                disabled={!activeChapter}
                onClick={() => setSnapshotOpen(true)}
              >
                ⧗
              </button>
              <button
                type="button"
                className="icon-btn editor-xy-inline-icon"
                title="保存章节快照"
                disabled={!activeChapter}
                onClick={() => handleManualSnapshot()}
              >
                ⧈
              </button>
              <button
                type="button"
                className={cn(
                  "icon-btn editor-xy-inline-icon",
                  rightRailOpen && rightRailActiveTab === "ref" && "is-on",
                )}
                title="参考"
                disabled={!activeChapter}
                onClick={() => toggleRightRailTab("ref")}
              >
                ⌗
              </button>
              <HoverCard openDelay={90} closeDelay={120}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className="icon-btn editor-xy-inline-icon editor-xy-inline-icon--materials"
                    title="本次生成 · 使用材料（简版）"
                    disabled={!activeChapter}
                    aria-label="本次生成材料简报"
                  >
                    ▼
                  </button>
                </HoverCardTrigger>
                <HoverCardContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  className={cn(
                    "w-[min(420px,calc(100vw-2rem))] max-h-[min(70vh,480px)] overflow-y-auto border-border/60 bg-[var(--surface)] p-3 text-left text-[0.8125rem] leading-snug text-muted-foreground shadow-lg",
                  )}
                >
                  <p className="mb-2 mt-0 font-medium text-foreground">本次生成 · 使用材料（简版）</p>
                  {aiMaterialsBriefLines.length === 0 ? (
                    <p className="m-0 text-muted-foreground">等待右侧 AI 面板同步…</p>
                  ) : (
                    <ul className="m-0 list-disc space-y-1.5 pl-4 marker:text-muted-foreground">
                      {aiMaterialsBriefLines.map((line, i) => (
                        <li key={i} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </HoverCardContent>
              </HoverCard>
              <button
                type="button"
                className={cn(
                  "icon-btn editor-xy-inline-icon",
                  rightRailOpen && rightRailActiveTab === "ai" && "is-on",
                )}
                title="AI 侧栏"
                disabled={!activeChapter}
                onClick={() => toggleRightRailTab("ai")}
              >
                ✦
              </button>
            </div>
            <div className="editor-xy-inline-toolbar__right">
              <div className="toolbar-more-wrap" ref={moreWrapRef}>
                <button
                  type="button"
                  className="icon-btn editor-xy-inline-icon"
                  title="更多"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  ···
                </button>
                {moreOpen ? (
                  <div className="toolbar-more-menu" role="menu">
                    <div className="toolbar-menu-label">纯文本</div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        exportChapterTxt();
                      }}
                    >
                      导出本章 .txt
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        exportBookTxt();
                      }}
                    >
                      导出全书 .txt
                    </button>
                    <div className="toolbar-menu-label">Word</div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        exportChapterDocx();
                      }}
                    >
                      导出本章 .docx
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        exportBookDocx();
                      }}
                    >
                      导出全书 .docx
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div
            className="editor-paper card"
            role="region"
            aria-label="正文纸面"
            data-paper-tint={paperTint}
          >
            {outlineMode ? (
              selectedOutlineEntry ? (
                <>
                  <div className="editor-chapter-title" aria-label="当前章纲节点标题">
                    <span className="editor-chapter-title-text" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        className="inline-flex items-center rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10px] font-normal text-muted-foreground"
                      >
                        {PLANNING_LEVEL_LABEL[selectedOutlineEntry.level]}
                      </span>
                      {selectedOutlineEntry.title || "未命名"}
                    </span>
                  </div>
                  <CodeMirrorEditor
                    key={selectedOutlineEntry.id}
                    ref={outlineEditorRef}
                    className="editor-textarea cm6-editor editor-outline-cm"
                    value={selectedOutlineEntry.content ?? ""}
                    onChange={onOutlineContentChange}
                    ariaLabel="章纲节点内容"
                    placeholderText="在此编辑本节点正文（与推演页推送内容同步保存到本作品）"
                  />
                  <div className="editor-xy-wc-corner" title="章纲字数（计数字）">
                    {wordCount(selectedOutlineEntry.content ?? "").toLocaleString()}
                  </div>
                </>
              ) : (
                <div className="editor-xy-empty">
                  <div className="editor-xy-empty__card">
                    <p className="editor-xy-empty__title">
                      {pushedOutlines.length > 0 ? "请选择一个章纲节点" : "暂无推演章纲"}
                    </p>
                    <p className="editor-xy-empty__hint">
                      {pushedOutlines.length > 0
                        ? "在左侧章纲树中点击「总纲 / 大纲 / 卷纲 / 章细纲 / 详细细纲」任一节点即可查看内容。"
                        : "请到「推演」页生成规划后点击右侧「推送到写作章纲」。"}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <>
                {activeChapter ? (
                  <div className="editor-chapter-title" aria-label="当前章节标题">
                    {chapterTitleEditing ? (
                      <input
                        className="editor-chapter-title-text"
                        value={chapterTitleDraft}
                        autoFocus
                        onChange={(e) => setChapterTitleDraft(e.target.value)}
                        onBlur={() => void saveChapterTitle()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveChapterTitle();
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setChapterTitleDraft(activeChapter.title);
                            setChapterTitleEditing(false);
                          }
                        }}
                        aria-label="编辑章节标题"
                      />
                    ) : (
                      <button
                        type="button"
                        className="editor-chapter-title-text"
                        title="点击改标题"
                        onClick={() => {
                          setChapterTitleDraft(activeChapter.title);
                          setChapterTitleEditing(true);
                        }}
                        style={{ cursor: "text", background: "transparent", border: "none", padding: 0 }}
                      >
                        {activeChapter.title}
                      </button>
                    )}
                    {!editorAutoWidth ? (
                      <span className="editor-chapter-title-tools">
                        <button
                          type="button"
                          className="editor-width-reset"
                          title="恢复默认宽度（铺满中间栏）"
                          onClick={() => {
                            setEditorMaxWidthPx(EDITOR_DEFAULT_MAX_WIDTH_PX);
                            setEditorAutoWidth(true);
                            try {
                              localStorage.setItem(EDITOR_WIDTH_KEY, String(EDITOR_DEFAULT_MAX_WIDTH_PX));
                              localStorage.setItem(EDITOR_AUTO_WIDTH_KEY, "1");
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          默认
                        </button>
                        <span
                          className="editor-width-handle"
                          title="拖动调整正文宽度"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            widthDragRef.current = { startX: e.clientX, startW: editorMaxWidthPx };
                          }}
                        >
                          ↔
                        </span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {activeChapter ? (
                  <EditorShengHuiContextSurface
                    enabled={Boolean(workId && activeId && !outlineMode)}
                    getSelectedText={getSelectedText}
                    onShengHui={goShengHuiHandoff}
                  >
                    <CodeMirrorEditor
                      key={activeChapter.id}
                      ref={editorRef}
                      className="editor-textarea cm6-editor"
                      value={content}
                      onChange={setContent}
                      ariaLabel="正文编辑器"
                      placeholderText="请输入章节内容"
                    />
                  </EditorShengHuiContextSurface>
                ) : (
                  <div className="editor-xy-empty">
                    <div className="editor-xy-empty__card">
                      <p className="editor-xy-empty__title">请选择或新建章节</p>
                      <p className="editor-xy-empty__hint">在左侧目录中选一章，或使用下方按钮新建。</p>
                      <Button type="button" className="editor-xy-empty__cta" onClick={onNewChapter}>
                        + 新建章节
                      </Button>
                    </div>
                  </div>
                )}
                {activeChapter ? (
                  <div className="editor-xy-wc-corner" title="本章字数">
                    {chapterWords.toLocaleString()}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
