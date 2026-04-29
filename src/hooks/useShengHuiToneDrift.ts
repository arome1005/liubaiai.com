import { useMemo } from "react";
import { useAiPanelToneDrift } from "../components/ai-panel/useAiPanelToneDrift";
import { getProviderConfig } from "../ai/storage";
import { workStyleCardToWritingSlice } from "../util/work-style-card-to-slice";
import type { WorkStyleCard } from "../db/types";
import type { AiSettings } from "../ai/types";

type Args = {
  settings: AiSettings;
  cloudAllowed: boolean;
  styleCard: WorkStyleCard | undefined;
  /** 主章仿写主生成流式中：不向侧栏调性传实时 output，避免 embedding 在流式中反复触发 */
  mainBusy: boolean;
  output: string;
};

/**
 * N4：与写作侧栏同源的 `useAiPanelToneDrift`；笔感卡来自 `workStyleCardToWritingSlice`。
 */
export function useShengHuiToneDrift(args: Args) {
  const { settings, cloudAllowed, styleCard, mainBusy, output } = args;
  const ws = useMemo(() => workStyleCardToWritingSlice(styleCard), [styleCard]);
  const providerCfg = useMemo(
    () => getProviderConfig(settings, settings.provider),
    [settings],
  );
  const draft = mainBusy ? "" : output;

  return useAiPanelToneDrift({
    toneDriftHintEnabled: settings.toneDriftHintEnabled,
    cloudAllowed,
    provider: settings.provider,
    providerCfg,
    bannedPhrases: ws.bannedPhrases,
    styleAnchor: ws.styleAnchor,
    draft,
  });
}
