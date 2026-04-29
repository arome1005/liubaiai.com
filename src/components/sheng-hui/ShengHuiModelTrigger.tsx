import { Bot } from "lucide-react";
import type { AiSettings } from "../../ai/types";
import { getProviderConfig } from "../../ai/storage";
import { PROVIDER_UI, providerLogoImgSrc } from "../ai-panel/provider-ui";
import { shengHuiModelMetricLine } from "../../util/sheng-hui-ui-display";
import { cn } from "../../lib/utils";

export function ShengHuiModelTrigger(props: {
  settings: AiSettings;
  onOpen: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { settings, onOpen, disabled, className } = props;
  const logoSrc = providerLogoImgSrc(settings.provider);
  const label = PROVIDER_UI[settings.provider]?.label ?? settings.provider;
  const metric = shengHuiModelMetricLine(settings.provider);
  // model / modelDisplayName 在 AiProviderConfig 上而非 AiSettings 顶层；走 getProviderConfig 拿当前 provider 的配置。
  const cfg = getProviderConfig(settings, settings.provider);
  const modelId = cfg.modelDisplayName?.trim() || cfg.model?.trim() || "";
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      title="选择模型（与写作页 AI 侧栏相同）"
      className={cn(
        "inline-flex min-h-8 max-w-[min(100%,15rem)] items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1 text-left text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
      {logoSrc ? <img src={logoSrc} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-foreground" title={label}>
          {label}
        </span>
        {modelId ? (
          <span className="block truncate font-mono text-[8px] font-normal leading-tight text-muted-foreground/70" title="当前模型 id">
            {modelId}
          </span>
        ) : null}
        {metric ? (
          <span className="block truncate text-[9px] font-normal leading-tight text-muted-foreground/80">{metric}</span>
        ) : null}
      </span>
      <span className="shrink-0 self-center text-[10px] text-muted-foreground/75">换</span>
    </button>
  );
}
