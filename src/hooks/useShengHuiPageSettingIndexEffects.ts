import { useEffect } from "react";
import {
  buildShengHuiSettingIndexText,
  SHENG_HUI_SETTING_INDEX_INJECT_MAX_CHARS,
} from "../util/sheng-hui-setting-index-text";
import type { Dispatch, SetStateAction } from "react";

/**
 * 设定索引注入开关与云端元数据策略联动；在开启时拉取 `buildShengHuiSettingIndexText`。
 */
export function useShengHuiPageSettingIndexEffects(
  workId: string | null,
  canInjectWorkMeta: boolean,
  includeSettingIndex: boolean,
  setIncludeSettingIndex: Dispatch<SetStateAction<boolean>>,
  setSettingIndexText: Dispatch<SetStateAction<string>>,
  setSettingIndexLoading: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!canInjectWorkMeta && includeSettingIndex) setIncludeSettingIndex(false);
  }, [canInjectWorkMeta, includeSettingIndex, setIncludeSettingIndex]);

  useEffect(() => {
    if (!workId || !includeSettingIndex) {
      setSettingIndexText("");
      setSettingIndexLoading(false);
      return;
    }
    setSettingIndexLoading(true);
    const wId = workId;
    void (async () => {
      try {
        const t = await buildShengHuiSettingIndexText(wId, SHENG_HUI_SETTING_INDEX_INJECT_MAX_CHARS);
        setSettingIndexText(t);
      } finally {
        setSettingIndexLoading(false);
      }
    })();
  }, [workId, includeSettingIndex, setSettingIndexText, setSettingIndexLoading]);
}
