/**
 * 后端模型高级配置弹窗的共用 UI 原子（"高级风格"）。
 *
 * - BCard：卡片容器
 * - BHead：卡片标题行（title + sub）
 * - BField：字段组（label + control + hint）
 * - TestBadge：测试状态药丸（testing / ok / err）
 * - HealthTable：批量测试结果表（model 名 + ✓/✗）
 * - EyeToggle：API Key 显示/隐藏切换按钮
 */
import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";

export function BCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/40 bg-card/30 p-4", className)}>
      {children}
    </div>
  );
}

export function BHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function BField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function TestBadge({ status, message }: { status: string; message?: string }) {
  if (status === "testing") return <span className="text-xs text-muted-foreground">测试中…</span>;
  if (status === "ok") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500">
        {message ?? "可用"}
      </span>
    );
  }
  if (status === "err") {
    return (
      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        {message ?? "失败"}
      </span>
    );
  }
  return null;
}

export function HealthTable({
  models,
  health,
  dirty,
}: {
  models: string[];
  health: Record<string, { verdict: string }>;
  dirty: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">可用版本（测试结果）</span>
        <span className={cn("text-[10px]", dirty ? "text-amber-500" : "text-muted-foreground/50")}>
          {dirty ? "未保存" : "已保存"}
        </span>
      </div>
      <div className="space-y-1">
        {models.map((m) => {
          const r = health[m];
          return (
            <div key={m} className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{m}</span>
              <span
                className={cn(
                  "text-xs",
                  r?.verdict === "ok"
                    ? "text-emerald-500"
                    : r?.verdict === "err"
                      ? "text-destructive"
                      : "text-muted-foreground/40",
                )}
              >
                {r?.verdict === "ok" ? "✓" : r?.verdict === "err" ? "✗" : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/50">
        点「测试」或「一键测试」后更新；「保存」后持久记录。
      </p>
    </div>
  );
}

export function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={shown ? "隐藏" : "显示"}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}
