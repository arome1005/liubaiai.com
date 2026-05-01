import type { Dispatch, SetStateAction } from "react";
import type { Chapter, ReferenceSearchHit, Work } from "../../db/types";
import { exportBibleMarkdown } from "../../db/repo";
import { searchWritingRagMerged, type WritingRagSources } from "../../util/work-rag-runtime";

/** 供父组件绑定「检索预览」按钮：保持与原 `AiPanel` 内联逻辑一致 */
export async function runAiPanelRagPreview(args: {
  workId: string;
  work: Work;
  chapters: Chapter[];
  activeChapterId: string | null;
  ragQuery: string;
  ragK: number;
  ragWorkSources: WritingRagSources;
  setRagHits: Dispatch<SetStateAction<ReferenceSearchHit[]>>;
  setRagLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
}): Promise<void> {
  const q = args.ragQuery.trim();
  if (!q) return;
  args.setRagLoading(true);
  try {
    let bibleOverride = "";
    if (args.ragWorkSources.workBibleExport) {
      try {
        bibleOverride = await exportBibleMarkdown(args.workId);
      } catch {
        bibleOverride = "";
      }
    }
    const hits = await searchWritingRagMerged({
      workId: args.workId,
      query: q,
      limit: Math.max(1, Math.min(20, args.ragK)),
      sources: args.ragWorkSources,
      chapters: args.chapters,
      progressCursorChapterId: args.work.progressCursor,
      excludeManuscriptChapterId: args.activeChapterId,
      bibleMarkdownOverride: bibleOverride.trim() ? bibleOverride : undefined,
    });
    args.setRagHits(hits);
  } catch (e) {
    args.setError(e instanceof Error ? e.message : "检索失败");
  } finally {
    args.setRagLoading(false);
  }
}
