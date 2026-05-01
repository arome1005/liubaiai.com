import { useEffect, useRef, useState } from "react";
import { getChapterBible, upsertChapterBible } from "../db/repo";

export interface ChapterBibleFields {
  goalText: string;
  forbidText: string;
  povText: string;
  sceneStance: string;
  /** §11 步 21：本章人物状态备忘 */
  characterStateText: string;
}

interface CbState {
  goal: string;
  forbid: string;
  pov: string;
  scene: string;
  characterState: string;
}

export interface UseEditorChapterBibleSyncParams {
  activeId: string | null;
  workId: string | null;
  activeIdRef: React.MutableRefObject<string | null>;
}

export interface UseEditorChapterBibleSyncReturn {
  chapterBibleFields: ChapterBibleFields;
  setChapterBibleFields: React.Dispatch<React.SetStateAction<ChapterBibleFields>>;
  /** switchChapter 离开章节时需要快照当前 bible 写入持久层；保留 ref 供旁路读取 */
  cbStateRef: React.MutableRefObject<CbState>;
}

/**
 * 章节 bible 五字段：
 * 1. 业务态 + ref 镜像（cbStateRef，供切换/保存时读取最新值）
 * 2. activeId 变化 → 加载远端值，置入 state，并设置「跳过下一次保存」哨兵
 * 3. state 变化 → 500ms 防抖写入持久层（首次加载与未就绪时跳过）
 */
export function useEditorChapterBibleSync({
  activeId,
  workId,
  activeIdRef,
}: UseEditorChapterBibleSyncParams): UseEditorChapterBibleSyncReturn {
  const [chapterBibleFields, setChapterBibleFields] = useState<ChapterBibleFields>({
    goalText: "",
    forbidText: "",
    povText: "",
    sceneStance: "",
    characterStateText: "",
  });

  const cbStateRef = useRef<CbState>({ goal: "", forbid: "", pov: "", scene: "", characterState: "" });
  const cbSkipSaveRef = useRef(true);
  const cbReadyForChapterRef = useRef<string | null>(null);

  useEffect(() => {
    cbStateRef.current = {
      goal: chapterBibleFields.goalText,
      forbid: chapterBibleFields.forbidText,
      pov: chapterBibleFields.povText,
      scene: chapterBibleFields.sceneStance,
      characterState: chapterBibleFields.characterStateText,
    };
  }, [chapterBibleFields]);

  useEffect(() => {
    if (!activeId || !workId) return;
    cbSkipSaveRef.current = true;
    cbReadyForChapterRef.current = null;
    void getChapterBible(activeId).then((row) => {
      if (activeIdRef.current !== activeId) return;
      setChapterBibleFields({
        goalText: row?.goalText ?? "",
        forbidText: row?.forbidText ?? "",
        povText: row?.povText ?? "",
        sceneStance: row?.sceneStance ?? "",
        characterStateText: row?.characterStateText ?? "",
      });
      cbReadyForChapterRef.current = activeId;
      window.setTimeout(() => {
        if (activeIdRef.current === activeId) cbSkipSaveRef.current = false;
      }, 0);
    });
  }, [activeId, workId, activeIdRef]);

  useEffect(() => {
    if (!activeId || !workId) return;
    if (cbSkipSaveRef.current) return;
    if (cbReadyForChapterRef.current !== activeId) return;
    const t = window.setTimeout(() => {
      void upsertChapterBible({
        chapterId: activeId,
        workId,
        goalText: chapterBibleFields.goalText,
        forbidText: chapterBibleFields.forbidText,
        povText: chapterBibleFields.povText,
        sceneStance: chapterBibleFields.sceneStance,
        characterStateText: chapterBibleFields.characterStateText,
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [chapterBibleFields, activeId, workId]);

  return { chapterBibleFields, setChapterBibleFields, cbStateRef };
}
