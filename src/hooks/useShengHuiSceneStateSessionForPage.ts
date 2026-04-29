import { useEffect, useMemo } from "react";
import type { SceneStateCard } from "../ai/sheng-hui-generate";
import { shengHuiSceneStateStorageKey } from "../util/sheng-hui-workspace-constants";
import type { Dispatch, SetStateAction } from "react";

function emptySceneState(): SceneStateCard {
  return { location: "", timeOfDay: "", charState: "", tension: "" };
}

/**
 * 切书/切章时从 sessionStorage 读场景卡，并在编辑后回写（按 `workId`+`chapterId` 分桶）。
 */
export function useShengHuiSceneStateSessionForPage(
  workId: string | null,
  chapterId: string | null,
  sceneState: SceneStateCard,
  setSceneState: Dispatch<SetStateAction<SceneStateCard>>,
) {
  const key = useMemo(() => shengHuiSceneStateStorageKey(workId, chapterId), [workId, chapterId]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SceneStateCard>;
        setSceneState({
          location: parsed.location ?? "",
          timeOfDay: parsed.timeOfDay ?? "",
          charState: parsed.charState ?? "",
          tension: parsed.tension ?? "",
        });
      } else {
        setSceneState(emptySceneState());
      }
    } catch {
      setSceneState(emptySceneState());
    }
  }, [key, setSceneState]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(sceneState));
    } catch {
      /* quota */
    }
  }, [key, sceneState]);
}
