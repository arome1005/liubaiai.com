import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { getTuiyanState } from "../db/repo";

/**
 * 从「推演」文策导入到生辉「大纲与文策」框。
 */
export function useShengHuiTuiyanOutlineImport(
  workId: string | null,
  chapterId: string | null,
  setOutline: Dispatch<SetStateAction<string>>,
) {
  const [tuiyanImporting, setTuiyanImporting] = useState(false);
  const inFlightRef = useRef(false);

  const importFromTuiyan = useCallback(async () => {
    if (!workId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setTuiyanImporting(true);
    try {
      const state = await getTuiyanState(workId);
      if (!state) {
        toast.info("该作品尚无推演记录。");
        return;
      }
      const entries = state.wenCe.filter((w) => {
        if (!chapterId) return true;
        return !w.relatedOutlineId || w.relatedOutlineId === chapterId;
      });
      if (!entries.length) {
        toast.info("推演中暂无文策条目。");
        return;
      }
      const lines = entries.map((w) => {
        const prefix =
          w.type === "decision"
            ? "【决策】"
            : w.type === "revision"
              ? "【修订】"
              : w.type === "milestone"
                ? "【里程碑】"
                : w.type === "ai_suggestion"
                  ? "【AI建议】"
                  : "【备注】";
        return `${prefix} ${w.title}\n${w.content.trim()}`;
      });
      const imported = lines.join("\n\n");
      setOutline((prev) => (prev.trim() ? `${prev.trim()}\n\n──────\n${imported}` : imported));
    } finally {
      inFlightRef.current = false;
      setTuiyanImporting(false);
    }
  }, [chapterId, setOutline, workId]);

  return { tuiyanImporting, importFromTuiyan };
}
