import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { ShengHuiRightPanelTab } from "./sheng-hui-right-panel-types";
import { ShengHuiTokenBudgetRing } from "./ShengHuiTokenBudgetRing";

const TABS: { id: ShengHuiRightPanelTab; label: string }[] = [
  { id: "compose", label: "仿写" },
  { id: "materials", label: "素材" },
  { id: "versions", label: "版本" },
  { id: "help", label: "说明" },
];

export function ShengHuiRightPanel(props: {
  className?: string;
  activeTab: ShengHuiRightPanelTab;
  onTabChange: (t: ShengHuiRightPanelTab) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  /** 最近一次粗估，用于条带示意。 */
  inputApprox: number | null;
  outputEstimateApprox: number | null;
  compose: ReactNode;
  materials: ReactNode;
  versions: ReactNode;
  help: ReactNode;
}) {
  const { activeTab, onTabChange, collapsed, onCollapsedChange, inputApprox, outputEstimateApprox, compose, materials, versions, help } =
    props;

  return (
    <aside
      className={cn(
        "sheng-hui-glass-panel order-3 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-card/65 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.28)] backdrop-blur-md lg:min-w-[20rem]",
        props.className,
      )}
    >
      <div className="h-0.5 shrink-0 rounded-t-2xl bg-gradient-to-r from-chart-1/50 via-primary/30 to-chart-2/40" aria-hidden />
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border/40 bg-card/25 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2">
        <ShengHuiTokenBudgetRing
          className="shrink-0 border-0 bg-transparent p-0 sm:max-w-[9rem]"
          inputApprox={inputApprox}
          outputEstimateApprox={outputEstimateApprox}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:justify-end">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-medium",
                activeTab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              onClick={() => onTabChange(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent sm:ml-0"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? "展开右侧面板" : "收起右侧面板"}
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {collapsed ? (
        <p className="shrink-0 px-3 py-2 text-[11px] text-muted-foreground/60">右侧面板已收起</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3">
          {activeTab === "compose" ? compose : null}
          {activeTab === "materials" ? materials : null}
          {activeTab === "versions" ? versions : null}
          {activeTab === "help" ? help : null}
        </div>
      )}
    </aside>
  );
}
