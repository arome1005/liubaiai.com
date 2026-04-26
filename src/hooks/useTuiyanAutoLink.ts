/**
 * 推演节点 chip 自动入库 hook。
 *
 * 职责：
 * - 维护「生成即入库」开关（localStorage 持久化）
 * - 包装 fire-and-forget 的 autoLinkChipsFromNodes 调用
 * - 调用成功后递增 chipLibRefreshKey，触发 StructuredMetaChips 内部
 *   useNodeChipLibrary 重新拉取人物/词条库
 * - 用 toast 提示自动入库结果（成功/失败）
 *
 * 用法（V0TuiyanPage）：
 *   const { autoLinkEnabled, toggleAutoLink, runAutoLink, chipLibRefreshKey } =
 *     useTuiyanAutoLink(workId);
 *   // 生成完节点后：runAutoLink([{ summary, structuredMeta, level, nodeId }, ...]);
 */
import { useCallback, useState } from "react";
import { autoLinkChipsFromNodes, type AutoLinkItem } from "../util/tuiyan-chip-autolink";
import { useToast } from "../components/ui/use-toast";

const LS_AUTOLINK_KEY = "liubai:tuiyan:autoLink:v1";

function readAutoLinkEnabled(): boolean {
  try {
    return localStorage.getItem(LS_AUTOLINK_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeAutoLinkEnabled(v: boolean): void {
  try {
    localStorage.setItem(LS_AUTOLINK_KEY, String(v));
  } catch {
    /* ignore */
  }
}

export type UseTuiyanAutoLinkResult = {
  /** 当前是否启用「生成即入库」 */
  autoLinkEnabled: boolean;
  /** 切换开关 */
  toggleAutoLink: () => void;
  /** 入库一批节点（fire-and-forget；自动 toast；自动 bump refreshKey） */
  runAutoLink: (items: AutoLinkItem[]) => void;
  /** chip 库刷新计数器（每次成功入库后 +1） */
  chipLibRefreshKey: number;
};

export function useTuiyanAutoLink(workId: string | null | undefined): UseTuiyanAutoLinkResult {
  const { toast } = useToast();
  const [autoLinkEnabled, setAutoLinkEnabled] = useState<boolean>(() => readAutoLinkEnabled());
  const [chipLibRefreshKey, setChipLibRefreshKey] = useState(0);

  const toggleAutoLink = useCallback(() => {
    setAutoLinkEnabled((prev) => {
      const next = !prev;
      writeAutoLinkEnabled(next);
      return next;
    });
  }, []);

  const runAutoLink = useCallback(
    (items: AutoLinkItem[]) => {
      if (!autoLinkEnabled || !workId) return;
      autoLinkChipsFromNodes(workId, items)
        .then(({ characters, terms }) => {
          setChipLibRefreshKey((k) => k + 1);
          if (characters > 0 || terms > 0) {
            const parts: string[] = [];
            if (characters > 0) parts.push(`人物 ${characters} 个`);
            if (terms > 0) parts.push(`词条 ${terms} 个`);
            toast({ title: "自动入库完成", description: parts.join(" · ") });
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[autoLink]", err);
          toast({
            title: "自动入库失败",
            description: err instanceof Error ? err.message : "未知错误",
            variant: "destructive",
          });
        });
    },
    [autoLinkEnabled, workId, toast],
  );

  return { autoLinkEnabled, toggleAutoLink, runAutoLink, chipLibRefreshKey };
}
