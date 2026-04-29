/**
 * AI 配置 section：
 *  - 当前模型 + 后端高级配置入口
 *  - 粗估用量（本会话/今日/本机）
 *  - 成本预算门控
 *  - 7 日趋势
 *  - 超阈值强制验证（3 选 1）
 *  - 进阶防误触（数字确认 / 操作冷却）
 *  - 高级接入（OwnerModeSection）
 */
import { AlertTriangle, Brain, Keyboard, Lock, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { OwnerModeSection } from "../../components/OwnerModeSection";
import { resetLifetimeApproxTokens, resetSessionApproxTokens } from "../../ai/sidepanel-session-tokens";
import { resetTodayApproxTokens } from "../../ai/daily-approx-tokens";
import { saveAiSettings } from "../../ai/storage";
import type { AiProviderConfig, AiSettings } from "../../ai/types";
import { SCard, SHead, SRow, Toggle } from "./_shared";

export type SettingsAiPrivacySectionProps = {
  aiSettings: AiSettings;
  setAiSettings: (s: AiSettings) => void;
  setMsg: (s: string | null) => void;
  /** 打开高级后端配置前由父级做密码校验 */
  requestOpenBackend: () => void;
  /** 用于强制重读 readSessionApproxTokens 等 — section 内 reset 后递增 */
  setSidepanelUsageTick: (fn: (n: number) => number) => void;
  sessionApproxDisplay: number;
  todayApproxDisplay: number;
  lifetimeApproxDisplay: number;
  recentDailyApprox: { date: string; tokens: number }[];
  recentDailyMax: number;
  dailyBudget: number;
  dailyBudgetPct: number;
  currentEmail: string | null;
};

export function SettingsAiPrivacySection({
  aiSettings,
  setAiSettings,
  setMsg,
  requestOpenBackend,
  setSidepanelUsageTick,
  sessionApproxDisplay,
  todayApproxDisplay,
  lifetimeApproxDisplay,
  recentDailyApprox,
  recentDailyMax,
  dailyBudget,
  dailyBudgetPct,
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

      {/* Token 用量统计 */}
      <SCard>
        <SHead
          title="粗估用量"
          sub="按请求与输出粗算，非厂商计费、不会上传。"
          badge={<Zap className="h-4 w-4 text-muted-foreground/40" />}
        />
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "本会话", value: sessionApproxDisplay,  onClear: () => { resetSessionApproxTokens();  setSidepanelUsageTick((n) => n + 1); }, highlight: false },
            { label: "今日累计", value: todayApproxDisplay,  onClear: () => { resetTodayApproxTokens();    setSidepanelUsageTick((n) => n + 1); }, highlight: true  },
            { label: "本机累计", value: lifetimeApproxDisplay, onClear: () => {
              if (!window.confirm("将清零「本机累计」粗估 tokens（仅本机显示，不影响作品数据）。确定？")) return;
              resetLifetimeApproxTokens();
              setSidepanelUsageTick((n) => n + 1);
            }, highlight: false },
          ].map(({ label, value, onClear, highlight }) => (
            <div
              key={label}
              className={cn(
                "relative rounded-xl border p-3",
                highlight ? "border-primary/30 bg-primary/5" : "border-border/30 bg-background/20",
              )}
            >
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={cn("mt-1 text-xl font-bold tabular-nums", highlight ? "text-primary" : "text-foreground")}>
                {value >= 10_000 ? `${(value / 1_000).toFixed(0)}k` : value.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground/60">tokens</p>
              <button
                type="button"
                onClick={onClear}
                className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
              >
                清零
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/50">
          切换标签页自动刷新 · 关闭标签页后「本会话」清零 · 「本机累计」保留至手动清零
        </p>
      </SCard>

      {/* 成本预算门控 */}
      <SCard>
        <SHead
          title="成本预算 · 门控阈值"
          sub="超出后在写作侧栏弹出确认弹窗（可继续，非硬性拦截），数值仅本机记录。"
        />
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">日预算 <span className="opacity-60">（0 = 不限制）</span></span>
              <span className="text-xs font-medium">
                {aiSettings.dailyTokenBudget === 0 ? "不限制" : `${(aiSettings.dailyTokenBudget / 10_000).toFixed(1)}万 tokens`}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1 text-sm"
                min={0}
                max={10_000_000}
                step={10_000}
                value={aiSettings.dailyTokenBudget}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(10_000_000, Math.floor(Number(e.target.value) || 0)));
                  persist({ ...aiSettings, dailyTokenBudget: v });
                }}
              />
              <span className="flex items-center text-xs text-muted-foreground">tokens</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {([0, 50_000, 100_000, 500_000] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    aiSettings.dailyTokenBudget === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60",
                  )}
                  onClick={() => persist({ ...aiSettings, dailyTokenBudget: v })}
                >
                  {v === 0 ? "不限制" : v >= 10_000 ? `${v / 10_000}万` : String(v)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">单次调用预警 <span className="opacity-60">（0 = 不预警）</span></span>
              <span className="text-xs font-medium">
                {aiSettings.singleCallWarnTokens === 0 ? "不预警" : `${(aiSettings.singleCallWarnTokens / 1_000).toFixed(0)}k tokens`}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1 text-sm"
                min={0}
                max={500_000}
                step={1_000}
                value={aiSettings.singleCallWarnTokens}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(500_000, Math.floor(Number(e.target.value) || 0)));
                  persist({ ...aiSettings, singleCallWarnTokens: v });
                }}
              />
              <span className="flex items-center text-xs text-muted-foreground">tokens</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {([0, 5_000, 20_000, 100_000] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    aiSettings.singleCallWarnTokens === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 text-muted-foreground hover:border-border/60",
                  )}
                  onClick={() => persist({ ...aiSettings, singleCallWarnTokens: v })}
                >
                  {v === 0 ? "不预警" : v >= 10_000 ? `${v / 10_000}万` : `${v / 1_000}k`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SCard>

      {/* 预算趋势 */}
      <SCard>
        <SHead title="最近 7 天趋势" sub="日累计粗估 tokens，不上传，帮助感知消耗节奏。" />
        {dailyBudget > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">今日占用</span>
              <span className={cn("font-medium", todayApproxDisplay > dailyBudget ? "text-destructive" : "text-foreground")}>
                {todayApproxDisplay.toLocaleString()} / {dailyBudget.toLocaleString()} tokens（{Math.round(dailyBudgetPct)}%）
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className={cn("h-full rounded-full transition-all", todayApproxDisplay > dailyBudget ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(100, dailyBudgetPct)}%` }}
              />
            </div>
          </div>
        )}
        <div className="relative">
          {dailyBudget > 0 && recentDailyMax > 0 && (
            <div
              className="ai-bar-budget-line"
              style={{ bottom: `calc(1.4rem + ${Math.min(52, Math.round((dailyBudget / recentDailyMax) * 52))}px)` }}
            />
          )}
          <div className="grid grid-cols-7 gap-1.5" style={{ alignItems: "end" }}>
            {recentDailyApprox.map((d) => {
              const h = Math.max(2, Math.round((d.tokens / recentDailyMax) * 52));
              const isToday = d.date === recentDailyApprox[recentDailyApprox.length - 1]!.date;
              const isOver = dailyBudget > 0 && d.tokens > dailyBudget;
              return (
                <div key={d.date} className="flex flex-col gap-1">
                  <div
                    title={`${d.date}：${d.tokens.toLocaleString()} tokens`}
                    className="flex items-end overflow-hidden rounded-md border border-border/30 bg-card/40"
                    style={{ height: 56 }}
                  >
                    <div
                      className="w-full transition-all"
                      style={{
                        height: h,
                        background: isOver
                          ? "var(--destructive)"
                          : isToday
                            ? "var(--primary)"
                            : "color-mix(in oklab, var(--muted-foreground) 22%, transparent)",
                        opacity: isToday || isOver ? 0.9 : 0.7,
                      }}
                    />
                  </div>
                  <p className="text-center text-[9px] text-muted-foreground/60">{d.date.slice(5)}</p>
                </div>
              );
            })}
          </div>
        </div>
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
