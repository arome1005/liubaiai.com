/**
 * AI 配置 section：
 *  - 当前模型 + 后端高级配置入口
 *  - 超阈值强制验证（3 选 1）
 *  - 进阶防误触（数字确认 / 操作冷却）
 *  - 高级接入（OwnerModeSection）
 *
 * 粗估用量、7 日趋势、成本预算已迁至创作中心「AI 用量洞察」，避免与本页重复。
 */
import { AlertTriangle, Brain, Keyboard, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { OwnerModeSection } from "../../components/OwnerModeSection";
import { saveAiSettings } from "../../ai/storage";
import type { AiProviderConfig, AiSettings } from "../../ai/types";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsAiPrivacySectionProps = {
  aiSettings: AiSettings;
  setAiSettings: (s: AiSettings) => void;
  setMsg: (s: string | null) => void;
  /** 打开高级后端配置前由父级做密码校验 */
  requestOpenBackend: () => void;
  currentEmail: string | null;
};

export function SettingsAiPrivacySection({
  aiSettings,
  setAiSettings,
  setMsg,
  requestOpenBackend,
  currentEmail,
}: SettingsAiPrivacySectionProps) {
  // 当前模型展示
  const pCfg = (aiSettings as unknown as Record<string, AiProviderConfig>)[aiSettings.provider];
  const pLabel = pCfg?.label ?? aiSettings.provider;
  const pModel = pCfg?.model?.trim();

  /** 写回并提示「已保存」 */
  const persist = (next: AiSettings) => {
    setAiSettings(next);
    try {
      saveAiSettings(next);
      setMsg("已保存。");
    } catch {
      setMsg("保存失败。");
    }
  };

  return (
    <div id="ai-privacy" className="space-y-4">
      {/* 当前模型 */}
      <SCard>
        <SRow
          iconBg="bg-violet-500"
          icon={<Brain className="h-4 w-4" />}
          title="当前模型"
          desc={`${pLabel}${pModel ? ` · ${pModel}` : " · 未配置"}`}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={requestOpenBackend}
            title="需密码解锁"
          >
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            配置
          </Button>
        </SRow>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground/60">
          配置存于本机 localStorage。直连第三方模型可能遇到 CORS；Ollama 默认本机 11434 端口通常可用。
        </p>
      </SCard>

      {/* 超阈值验证级别 */}
      <SCard>
        <SHead
          title="超阈值强制验证"
          sub="高危操作（整卷/多章/批量）发起前的确认方式。"
          badge={
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              安全保护
            </span>
          }
        />
        <div className="space-y-2">
          {([
            { value: "off",     label: "关闭",     desc: "不进行任何验证提示" },
            { value: "warn",    label: "仅提示",   desc: "显示消耗预估，用户可选择继续" },
            { value: "confirm", label: "强制确认", desc: "必须通过清单确认才能继续执行" },
          ] as const).map(({ value, label, desc }) => {
            const current = aiSettings.highRiskConfirmMode ?? (aiSettings.highRiskAlwaysConfirm ? "confirm" : "off");
            const active = current === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  persist({
                    ...aiSettings,
                    highRiskConfirmMode: value,
                    highRiskAlwaysConfirm: value === "confirm",
                  })
                }
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all",
                  active ? "border-primary bg-primary/5" : "border-border/20 bg-background/10 hover:border-border/40",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-primary" : "border-border/50",
                  )}
                >
                  {active && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className={cn("text-sm font-medium", active ? "text-primary" : "text-foreground")}>{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                {value === "confirm" && (
                  <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">推荐</span>
                )}
              </button>
            );
          })}
        </div>
      </SCard>

      {/* 进阶防误触 */}
      <SCard>
        <SHead
          title="进阶防误触"
          sub="额外安全机制，增加操作步骤但有效防止意外消耗。"
          badge={<span className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground">可选</span>}
        />
        <div className="space-y-2">
          <SRow
            iconBg="bg-blue-500"
            icon={<Keyboard className="h-4 w-4" />}
            title="数字确认"
            desc="超阈值时需输入屏幕显示的验证码才能继续执行。"
          >
            <Toggle
              checked={!!aiSettings.numericConfirm}
              onChange={(on) => persist({ ...aiSettings, numericConfirm: on })}
            />
          </SRow>
          <SRow
            iconBg="bg-violet-500"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="操作冷却"
            desc="同一高危操作间隔至少 5 秒，防止连续误触。"
          >
            <Toggle
              checked={!!aiSettings.operationCooldown}
              onChange={(on) => persist({ ...aiSettings, operationCooldown: on })}
            />
          </SRow>
        </div>
      </SCard>

      {/* 高级接入 */}
      <OwnerModeSection currentEmail={currentEmail} />
    </div>
  );
}
