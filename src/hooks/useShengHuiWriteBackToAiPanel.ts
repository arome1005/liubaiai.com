import { useCallback, useState } from "react";
import { writeAiPanelDraftWithHistory } from "../util/ai-panel-draft";

/**
 * 生辉主稿「写回写作侧栏草稿」+ 入草稿历史（F3）。
 */
export function useShengHuiWriteBackToAiPanel(
  workId: string | null,
  chapterId: string | null,
  output: string,
) {
  const [writeBackStatus, setWriteBackStatus] = useState<null | "ok" | "error">(null);
  const [writeBackError, setWriteBackError] = useState("");

  const handleWriteBack = useCallback(() => {
    if (!workId || !chapterId || !output.trim()) return;
    const result = writeAiPanelDraftWithHistory(workId, chapterId, output.trim());
    if (result.ok) {
      setWriteBackStatus("ok");
      setWriteBackError("");
      setTimeout(() => setWriteBackStatus(null), 4000);
    } else {
      setWriteBackStatus("error");
      setWriteBackError(result.error);
    }
  }, [chapterId, output, workId]);

  return { writeBackStatus, writeBackError, handleWriteBack };
}
