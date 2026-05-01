import { useEffect } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import type { TopbarApi } from "../components/TopbarContext";
import type { Chapter, Work } from "../db/types";
import type { StudyLibraryTab } from "../components/study/StudyLibraryDialog";
import type { BgSaveIssue, SaveState } from "./useEditorPersist";
import { workPathSegment } from "../util/work-url";

export interface UseEditorTopbarMountParams {
  topbar: TopbarApi;
  work: Work | null;
  workId: string | null;
  activeChapter: Chapter | null;
  chapters: Chapter[];
  aiOpen: boolean;
  setAiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  canAiDrawCard: boolean;
  editorAutoWidth: boolean;
  setEditorAutoWidth: React.Dispatch<React.SetStateAction<boolean>>;
  saveState: SaveState;
  bgSaveIssue: BgSaveIssue | null;
  setBgSaveIssue: (v: BgSaveIssue | null) => void;
  rightRailOpen: boolean;
  rightRailActiveTab: string;
  setRightRailActiveTab: (id: "ai" | "summary" | "bible" | "ref") => void;
  setRightRailOpen: (open: boolean) => void;
  setAiContinueRunTick: React.Dispatch<React.SetStateAction<number>>;
  setAiDrawRunTick: React.Dispatch<React.SetStateAction<number>>;
  setStudyLibraryTab: (t: StudyLibraryTab) => void;
  setStudyLibraryOpen: (v: boolean) => void;
  navigate: NavigateFunction;
  handleManualSnapshot: () => Promise<void> | void;
  handleResolveSaveConflict: () => Promise<void> | void;
  switchChapter: (id: string) => Promise<void>;
}

/**
 * 把编辑页的「写作工具栏」（pills + 保存状态条）注入全局 Topbar 中央槽。
 * - work 为空时清空标题；其余字段缺失时各 Button 通过 disabled 控制可用性，与原行为完全一致。
 * - 卸载时清空三个 setNode（保留原始顺序）。
 *
 * 风险点（与原实现一致）：
 * - 依赖数组保留原 EditorPage 中的列表（含 rightRail.open / rightRail.activeTab，
 *   即便 JSX 不直接读这两个值，原代码也把它们列进 deps，本 hook 保持一致以避免闪烁差异）。
 * - eslint-disable 同原文件保留：chapters.length / navigate / setBgSaveIssue 不在 deps 中
 *   是 EditorPage 一直以来的现状，不在本次重构范围内修复。
 */
