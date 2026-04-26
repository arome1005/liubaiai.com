import { useCallback, useState } from "react";
import {
  loadChapterOutlineSource,
  reduceOnManualEdit,
  reduceOnOutlinePull,
  saveChapterOutlineSource,
  type OutlineSource,
} from "../../util/chapter-outline-source-storage";

export type { OutlineSource } from "../../util/chapter-outline-source-storage";

export const OUTLINE_SOURCE_LABEL: Record<OutlineSource, string> = {
  outline_pull: "章纲拉取",
  manual_paste: "手动粘贴",
  mixed: "混合（章纲拉取 + 手动）",
  unknown: "未指定",
};

/**
 * 跟踪「本章细纲 / 剧情构思」内容的来源，并按章持久化。
 * - 切章时从 storage 读取上次记录
 * - 用户手动键入 → markManual()
 * - 收到「从章纲拉取」事件 → markPull()
 *
 * 仅用于弹窗副信息提示，不影响请求逻辑。
 */
function readSource(workId: string, chapterId: string | null): OutlineSource {
  if (!workId || !chapterId) return "unknown";
  return loadChapterOutlineSource(workId, chapterId);
}

export function useOutlineSource(workId: string, chapterId: string | null): {
  source: OutlineSource;
  markManual: () => void;
  markPull: () => void;
} {
  const currentKey = `${workId}::${chapterId ?? ""}`;
  const [source, setSource] = useState<OutlineSource>(() => readSource(workId, chapterId));
  // 「换章节时重置」：useState 跟踪上一次 key，render 中检测变化即重置 source
  // 这是 React 推荐写法（替代 useEffect+setState，避免 cascading render）
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setSource(readSource(workId, chapterId));
  }

  const markManual = useCallback(() => {
    if (!workId || !chapterId) return;
    setSource((prev) => {
      const next = reduceOnManualEdit(prev);
      if (next !== prev) saveChapterOutlineSource(workId, chapterId, next);
      return next;
    });
  }, [workId, chapterId]);

  const markPull = useCallback(() => {
    if (!workId || !chapterId) return;
    setSource((prev) => {
      const next = reduceOnOutlinePull(prev);
      if (next !== prev) saveChapterOutlineSource(workId, chapterId, next);
      return next;
    });
  }, [workId, chapterId]);

  return { source, markManual, markPull };
}
