import { useEffect, useState } from "react";
import { listAllReferenceExcerpts } from "../db/repo";
import type { ReferenceExcerpt } from "../db/types";

type InspirationItem = ReferenceExcerpt & { refTitle: string; tagIds: string[] };

export interface UseEditorInspirationListReturn {
  inspirationList: InspirationItem[];
  setInspirationList: React.Dispatch<React.SetStateAction<InspirationItem[]>>;
}

/**
 * 灵感便签（参考摘录）列表加载：
 * - 切书时全量拉取一次
 * - 灵感面板打开时再刷新一次（用户可能在他处编辑过）
 *
 * 行为与原 `EditorPage.tsx` 内联两个 effect 一致。
 */
export function useEditorInspirationList(
  workId: string | null,
  inspirationOpen: boolean,
): UseEditorInspirationListReturn {
  const [inspirationList, setInspirationList] = useState<InspirationItem[]>([]);

  useEffect(() => {
    if (!workId) return;
    void listAllReferenceExcerpts().then(setInspirationList);
  }, [workId]);

  useEffect(() => {
    if (!inspirationOpen || !workId) return;
    void listAllReferenceExcerpts().then(setInspirationList);
  }, [inspirationOpen, workId]);

  return { inspirationList, setInspirationList };
}
