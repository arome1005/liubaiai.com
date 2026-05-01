import React from "react";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import type { ChapterBibleFields } from "../../hooks/useEditorChapterBibleSync";

interface EditorChapterConstraintsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterBibleFields: ChapterBibleFields;
  setChapterBibleFields: React.Dispatch<React.SetStateAction<ChapterBibleFields>>;
}

/**
 * 章节本地约束弹窗（护栏/检查清单）。
 * 对应原 EditorPage 里内联的 <Dialog open={chapterConstraintsOpen}> 块。
 */
export function EditorChapterConstraintsDialog({
  open,
  onOpenChange,
  chapterBibleFields,
  setChapterBibleFields,
}: EditorChapterConstraintsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="work-form-modal-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "z-[var(--z-modal-app-content)] max-h-[min(92vh,920px)] w-full max-w-[min(720px,100vw-2rem)] gap-0 overflow-hidden border-border bg-[var(--surface)] p-0 shadow-lg",
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <DialogTitle className="text-left text-lg font-semibold">本章约束（可选）</DialogTitle>
          <button type="button" className="icon-btn" title="关闭" onClick={() => onOpenChange(false)}>
            ×
          </button>
        </DialogHeader>
        <div className="p-4 sm:p-5" style={{ overflow: "auto" }}>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.55 }}>
            这块是"护栏/检查清单"，不想填就留空；你也可以直接把这些写进右侧「细纲/剧情」。
          </p>
          <div className="sidebar-chapter-bible" style={{ padding: 0, border: "none" }}>
            <label className="sidebar-bible-field">
              <span>本章目标</span>
              <textarea
                value={chapterBibleFields.goalText}
                onChange={(e) => setChapterBibleFields((p) => ({ ...p, goalText: e.target.value }))}
                rows={2}
                placeholder="这一章要达成什么（节拍/信息点/情绪目标）"
              />
            </label>
            <label className="sidebar-bible-field">
              <span>禁止出现</span>
              <textarea
                value={chapterBibleFields.forbidText}
                onChange={(e) => setChapterBibleFields((p) => ({ ...p, forbidText: e.target.value }))}
                rows={2}
                placeholder="明确不要写什么（禁词/禁设定/禁走向）"
              />
            </label>
            <label className="sidebar-bible-field">
              <span>视角 / 口吻</span>
              <textarea
                value={chapterBibleFields.povText}
                onChange={(e) => setChapterBibleFields((p) => ({ ...p, povText: e.target.value }))}
                rows={2}
                placeholder="第一/第三人称、叙述风格、语气"
              />
            </label>
            <label className="sidebar-bible-field">
              <span>场景状态</span>
              <textarea
                value={chapterBibleFields.sceneStance}
                onChange={(e) => setChapterBibleFields((p) => ({ ...p, sceneStance: e.target.value }))}
                rows={2}
                placeholder="地点/时间/天气/站位/持物/出口等"
              />
            </label>
            <label className="sidebar-bible-field">
              <span>本章人物状态</span>
              <textarea
                value={chapterBibleFields.characterStateText}
                onChange={(e) =>
                  setChapterBibleFields((p) => ({ ...p, characterStateText: e.target.value }))
                }
                rows={3}
                placeholder="人物伤势/情绪/关系变化/任务进度等（会注入 AI 上下文）"
              />
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
