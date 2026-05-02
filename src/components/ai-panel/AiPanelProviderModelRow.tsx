import { Bot } from "lucide-react";
import type { AiSettings } from "../../ai/types";
import { PROVIDER_UI, providerLogoImgSrc } from "./provider-ui";

/** 侧栏「AI 模型」行：标签贴左，当前人设/模型按钮在栏内水平居中（见 liubai-react-structure：AI 侧栏 UI 落在 ai-panel/） */
export function AiPanelProviderModelRow(props: {
  settings: AiSettings;
  onOpenPicker: () => void;
}) {
  const { settings, onOpenPicker } = props;
  const logoSrc = providerLogoImgSrc(settings.provider);
  const label = PROVIDER_UI[settings.provider]?.label ?? settings.provider;

  return (
    <section className="ai-panel-section ai-panel-section--flat" aria-label="AI 模型选择">
      <div className="relative w-full px-0.5 py-1">
        <span className="absolute left-0.5 top-1/2 z-0 flex -translate-y-1/2 items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground/70">
          <Bot className="h-3 w-3 shrink-0" />
          AI模型
        </span>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onOpenPicker}
            className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" />
              ) : null}
              <span className="font-semibold text-foreground">{label}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
