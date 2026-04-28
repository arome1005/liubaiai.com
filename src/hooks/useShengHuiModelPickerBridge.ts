import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { saveAiSettings } from "../ai/storage";
import type { AiProviderId, AiSettings } from "../ai/types";

/**
 * 生辉顶栏「换模型」：与 {@link AiPanel} 同 persist（`saveAiSettings`）与 `updateProvider` 语义。
 */
export function useShengHuiModelPickerBridge(setSettings: Dispatch<SetStateAction<AiSettings>>) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const updateSettings = useCallback(
    (patch: Partial<AiSettings>) => {
      setSettings((prev) => {
        const next: AiSettings = { ...prev, ...patch };
        saveAiSettings(next);
        return next;
      });
    },
    [setSettings],
  );

  const updateProvider = useCallback(
    (p: AiProviderId) => {
      updateSettings({ provider: p });
    },
    [updateSettings],
  );

  return { modelPickerOpen, setModelPickerOpen, updateSettings, updateProvider };
}
