import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { Chapter, ReferenceSearchHit, Work } from "../../db/types";
import type { WritingRagSources } from "../../util/work-rag-runtime";
import { runAiPanelRagPreview } from "./runAiPanelRagPreview";

interface UseAiPanelRagSessionArgs {
  workId: string;
  work: Work;
  chapters: Chapter[];
  activeChapterId: string | null;
  /** 来自 workRagInjectDefaults，由父级管理 */
  ragK: number;
  /** 来自 workRagInjectDefaults，由父级管理 */
  ragWorkSources: WritingRagSources;
  /** 失败时写入 useAiPanelRunState 暴露的 setError */
  setError: (msg: string | null) => void;
}

export interface AiPanelRagSession {
  /** 本次检索关键词；空串表示未填 */
  ragQuery: string;
  /** 写关键词。同一调用内会同步清空 `ragExcluded`（与原 effect 行为一致） */
  setRagQuery: (next: string) => void;
  /** 命中片段（含被用户单独取消注入的） */
  ragHits: ReferenceSearchHit[];
  /** 提供给 useAiPanelContextAssembly：在真实请求前再跑一次时写入命中 */
  setRagHits: Dispatch<SetStateAction<ReferenceSearchHit[]>>;
  ragLoading: boolean;
  /** 提供给 useAiPanelContextAssembly：包住其内部的检索阶段 */
  setRagLoading: Dispatch<SetStateAction<boolean>>;
  /** 用户单独取消的 chunkId 集合；切 query 时自动清空 */
  ragExcluded: ReadonlySet<string>;
  setRagExcluded: Dispatch<SetStateAction<ReadonlySet<string>>>;
  /** 「检索预览」按钮绑定 */
  runRagPreview: () => void;
}

/**
 * 写作侧栏「检索增强（本次）」会话状态：
 * - 关键词 / 命中 / 加载中 / 单条排除 集合
 * - 切关键词时自动清空 ragExcluded
 * - 暴露 runRagPreview，与 `AiPanelRagSection` 内联逻辑一致（委托 `runAiPanelRagPreview`）
 *
 * 不接管「真实请求」内部的 RAG 检索（那条路径在 `useAiPanelContextAssembly` 内，
 * 通过本 hook 暴露的 setRagHits/setRagLoading 写回，UI 仍然实时刷新）。
 */
export function useAiPanelRagSession(args: UseAiPanelRagSessionArgs): AiPanelRagSession {
  const { workId, work, chapters, activeChapterId, ragK, ragWorkSources, setError } = args;

  const [ragQuery, setRagQueryRaw] = useState("");
  const [ragHits, setRagHits] = useState<ReferenceSearchHit[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragExcluded, setRagExcluded] = useState<ReadonlySet<string>>(new Set());

  /**
   * 换关键词时同步清空单条排除集合。
   * 调用方只是在用户改输入值时调用 setter（受控 input 的 onChange），
   * 与原 `useEffect(..., [ragQuery])` 在实际触发时机上等价；
   * 合并写以避免 effect 内 setState 触发的级联渲染告警。
   */
  const setRagQuery = useCallback((next: string) => {
    setRagQueryRaw(next);
    setRagExcluded(new Set());
  }, []);

  const runRagPreview = useCallback(() => {
    void runAiPanelRagPreview({
      workId,
      work,
      chapters,
      activeChapterId,
      ragQuery,
      ragK,
      ragWorkSources,
      setRagHits,
      setRagLoading,
      setError,
    });
  }, [workId, work, chapters, activeChapterId, ragQuery, ragK, ragWorkSources, setError]);

  return {
    ragQuery,
    setRagQuery,
    ragHits,
    setRagHits,
    ragLoading,
    setRagLoading,
    ragExcluded,
    setRagExcluded,
    runRagPreview,
  };
}
