import { useCallback } from "react";
import type { AiProviderId, AiSettings } from "../../ai/types";
import { UnifiedAIModelSelector } from "../ai-model-selector-unified";
import { aiProviderToModelId, aiModelIdToProvider } from "../../util/ai-ui-model-map";
import { loadAiSettings } from "../../ai/storage";

export interface AiPanelModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AiSettings;
  /** 写入设置（同 `AiPanel` 的 updateSettings）：含 saveAiSettings 持久化 */
  updateSettings: (patch: Partial<AiSettings>) => void;
  /** 切换当前 provider（确认「使用」时调用） */
  updateProvider: (p: AiProviderId) => void;
}

export function AiPanelModelPickerDialog({
  open,
  onOpenChange,
  settings,
  updateSettings,
}: AiPanelModelPickerDialogProps) {
  const selectedModelId = aiProviderToModelId(settings.provider);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      const provider = aiModelIdToProvider(modelId);
      // UnifiedAIModelSelector directly mutates localStorage for gears/temp
      // Fetch freshest state and pass to parent to avoid stale overwrites
      const freshSettings = loadAiSettings();
      freshSettings.provider = provider;
      updateSettings(freshSettings);
    },
    [updateSettings],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        // Sync any slider adjustments (temp/gear) made in the dialog back to parent state
        updateSettings(loadAiSettings());
      }
    },
    [onOpenChange, updateSettings],
  );

  return (
    <UnifiedAIModelSelector
      open={open}
      onOpenChange={handleOpenChange}
      selectedModelId={selectedModelId}
      onSelectModel={handleSelectModel}
      title="选择模型"
    />
  );
}
