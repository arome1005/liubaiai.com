import type { SceneStateCard } from "../ai/sheng-hui-generate";
import type { ShengHuiRightPanelTab } from "../components/sheng-hui/sheng-hui-right-panel-types";
import type { Chapter, Work, WorkStyleCard } from "../db/types";
import type { ShengHuiSnapshotBucket } from "../util/sheng-hui-snapshots";
import type { Dispatch, SetStateAction } from "react";

/**
 * `useShengHuiPageDataEffects` 及其子 hook 共享的入参；保持页面与数据副作用边界清晰时一次性传入。
 */
export type ShengHuiPageDataEffectArgs = {
  refreshWorks: () => Promise<Work[]>;
  workId: string | null;
  chapterId: string | null;
  setWork: Dispatch<SetStateAction<Work | null>>;
  setStyleCard: Dispatch<SetStateAction<WorkStyleCard | undefined>>;
  setChapters: Dispatch<SetStateAction<Chapter[]>>;
  setChapterId: Dispatch<SetStateAction<string | null>>;
  setWorkId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  loading: boolean;
  outline: string;
  outlineHydrated: boolean;
  setOutline: Dispatch<SetStateAction<string>>;
  setOutlineHydrated: Dispatch<SetStateAction<boolean>>;
  canInjectWorkMeta: boolean;
  includeSettingIndex: boolean;
  setIncludeSettingIndex: Dispatch<SetStateAction<boolean>>;
  setSettingIndexText: Dispatch<SetStateAction<string>>;
  setSettingIndexLoading: Dispatch<SetStateAction<boolean>>;
  sceneState: SceneStateCard;
  setSceneState: Dispatch<SetStateAction<SceneStateCard>>;
  setSnapshotBucket: Dispatch<SetStateAction<ShengHuiSnapshotBucket>>;
  setOutput: Dispatch<SetStateAction<string>>;
  setSelectedSnapshotId: Dispatch<SetStateAction<string | null>>;
  setShengHuiMainContentEpoch: Dispatch<SetStateAction<number>>;
  rightPanelTab: ShengHuiRightPanelTab;
  rightCollapsed: boolean;
};
