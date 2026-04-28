import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { ShengHuiRightPanelTab } from "./sheng-hui-right-panel-types";

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
  compose: ReactNode;
  materials: ReactNode;
  versions: ReactNode;
  help: ReactNode;
}) {
  const { activeTab, onTabChange, collapsed, onCollapsedChange, compose, materials, versions, help } = props;

  return (
    <aside
      className={cn(
        "order-3 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-sm backdrop-blur-sm lg:min-w-[20rem]",
        props.className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/40 bg-card/30 px-2 py-1.5">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium",
              activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "展开右侧面板" : "收起右侧面板"}
        >
          {collapsed ? "展开" : "收起"}
        </button>
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
