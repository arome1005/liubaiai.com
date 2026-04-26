/**
 * 设置页 section 共用 UI 原子（高级风格）。
 *
 * - SCard：章节卡片容器
 * - SHead：章节标题行（title + sub + badge）
 * - SRow：单行设置项（图标 + 标题 + 描述 + 右侧控件）
 * - Toggle：药丸形开关
 * - NAV_ICON_BG：每个 nav 项对应的图标背景色 Tailwind class
 */
import React from "react";
import { cn } from "../../lib/utils";

export const NAV_ICON_BG: Record<string, string> = {
  "settings-appearance": "bg-blue-500",
  "settings-editor":     "bg-emerald-500",
  "settings-export":     "bg-amber-500",
  "settings-privacy":    "bg-rose-500",
  "settings-storage":    "bg-indigo-500",
  "backup-data":         "bg-purple-500",
  "settings-reference":  "bg-orange-500",
  "fiction-creation":    "bg-cyan-500",
  "ai-privacy":          "bg-violet-500",
};

/** 章节卡片容器 */
export function SCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/30 p-5", className)}>
      {children}
    </div>
  );
}

/** 章节标题行 */
export function SHead({
  title,
  sub,
  badge,
}: {
  title: string;
  sub?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {badge}
    </div>
  );
}

/** 单行设置项 — 图标 + 标题 + 描述 + 右侧控件 */
export function SRow({
  iconBg = "bg-muted/60",
  icon,
  title,
  desc,
  children,
}: {
  iconBg?: string;
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/20 bg-background/20 px-3 py-3">
      {icon && (
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white", iconBg)}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        {desc && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** 药丸形开关 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
        checked ? "bg-primary" : "bg-muted",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
