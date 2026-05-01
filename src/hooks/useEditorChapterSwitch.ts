import { useCallback } from "react";
import { addChapterSnapshot, upsertChapterBible } from "../db/repo";
import type { Chapter } from "../db/types";
import { wordCount } from "../util/wordCount";

interface BgSaveIssue {
  chapterId: string;
  title: string;
  kind: "error" | "conflict";
}

export interface UseEditorChapterSwitchParams {
  activeId: string | null;
  workId: string | null;
  content: string;
  chapters: Chapter[];
  setActiveId: (id: string) => void;
  setContent: (s: string) => void;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setBgSaveIssue: (v: BgSaveIssue | null) => void;
  lastPersistedRef: React.MutableRefObject<Map<string, string>>;
  chapterTitleRef: React.MutableRefObject<Map<string, string>>;
  cbStateRef: React.MutableRefObject<{
    goal: string;
    forbid: string;
    pov: string;
    scene: string;
    characterState: string;
  }>;
  enqueueChapterPersist: (task: () => Promise<unknown>) => Promise<unknown>;
  runPersistChapter: (
    chapterId: string,
    text: string,
    mode: "active" | "silent",
  ) => Promise<boolean>;
}

export type SwitchChapterFn = (nextId: string) => Promise<void>;

/**
 * 章节切换：
 * 1) 同章不动；不同章 → 立即把离开章 content 同步到 chapters cache（避免列表上读到旧值）
 * 2) 立即切换 activeId / content（UI 无延迟）
 * 3) 离开章用 enqueue 串行：runPersistChapter → addChapterSnapshot → upsertChapterBible（按当时 cbStateRef 快照）
 *    任一异步失败置 bgSaveIssue（章节 toolbar 红角标可见）
 *
 * 风险点（与原实现保持一致）：
 * - 离开期间用户改了同一章的 cbStateRef，会被在 ⓒbible 落盘前覆盖；这个边界由 useEditorChapterBibleSync 的 skipSave/ready 哨兵协调。
 * - persistContent 由 useEditorPersist 内部的乐观锁兜底；这里只负责入队。
 */
export function useEditorChapterSwitch(p: UseEditorChapterSwitchParams): SwitchChapterFn {
  return useCallback(
    async (nextId: string) => {
      if (p.activeId && p.activeId !== nextId) {
        const leaveId = p.activeId;
        const leaveText = p.content;
        const wid = p.workId;
        const bible = { ...p.cbStateRef.current };
        const ch = p.chapters.find((c) => c.id === nextId);
        const nextBody = ch?.content ?? "";
        p.setChapters((prev) =>
          prev.map((c) =>
            c.id === leaveId ? { ...c, content: leaveText, wordCountCache: wordCount(leaveText) } : c,
          ),
        );
        p.setActiveId(nextId);
        p.setContent(nextBody);
        p.lastPersistedRef.current.set(nextId, nextBody);
        const titleForErr = p.chapterTitleRef.current.get(leaveId) ?? "未命名章节";
        void p.enqueueChapterPersist(async () => {
          const ok = await p.runPersistChapter(leaveId, leaveText, "silent");
          if (!ok) return;
          try {
            await addChapterSnapshot(leaveId, leaveText);
          } catch {
            p.setBgSaveIssue({ chapterId: leaveId, title: titleForErr, kind: "error" });
            return;
          }
          if (wid) {
            try {
              await upsertChapterBible({
                chapterId: leaveId,
                workId: wid,
                goalText: bible.goal,
                forbidText: bible.forbid,
                povText: bible.pov,
                sceneStance: bible.scene,
                characterStateText: bible.characterState,
              });
            } catch {
              p.setBgSaveIssue({ chapterId: leaveId, title: titleForErr, kind: "error" });
            }
          }
        });
        return;
      }
      const chNext = p.chapters.find((c) => c.id === nextId);
      p.setActiveId(nextId);
      const nextBodyOnly = chNext?.content ?? "";
      p.setContent(nextBodyOnly);
      p.lastPersistedRef.current.set(nextId, nextBodyOnly);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.activeId, p.chapters, p.content, p.enqueueChapterPersist, p.runPersistChapter, p.workId],
  );
}