export function useEditorTopbarMount(p: UseEditorTopbarMountParams): void {
  const {
    topbar,
    work,
    workId,
    activeChapter,
    chapters,
    aiOpen,
    setAiOpen,
    canAiDrawCard,
    editorAutoWidth,
    setEditorAutoWidth,
    saveState,
    bgSaveIssue,
    setBgSaveIssue,
    setRightRailActiveTab,
    setRightRailOpen,
    setAiContinueRunTick,
    setAiDrawRunTick,
    setStudyLibraryTab,
    setStudyLibraryOpen,
    navigate,
    handleManualSnapshot,
    handleResolveSaveConflict,
    switchChapter,
    rightRailOpen,
    rightRailActiveTab,
  } = p;

  useEffect(() => {
    if (!work) {
      topbar.setTitleNode(null);
      return;
    }
    topbar.setTitleNode(
      <span className="editor-xy-work-title" title={work.title}>
        {work.title}
      </span>,
    );
    topbar.setCenterNode(
      <div className="editor-xy-center-stack">
        <div className="editor-xy-pills-scroller">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            onClick={() => void handleManualSnapshot()}
          >
            保存
          </Button>
          <Button
            type="button"
            variant={aiOpen ? "default" : "outline"}
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            onClick={() => {
              setAiOpen((v) => {
                const next = !v;
                setRightRailActiveTab("ai");
                setRightRailOpen(next);
                return next;
              });
            }}
          >
            AI写作
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!activeChapter}
            title="打开 AI 侧栏并以续写模式生成；结果在侧栏草稿框，确认后再插入正文"
            onClick={() => {
              setAiOpen(true);
              setRightRailActiveTab("ai");
              setRightRailOpen(true);
              setAiContinueRunTick((n) => n + 1);
            }}
          >
            AI续写
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={!canAiDrawCard}
            title="打开 AI 侧栏并以抽卡模式生成"
            onClick={() => {
              setAiOpen(true);
              setRightRailActiveTab("ai");
              setRightRailOpen(true);
              setAiDrawRunTick((n) => n + 1);
            }}
          >
            抽卡
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="editor-xy-pill"
                disabled={!activeChapter}
                title="书斋：整书人物 / 词条资产库"
              >
                书斋
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[12rem]">
              <DropdownMenuItem
                disabled={!activeChapter}
                onClick={() => {
                  if (!activeChapter) return;
                  setStudyLibraryTab("characters");
                  setStudyLibraryOpen(true);
                }}
              >
                人物库
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!activeChapter}
                onClick={() => {
                  if (!activeChapter) return;
                  setStudyLibraryTab("terms");
                  setStudyLibraryOpen(true);
                }}
              >
                词条库
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to={workId && work ? `/work/${workPathSegment(work)}/bible` : "#"}
                  onClick={(e) => !workId && e.preventDefault()}
                >
                  打开锦囊页
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            disabled={chapters.length === 0}
            title="重塑分析（独立全屏页）"
            onClick={() => {
              if (!workId) return;
              const seg = work ? workPathSegment(work) : workId;
              navigate(`/work/${seg}/reshape`);
            }}
          >
            重塑
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="editor-xy-pill"
            onClick={() => setEditorAutoWidth((v) => !v)}
          >
            {editorAutoWidth ? "宽度：自适应" : "宽度：自定义"}
          </Button>
        </div>
        {saveState === "saving" || saveState === "error" || saveState === "conflict" || bgSaveIssue ? (
          <div className="editor-xy-stats-line">
            {saveState === "saving" || saveState === "error" || saveState === "conflict" ? (
              <span className={`save-pill save-${saveState}`} title="保存状态">
                {saveState === "saving" && "保存中"}
                {saveState === "error" && "保存失败"}
                {saveState === "conflict" && (
                  <>
                    保存冲突
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="save-conflict-reload"
                      onClick={() => void handleResolveSaveConflict()}
                    >
                      重新载入本章
                    </Button>
                  </>
                )}
              </span>
            ) : null}
            {bgSaveIssue ? (
              <span className="editor-xy-bg-save-issue" title="离开该章时后台写入未成功；可打开该章后重试同步">
                「{bgSaveIssue.title}」{bgSaveIssue.kind === "conflict" ? "离章保存冲突" : "离章保存失败"}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="editor-xy-bg-save-issue__btn"
                  onClick={() => void switchChapter(bgSaveIssue.chapterId)}
                >
                  打开该章
                </Button>
                <button type="button" className="editor-xy-bg-save-issue__dismiss" onClick={() => setBgSaveIssue(null)}>
                  忽略
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>,
    );
    topbar.setActionsNode(null);
    return () => {
      topbar.setTitleNode(null);
      topbar.setCenterNode(null);
      topbar.setActionsNode(null);
    };
    // 与原 EditorPage 中的 deps 完全一致；chapters.length / navigate / setBgSaveIssue 等
    // 是 EditorPage 既有的 exhaustive-deps 警告，按「不改行为」原则原样保留。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    topbar,
    work,
    workId,
    saveState,
    activeChapter,
    aiOpen,
    canAiDrawCard,
    editorAutoWidth,
    rightRailOpen,
    rightRailActiveTab,
    setRightRailActiveTab,
    setRightRailOpen,
    handleResolveSaveConflict,
    handleManualSnapshot,
    bgSaveIssue,
    switchChapter,
  ]);
}
