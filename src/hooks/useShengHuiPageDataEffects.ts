import type { ShengHuiPageDataEffectArgs } from "./sheng-hui-page-data-effect-args";
import { useShengHuiChaptersOnWorkId } from "./useShengHuiChaptersOnWorkId";
import { useShengHuiInitialWorkListLoad } from "./useShengHuiInitialWorkListLoad";
import { useShengHuiOutlineSessionForPage } from "./useShengHuiOutlineSessionForPage";
import { useShengHuiPageSettingIndexEffects } from "./useShengHuiPageSettingIndexEffects";
import { useShengHuiRightPanelLocalStorageSync } from "./useShengHuiRightPanelLocalStorageSync";
import { useShengHuiSceneStateSessionForPage } from "./useShengHuiSceneStateSessionForPage";
import { useShengHuiSnapshotBucketOnTargetChange } from "./useShengHuiSnapshotBucketOnTargetChange";
import { useShengHuiWorkAndStyleOnWorkId } from "./useShengHuiWorkAndStyleOnWorkId";

export type { ShengHuiPageDataEffectArgs } from "./sheng-hui-page-data-effect-args";

/**
 * 生辉页数据与持久化相关副作用的编排入口；具体逻辑见各子 hook，便于单测与按需调整顺序。
 */
export function useShengHuiPageDataEffects(a: ShengHuiPageDataEffectArgs) {
  const {
    refreshWorks,
    workId,
    chapterId,
    setWork,
    setStyleCard,
    setChapters,
    setChapterId,
    setWorkId,
    setLoading,
    loading,
    outline,
    outlineHydrated,
    setOutline,
    setOutlineHydrated,
    canInjectWorkMeta,
    includeSettingIndex,
    setIncludeSettingIndex,
    setSettingIndexText,
    setSettingIndexLoading,
    sceneState,
    setSceneState,
    setSnapshotBucket,
    setOutput,
    setSelectedSnapshotId,
    setShengHuiMainContentEpoch,
    rightPanelTab,
    rightCollapsed,
  } = a;

  useShengHuiInitialWorkListLoad(refreshWorks, setWorkId, setLoading);
  useShengHuiWorkAndStyleOnWorkId(workId, setWork, setStyleCard);
  useShengHuiChaptersOnWorkId(workId, setChapters, setChapterId);
  useShengHuiOutlineSessionForPage(
    workId,
    loading,
    outline,
    outlineHydrated,
    setOutline,
    setOutlineHydrated,
  );
  useShengHuiPageSettingIndexEffects(
    workId,
    canInjectWorkMeta,
    includeSettingIndex,
    setIncludeSettingIndex,
    setSettingIndexText,
    setSettingIndexLoading,
  );
  useShengHuiSceneStateSessionForPage(workId, chapterId, sceneState, setSceneState);
  useShengHuiSnapshotBucketOnTargetChange(
    workId,
    chapterId,
    setSnapshotBucket,
    setOutput,
    setSelectedSnapshotId,
    setShengHuiMainContentEpoch,
  );
  useShengHuiRightPanelLocalStorageSync(rightPanelTab, rightCollapsed);
}
